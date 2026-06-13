import { OllamaAdapter } from "@/adapters/ollama.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let originalFetch: typeof globalThis.fetch;
let adapter: OllamaAdapter;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434", model: "qwen3.6" });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createMockStreamBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function mockStreamFetch(bodyChunks: string[]): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    body: createMockStreamBody(bodyChunks),
    status: 200,
  });
}

async function collectStream(
  messages: Array<{ role: string; content: string }> = [{ role: "user", content: "hi" }],
) {
  const chunks = [];
  for await (const chunk of adapter.stream(
    messages as any,
  )) {
    chunks.push(chunk);
  }
  return chunks;
}

// ─── NDJSON parsing ────────────────────────────────────────────

describe("OllamaAdapter streaming", () => {
  it("complete NDJSON lines are parsed", async () => {
    mockStreamFetch([
      `{"message":{"content":"hello"}}\n{"message":{"content":" world"}}\n{"done":true,"prompt_eval_count":10,"eval_count":5}\n`,
    ]);

    const chunks = await collectStream();

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "text-delta", text: "hello" });
    expect(chunks[1]).toEqual({ type: "text-delta", text: " world" });
    expect(chunks[2].type).toBe("finish");
    expect(chunks[2].usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    });
  });

  it("partial line buffered across chunks", async () => {
    mockStreamFetch([
      `{"message":{"content":"hel`,
      `lo"}}\n{"done":true,"prompt_eval_count":10,"eval_count":5}\n`,
    ]);

    const chunks = await collectStream();

    // "hello" is only emitted once the line is completed by the second chunk
    const textChunks = chunks.filter((c) => c.type === "text-delta");
    expect(textChunks).toEqual([{ type: "text-delta", text: "hello" }]);

    const finishChunks = chunks.filter((c) => c.type === "finish");
    expect(finishChunks).toHaveLength(1);
    expect(finishChunks[0].usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  it("empty lines are skipped", async () => {
    mockStreamFetch([
      `\n\n{"message":{"content":"data"}}\n\n\n{"done":true,"prompt_eval_count":10,"eval_count":5}\n`,
    ]);

    const chunks = await collectStream();

    // Only text-delta + finish, no extra chunks from empty lines
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ type: "text-delta", text: "data" });
    expect(chunks[1].type).toBe("finish");
  });

  // ─── done=true handling ─────────────────────────────────────────

  it("done=true yields finish chunk with usage", async () => {
    mockStreamFetch([
      `{"message":{"content":"done"},"done":true,"prompt_eval_count":20,"eval_count":8}\n`,
    ]);

    const chunks = await collectStream();

    const finishChunks = chunks.filter((c) => c.type === "finish");
    expect(finishChunks).toHaveLength(1);
    expect(finishChunks[0]).toMatchObject({
      finishReason: "stop",
      usage: {
        inputTokens: 20,
        outputTokens: 8,
        totalTokens: 28,
      },
    });
  });

  it("done=true with tool calls yields tool-calls before finish", async () => {
    mockStreamFetch([
      `{"message":{"tool_calls":[{"function":{"name":"read_file","arguments":{"path":"/tmp"}}}]}}\n`,
      `{"done":true,"prompt_eval_count":15,"eval_count":10}\n`,
    ]);

    const chunks = await collectStream();

    // Should have tool-call then finish
    const toolCallChunks = chunks.filter((c) => c.type === "tool-call");
    const finishChunks = chunks.filter((c) => c.type === "finish");

    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].toolCall.name).toBe("read_file");
    expect(toolCallChunks[0].toolCall.input).toEqual({ path: "/tmp" });

    expect(finishChunks).toHaveLength(1);
    expect(finishChunks[0].finishReason).toBe("tool-calls");
    // tool-call must come before finish
    expect(chunks.indexOf(toolCallChunks[0])).toBeLessThan(chunks.indexOf(finishChunks[0]));
  });

  // ─── Tool call accumulation ──────────────────────────────────────

  it("single tool call accumulated and emitted", async () => {
    mockStreamFetch([
      `{"message":{"tool_calls":[{"function":{"name":"read_file","arguments":{"path":"/tmp"}}}]}}\n`,
      `{"done":true,"prompt_eval_count":10,"eval_count":5}\n`,
    ]);

    const chunks = await collectStream();

    const toolCallChunks = chunks.filter((c) => c.type === "tool-call");
    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].toolCall).toMatchObject({
      name: "read_file",
      input: { path: "/tmp" },
    });
    // Should have a generated id
    expect(toolCallChunks[0].toolCall.id).toMatch(/^ollama-tc-/);
  });

  it("multiple tool calls accumulate independently", async () => {
    mockStreamFetch([
      `{"message":{"tool_calls":[{"function":{"name":"read_file","arguments":{"path":"/a"}}},{"function":{"name":"bash","arguments":{"command":"ls"}}}]}}\n`,
      `{"done":true,"prompt_eval_count":12,"eval_count":8}\n`,
    ]);

    const chunks = await collectStream();

    const toolCallChunks = chunks.filter((c) => c.type === "tool-call");
    expect(toolCallChunks).toHaveLength(2);

    expect(toolCallChunks[0].toolCall.name).toBe("read_file");
    expect(toolCallChunks[0].toolCall.input).toEqual({ path: "/a" });

    expect(toolCallChunks[1].toolCall.name).toBe("bash");
    expect(toolCallChunks[1].toolCall.input).toEqual({ command: "ls" });

    const finishChunks = chunks.filter((c) => c.type === "finish");
    expect(finishChunks[0].finishReason).toBe("tool-calls");
  });

  it("tool call arguments merged (object merge)", async () => {
    mockStreamFetch([
      `{"message":{"tool_calls":[{"function":{"name":"read_file","arguments":{"path":"/tmp"}}}]}}\n`,
      `{"message":{"tool_calls":[{"function":{"arguments":{"encoding":"utf8"}}}]}}\n`,
      `{"done":true,"prompt_eval_count":10,"eval_count":5}\n`,
    ]);

    const chunks = await collectStream();

    const toolCallChunks = chunks.filter((c) => c.type === "tool-call");
    expect(toolCallChunks).toHaveLength(1);
    expect(toolCallChunks[0].toolCall.input).toEqual({
      path: "/tmp",
      encoding: "utf8",
    });
  });

  // ─── Remaining buffer processing ─────────────────────────────────

  it("remaining buffer processed after stream ends", async () => {
    // No trailing newline — the ReadableStream closes with data still in buffer
    mockStreamFetch([
      `{"done":true,"prompt_eval_count":10,"eval_count":5}`,
    ]);

    const chunks = await collectStream();

    const finishChunks = chunks.filter((c) => c.type === "finish");
    expect(finishChunks).toHaveLength(1);
    expect(finishChunks[0]).toMatchObject({
      finishReason: "stop",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
      },
    });
  });

  // ─── Reasoning content ───────────────────────────────────────────

  it("reasoning content yielded as reasoning-delta", async () => {
    mockStreamFetch([
      `{"message":{"reasoning_content":"thinking..."}}\n`,
      `{"message":{"content":"answer"}}\n`,
      `{"done":true,"prompt_eval_count":10,"eval_count":5}\n`,
    ]);

    const chunks = await collectStream();

    expect(chunks[0]).toEqual({ type: "reasoning-delta", text: "thinking..." });
    expect(chunks[1]).toEqual({ type: "text-delta", text: "answer" });
    expect(chunks[2].type).toBe("finish");
  });

  // ─── getUsage() after stream ─────────────────────────────────────

  it("getUsage() returns last usage after streaming", async () => {
    mockStreamFetch([
      `{"message":{"content":"hi"}}\n`,
      `{"done":true,"prompt_eval_count":30,"eval_count":12}\n`,
    ]);

    await collectStream();

    const usage = adapter.getUsage();
    expect(usage).toBeDefined();
    expect(usage!.inputTokens).toBe(30);
    expect(usage!.outputTokens).toBe(12);
    expect(usage!.totalTokens).toBe(42);
    expect(usage!.modelName).toBe("qwen3.6");
    expect(usage!.provider).toBe("ollama");
    expect(usage!.contextWindow).toBeGreaterThan(0);
  });

  // ─── Error handling ──────────────────────────────────────────────

  it("non-ok response throws error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      body: null,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(collectStream()).rejects.toThrow(/Ollama/i);
  });
});
