import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

import { OpenAICompatAdapter } from "@/adapters/openai-compat.js";

describe("OpenAICompatAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates adapter for OpenAI provider", () => {
    const adapter = new OpenAICompatAdapter({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(adapter.id).toBe("gpt-4o");
    expect(adapter.provider).toBe("openai");
    expect(adapter.capabilities.contextWindow).toBe(128_000);
  });

  it("creates adapter for Kimi with custom baseUrl", () => {
    const adapter = new OpenAICompatAdapter({
      provider: "kimi",
      apiKey: "sk-kimi",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });
    expect(adapter.provider).toBe("kimi");
    expect(adapter.id).toBe("kimi-k2.6");
  });

  it("converts and returns text response", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { role: "assistant", content: "Hello!" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage.inputTokens).toBe(10);
    expect(resp.usage.outputTokens).toBe(5);
  });

  it("handles tool_calls response", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "c1",
                type: "function",
                function: { name: "read_file", arguments: '{"path":"/tmp"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 20 },
    });

    const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "c1",
      name: "read_file",
      input: { path: "/tmp" },
    });
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("converts tool result messages correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { role: "assistant", content: "Done" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
    });

    const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
    await adapter.chat([
      { role: "user", content: "read" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp" } }],
      },
      { role: "tool", content: "file content", toolCallId: "c1" },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    const toolMsg = callArgs.messages[2];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.content).toBe("file content");
  });

  it("uses model-specific capabilities", () => {
    const kimi = new OpenAICompatAdapter({
      provider: "kimi",
      apiKey: "sk-test",
      model: "kimi-k2.6",
    });
    expect(kimi.capabilities.contextWindow).toBe(262_144);
    expect(kimi.capabilities.vision).toBe(true);

    const unknown = new OpenAICompatAdapter({
      provider: "custom",
      apiKey: "sk-test",
      model: "unknown-model",
    });
    expect(unknown.capabilities.contextWindow).toBe(128_000); // default
  });

  describe("streaming with reasoning", () => {
    it("yields reasoning-delta chunks when reasoning_content is present", async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { reasoning_content: "Thinking..." } }] };
        yield { choices: [{ delta: { content: "Answer" } }] };
        yield { choices: [{ delta: {}, finish_reason: "stop" }] };
      }

      mockCreate.mockResolvedValue(mockStream());

      const adapter = new OpenAICompatAdapter({ provider: "kimi", apiKey: "sk-test", model: "kimi-k2.6" });
      const events = [];
      for await (const chunk of adapter.stream([{ role: "user", content: "think" }])) {
        events.push(chunk);
      }

      const reasoning = events.filter((e) => e.type === "reasoning-delta");
      const text = events.filter((e) => e.type === "text-delta");
      expect(reasoning).toHaveLength(1);
      expect(reasoning[0].text).toBe("Thinking...");
      expect(text).toHaveLength(1);
      expect(text[0].text).toBe("Answer");
    });

    it("works without reasoning_content (backward compatible)", async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { content: "Hello" } }] };
        yield { choices: [{ delta: {}, finish_reason: "stop" }] };
      }

      mockCreate.mockResolvedValue(mockStream());

      const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
      const events = [];
      for await (const chunk of adapter.stream([{ role: "user", content: "Hi" }])) {
        events.push(chunk);
      }

      const reasoning = events.filter((e) => e.type === "reasoning-delta");
      expect(reasoning).toHaveLength(0);
    });
  });

  describe("thinking defaults", () => {
    it("enables thinking for kimi-k2.5 by default", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      });

      const adapter = new OpenAICompatAdapter({ provider: "kimi", apiKey: "sk-test", model: "kimi-k2.5" });
      await adapter.chat([{ role: "user", content: "hi" }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.extra_body.thinking).toEqual({ type: "enabled" });
    });

    it("enables thinking with keep:all for kimi-k2.6 by default", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      });

      const adapter = new OpenAICompatAdapter({ provider: "kimi", apiKey: "sk-test", model: "kimi-k2.6" });
      await adapter.chat([{ role: "user", content: "hi" }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.extra_body.thinking).toEqual({ type: "enabled", keep: "all" });
    });

    it("does not add thinking defaults for abab-7 model", async () => {
      mockCreate.mockResolvedValue({
        choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      });

      const adapter = new OpenAICompatAdapter({ provider: "abab", apiKey: "sk-test", model: "abab-7" });
      await adapter.chat([{ role: "user", content: "hi" }]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.extra_body).toBeUndefined();
    });
  });
});
