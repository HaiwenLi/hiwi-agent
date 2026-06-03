import { MINIMAX_MODELS, MiniMaxAdapter } from "@/adapters/minimax.js";
import type { Message } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MiniMaxAdapter", () => {
  let adapter: MiniMaxAdapter;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    adapter = new MiniMaxAdapter({ apiKey: "test-key", groupId: "test-group" });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("has correct id and provider", () => {
    expect(adapter.id).toBe("MiniMax-M3");
    expect(adapter.provider).toBe("minimax");
  });

  it("reports correct capabilities for MiniMax-M3", () => {
    expect(adapter.capabilities.tools).toBe(true);
    expect(adapter.capabilities.contextWindow).toBe(1_000_000);
    expect(adapter.capabilities.maxTokens).toBe(64_000);
  });

  it("sends chat request in OpenAI-compatible format", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "Hello from MiniMax!" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const response = await adapter.chat(messages);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("minimaxi.com/v1/chat/completions");
    const headers = (opts as any).headers;
    expect(headers["Authorization"]).toContain("test-key");
    expect(response.content).toBe("Hello from MiniMax!");
    expect(response.finishReason).toBe("stop");
    expect(response.usage.inputTokens).toBe(10);
    expect(response.usage.outputTokens).toBe(5);
  });

  it("parses tool calls from response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "tc-1",
                  type: "function",
                  function: { name: "read_file", arguments: '{"path":"/test.ts"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10 },
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Read test.ts" }];
    const response = await adapter.chat(messages);

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe("read_file");
    expect(response.toolCalls[0].input).toEqual({ path: "/test.ts" });
    expect(response.finishReason).toBe("tool-calls");
  });

  it("handles missing group ID gracefully", async () => {
    const noGroupAdapter = new MiniMaxAdapter({ apiKey: "key" });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }],
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const response = await noGroupAdapter.chat(messages);
    expect(response.content).toBe("OK");
  });

  it("handles rate limit error", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: async () => ({ error: { message: "Rate limited" } }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];

    await expect(adapter.chat(messages)).rejects.toThrow();
  });

  it("MINIMAX_MODELS has expected entries", () => {
    expect(MINIMAX_MODELS["MiniMax-M3"].tools).toBe(true);
    expect(MINIMAX_MODELS["MiniMax-M3"].contextWindow).toBe(1_000_000);
    expect(MINIMAX_MODELS["MiniMax-M2.7"].tools).toBe(true);
    expect(MINIMAX_MODELS["MiniMax-M2.5"].vision).toBe(true);
    expect(MINIMAX_MODELS["MiniMax-M2.1"].contextWindow).toBe(200_000);
    expect(MINIMAX_MODELS["MiniMax-M2"].maxTokens).toBe(8_192);
  });
});
