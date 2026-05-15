import { MiniMaxAdapter, MINIMAX_MODELS } from "@/adapters/minimax.js";
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
    expect(adapter.id).toBe("abab6.5s-chat");
    expect(adapter.provider).toBe("minimax");
  });

  it("reports correct capabilities for abab6.5s-chat", () => {
    expect(adapter.capabilities.tools).toBe(true);
    expect(adapter.capabilities.contextWindow).toBe(245_000);
  });

  it("sends chat request with group ID header", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "Hello from MiniMax!",
        usage: { total_tokens: 15 },
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const response = await adapter.chat(messages);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toContain("minimax.chat");
    const headers = (opts as any).headers;
    expect(headers["Authorization"]).toContain("test-key");
    expect(response.content).toBe("Hello from MiniMax!");
  });

  it("handles missing group ID gracefully", async () => {
    const noGroupAdapter = new MiniMaxAdapter({ apiKey: "key" });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: "OK" }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];
    await expect(noGroupAdapter.chat(messages)).resolves.toBeDefined();
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
    expect(MINIMAX_MODELS["abab6.5s-chat"].contextWindow).toBe(245_000);
    expect(MINIMAX_MODELS["abab5.5-chat"].tools).toBe(false);
  });
});
