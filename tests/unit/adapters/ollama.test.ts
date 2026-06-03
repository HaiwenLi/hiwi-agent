import { OllamaAdapter } from "@/adapters/ollama.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("OllamaAdapter", () => {
  let adapter: OllamaAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434", model: "qwen3.6" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: unknown): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });
  }

  it("returns text response from Ollama", async () => {
    mockFetch({
      message: { role: "assistant", content: "Hello from Ollama!" },
      done: true,
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const resp = await adapter.chat([{ role: "user", content: "hi" }]);
    expect(resp.content).toBe("Hello from Ollama!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it("handles tool calls from Ollama", async () => {
    mockFetch({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: { name: "read_file", arguments: { path: "/tmp" } },
          },
        ],
      },
      done: true,
      prompt_eval_count: 15,
      eval_count: 10,
    });

    const resp = await adapter.chat([{ role: "user", content: "read" }]);
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0].name).toBe("read_file");
    expect(resp.toolCalls[0].input).toEqual({ path: "/tmp" });
  });

  it("reports capabilities for known models", () => {
    expect(adapter.id).toBe("qwen3.6");
    expect(adapter.provider).toBe("ollama");
    expect(adapter.capabilities.tools).toBe(true);
  });

  it("uses default capabilities for unknown models", () => {
    const custom = new OllamaAdapter({ baseUrl: "http://localhost:11434", model: "custom-model" });
    expect(custom.capabilities.contextWindow).toBe(8192);
  });

  it("throws on connection error with descriptive message", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    await expect(adapter.chat([{ role: "user", content: "hi" }])).rejects.toThrow("Ollama");
  });
});
