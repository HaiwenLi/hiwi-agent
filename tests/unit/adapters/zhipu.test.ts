import { ZhipuAdapter, ZHIPU_MODELS } from "@/adapters/zhipu.js";
import type { Message } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ZhipuAdapter", () => {
  let adapter: ZhipuAdapter;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    adapter = new ZhipuAdapter({
      apiKey: "test-key",
      model: "glm-4-flash",
    });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("has correct id and provider", () => {
    expect(adapter.id).toBe("glm-4-flash");
    expect(adapter.provider).toBe("zhipu");
  });

  it("reports correct capabilities for glm-4-flash", () => {
    expect(adapter.capabilities.tools).toBe(true);
    expect(adapter.capabilities.vision).toBe(false);
    expect(adapter.capabilities.contextWindow).toBe(128_000);
  });

  it("sends chat request with correct headers", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello!" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];
    const response = await adapter.chat(messages);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];

    expect(url).toContain("open.bigmodel.cn");
    const headers = (opts as any).headers;
    expect(headers["Authorization"]).toContain("test-key");

    expect(response.content).toBe("Hello!");
  });

  it("handles sensitive content error (1301)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "1301", message: "sensitive content" },
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "something sensitive" }];

    await expect(adapter.chat(messages)).rejects.toThrow(/Content filtered/);
  });

  it("handles invalid token error (1215)", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: "1215", message: "invalid token" },
      }),
    } as any);

    const messages: Message[] = [{ role: "user", content: "Hi" }];

    await expect(adapter.chat(messages)).rejects.toThrow(/Invalid or expired/);
  });

  it("defaults to glm-4-flash model", () => {
    const defaultAdapter = new ZhipuAdapter({ apiKey: "key" });
    expect(defaultAdapter.id).toBe("glm-4-flash");
  });

  it("ZHIPU_MODELS has expected entries", () => {
    expect(ZHIPU_MODELS["glm-4-plus"].contextWindow).toBe(128_000);
    expect(ZHIPU_MODELS["glm-4v"].vision).toBe(true);
    expect(ZHIPU_MODELS["glm-4v"].tools).toBe(false);
  });
});
