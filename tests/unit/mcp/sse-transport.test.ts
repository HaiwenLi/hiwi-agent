import { type JSONRPCMessage, SSETransport } from "@/mcp/sse-transport.js";
import { afterEach, describe, expect, it } from "vitest";

describe("SSETransport", () => {
  let transport: SSETransport;

  afterEach(async () => {
    try {
      await transport?.stop();
    } catch {
      // ignore stop errors in cleanup
    }
  });

  it("starts and stops the server cleanly", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: { ok: true },
    }));
    expect(transport.getPort()).toBeGreaterThan(0);
    await transport.stop();
  });

  it("serves SSE endpoint with endpoint event", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: { ok: true },
    }));

    const port = transport.getPort();
    const response = await fetch(`http://localhost:${port}/sse`);
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    // Read first SSE event (should be the endpoint event)
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!buffer.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value);
    }
    reader.releaseLock();

    expect(buffer).toContain("event: endpoint");
    expect(buffer).toContain("data:");
  });

  it("accepts JSON-RPC requests via POST /message", async () => {
    let received: JSONRPCMessage | null = null;

    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => {
      received = msg;
      return { jsonrpc: "2.0", id: msg.id!, result: { echoed: true } };
    });

    const port = transport.getPort();
    const reqBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    const response = await fetch(`http://localhost:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: reqBody,
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result).toEqual({ echoed: true });
    expect(received?.method).toBe("tools/list");
  });

  it("handles JSON-RPC errors properly", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async () => ({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Internal error" },
    }));

    const port = transport.getPort();
    const response = await fetch(`http://localhost:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "bad/method", params: {} }),
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.error.code).toBe(-32603);
  });

  it("handles handler throwing an error", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async () => {
      throw new Error("Handler crash");
    });

    const port = transport.getPort();
    const response = await fetch(`http://localhost:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "boom", params: {} }),
    });

    expect(response.ok).toBe(true);
    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("Handler crash");
  });

  it("returns 400 for invalid JSON body", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: {},
    }));

    const port = transport.getPort();
    const response = await fetch(`http://localhost:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 for non-JSON-RPC message", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: {},
    }));

    const port = transport.getPort();
    const response = await fetch(`http://localhost:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });

    expect(response.status).toBe(400);
  });

  it("supports multiple concurrent SSE clients", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: {},
    }));

    const port = transport.getPort();

    // Open two SSE connections
    const [res1, res2] = await Promise.all([
      fetch(`http://localhost:${port}/sse?session=s1`),
      fetch(`http://localhost:${port}/sse?session=s2`),
    ]);

    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    expect(res1.headers.get("content-type")).toContain("text/event-stream");
    expect(res2.headers.get("content-type")).toContain("text/event-stream");
  });

  it("rejects non-JSON-RPC requests with 400", async () => {
    transport = new SSETransport({ port: 0 });
    await transport.start(async (msg) => ({
      jsonrpc: "2.0",
      id: msg.id ?? null,
      result: {},
    }));

    const port = transport.getPort();
    const response = await fetch(`http://localhost:${port}/unknown`, {
      method: "GET",
    });

    expect(response.status).toBe(404);
  });
});
