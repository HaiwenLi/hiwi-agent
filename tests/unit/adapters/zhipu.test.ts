import { ZHIPU_MODELS, ZhipuAdapter } from "@/adapters/zhipu.js";
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
    expect(adapter.capabilities.contextWindow).toBe(200_000);
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

  it("defaults to glm-5 model", () => {
    const defaultAdapter = new ZhipuAdapter({ apiKey: "key" });
    expect(defaultAdapter.id).toBe("glm-5");
  });

  it("ZHIPU_MODELS has expected entries", () => {
    expect(ZHIPU_MODELS["glm-4-plus"].contextWindow).toBe(200_000);
    expect(ZHIPU_MODELS["glm-4v"].vision).toBe(true);
    expect(ZHIPU_MODELS["glm-4v"].tools).toBe(false);
    expect(ZHIPU_MODELS["glm-5"].contextWindow).toBe(200_000);
  });

  describe("streaming with reasoning", () => {
    it("yields reasoning-delta chunks when reasoning_content is present", async () => {
      const chunks = [
        { delta: { reasoning_content: "Let me think" }, finish_reason: null },
        { delta: { reasoning_content: " step by step" }, finish_reason: null },
        { delta: { content: "The answer is 42" }, finish_reason: null },
        { delta: {}, finish_reason: "stop" },
      ];

      const sseBody = chunks
        .map((c) => `data: ${JSON.stringify({ choices: [c] })}`)
        .join("\n\n") + "\n\ndata: [DONE]\n";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody));
          controller.close();
        },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
        headers: new Headers({ "content-type": "text/event-stream" }),
      } as any);

      const events = [];
      for await (const chunk of adapter.stream([{ role: "user", content: "think" }])) {
        events.push(chunk);
      }

      const reasoning = events.filter((e) => e.type === "reasoning-delta");
      const text = events.filter((e) => e.type === "text-delta");

      expect(reasoning).toHaveLength(2);
      expect(reasoning[0].text).toBe("Let me think");
      expect(reasoning[1].text).toBe(" step by step");
      expect(text).toHaveLength(1);
      expect(text[0].text).toBe("The answer is 42");
    });

    it("works without reasoning_content (backward compatible)", async () => {
      const chunks = [
        { delta: { content: "Hello" }, finish_reason: null },
        { delta: {}, finish_reason: "stop" },
      ];

      const sseBody = chunks
        .map((c) => `data: ${JSON.stringify({ choices: [c] })}`)
        .join("\n\n") + "\n\ndata: [DONE]\n";

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseBody));
          controller.close();
        },
      });

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: stream,
        headers: new Headers({ "content-type": "text/event-stream" }),
      } as any);

      const events = [];
      for await (const chunk of adapter.stream([{ role: "user", content: "Hi" }])) {
        events.push(chunk);
      }

      const reasoning = events.filter((e) => e.type === "reasoning-delta");
      const text = events.filter((e) => e.type === "text-delta");
      expect(reasoning).toHaveLength(0);
      expect(text).toHaveLength(1);
      expect(text[0].text).toBe("Hello");
    });
  });
});
