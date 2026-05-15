import { MCPServer } from "@/mcp/server.js";
import type { MCPToolContext } from "@/mcp/tools.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(() => ({ connect: vi.fn() })),
}));

describe("MCPServer", () => {
  let ctx: MCPToolContext;
  let server: MCPServer;

  beforeEach(() => {
    ctx = {
      memoryManager: {
        recall: vi.fn(async () => ({ isOk: () => true, value: [] })),
        remember: vi.fn(async () => ({ isOk: () => true })),
        getSystemContext: vi.fn(async () => ""),
      } as any,
      skillRegistry: {
        list: vi.fn(() => []),
        getByTrigger: vi.fn(() => null),
      } as any,
      providerRegistry: {
        listModels: vi.fn(() => []),
        getActiveProvider: vi.fn(() => "anthropic"),
        getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({ isOk: () => true, value: { events: [] } })),
      } as any,
    };
  });

  afterEach(async () => {
    await server?.stop();
  });

  it("creates server with tool context", () => {
    server = new MCPServer(ctx);
    expect(server).toBeDefined();
  });

  it("registers tools from context", () => {
    server = new MCPServer(ctx);
    const tools = server.getRegisteredTools();
    expect(tools).toHaveLength(6);
  });

  it("creates with stdio transport mode", () => {
    server = new MCPServer(ctx, { transport: "stdio" });
    expect(server.getTransportMode()).toBe("stdio");
  });

  it("creates with SSE transport mode", () => {
    server = new MCPServer(ctx, { transport: "sse", port: 3000 });
    expect(server.getTransportMode()).toBe("sse");
    expect(server.getPort()).toBe(3000);
  });

  it("starts SSE server and responds to tools/list", async () => {
    server = new MCPServer(ctx, { transport: "sse", port: 0 });
    await server.start();

    const port = server.getPort();
    expect(port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    const body = await response.json();
    expect(body.result.tools).toBeDefined();
    expect(body.result.tools.length).toBe(6);
  });

  it("starts SSE server and responds to tools/call", async () => {
    server = new MCPServer(ctx, { transport: "sse", port: 0 });
    await server.start();

    const port = server.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "model_list", arguments: {} },
      }),
    });

    const body = await response.json();
    expect(body.id).toBe(2);
    expect(body.result).toBeDefined();
  });

  it("returns error for unknown tool in tools/call", async () => {
    server = new MCPServer(ctx, { transport: "sse", port: 0 });
    await server.start();

    const port = server.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "nonexistent_tool", arguments: {} },
      }),
    });

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("Unknown tool");
  });

  it("returns error for unknown method", async () => {
    server = new MCPServer(ctx, { transport: "sse", port: 0 });
    await server.start();

    const port = server.getPort();
    const response = await fetch(`http://127.0.0.1:${port}/message`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "unknown/method",
        params: {},
      }),
    });

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32601);
  });

  it("stops SSE server cleanly", async () => {
    server = new MCPServer(ctx, { transport: "sse", port: 0 });
    await server.start();
    const port = server.getPort();

    await server.stop();

    // Connection should be refused after stop
    let fetchError = false;
    try {
      await fetch(`http://127.0.0.1:${port}/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      fetchError = true;
    }
    expect(fetchError).toBe(true);
  });
});
