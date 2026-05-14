import { MockAdapter, type MockResponse } from "@/adapters/mock.js";
import { describe, expect, it } from "vitest";

describe("MockAdapter", () => {
  it("returns predefined text response", async () => {
    const mock = new MockAdapter([{ content: "Hello!", toolCalls: [], finishReason: "stop" }]);
    const resp = await mock.chat([{ role: "user", content: "hi" }]);
    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
  });

  it("returns responses in sequence, then repeats last", async () => {
    const mock = new MockAdapter([
      { content: "first", toolCalls: [], finishReason: "stop" },
      { content: "second", toolCalls: [], finishReason: "stop" },
    ]);
    const r1 = await mock.chat([{ role: "user", content: "a" }]);
    const r2 = await mock.chat([{ role: "user", content: "b" }]);
    const r3 = await mock.chat([{ role: "user", content: "c" }]);
    expect(r1.content).toBe("first");
    expect(r2.content).toBe("second");
    expect(r3.content).toBe("second"); // repeats last
  });

  it("returns tool calls", async () => {
    const mock = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/a" } }],
        finishReason: "tool-calls",
      },
    ]);
    const resp = await mock.chat([{ role: "user", content: "read file" }]);
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0].name).toBe("read_file");
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("streams text as text-delta chunks", async () => {
    const mock = new MockAdapter([{ content: "Hello World", toolCalls: [], finishReason: "stop" }]);
    const chunks: string[] = [];
    for await (const chunk of mock.stream([{ role: "user", content: "hi" }])) {
      if (chunk.type === "text-delta" && chunk.text) {
        chunks.push(chunk.text);
      }
    }
    expect(chunks.join("")).toBe("Hello World");
  });

  it("reports capabilities", () => {
    const mock = new MockAdapter([], {
      id: "test-model",
      provider: "test",
      capabilities: { tools: true, vision: false, maxTokens: 4096, contextWindow: 8192 },
    });
    expect(mock.id).toBe("test-model");
    expect(mock.provider).toBe("test");
    expect(mock.capabilities.tools).toBe(true);
  });

  it("tracks usage (incrementing token counts)", async () => {
    const mock = new MockAdapter([{ content: "Hi", toolCalls: [], finishReason: "stop" }]);
    const resp = await mock.chat([{ role: "user", content: "hello" }]);
    expect(resp.usage.inputTokens).toBeGreaterThan(0);
    expect(resp.usage.outputTokens).toBeGreaterThan(0);
  });
});
