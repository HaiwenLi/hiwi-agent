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

import { KimiAdapter } from "@/adapters/kimi.js";

describe("KimiAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates adapter with default model", () => {
    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    expect(adapter.id).toBe("kimi-k2.6");
    expect(adapter.provider).toBe("kimi");
    expect(adapter.capabilities.contextWindow).toBe(262_144);
    expect(adapter.capabilities.vision).toBe(true);
    expect(adapter.capabilities.tools).toBe(true);
  });

  it("creates adapter with custom model", () => {
    const adapter = new KimiAdapter({ apiKey: "sk-kimi", model: "kimi-k2.5" });
    expect(adapter.id).toBe("kimi-k2.5");
    expect(adapter.capabilities.contextWindow).toBe(262_144);
    expect(adapter.capabilities.vision).toBe(true);
  });

  it("uses default capabilities for unknown model", () => {
    const adapter = new KimiAdapter({ apiKey: "sk-kimi", model: "unknown" });
    expect(adapter.id).toBe("unknown");
    expect(adapter.capabilities.contextWindow).toBe(128_000);
    expect(adapter.capabilities.vision).toBe(false);
  });

  it("enables thinking with keep:all for kimi-k2.6 by default", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    await adapter.chat([{ role: "user", content: "hi" }]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.thinking).toEqual({ type: "enabled", keep: "all" });
  });

  it("enables thinking for kimi-k2.5 by default", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi", model: "kimi-k2.5" });
    await adapter.chat([{ role: "user", content: "hi" }]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.thinking).toEqual({ type: "enabled" });
  });

  it("respects explicit thinking options", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    await adapter.chat([{ role: "user", content: "hi" }], {
      thinking: { type: "disabled" },
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.thinking).toEqual({ type: "disabled" });
  });

  it("sends reasoning_effort when explicitly set", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    await adapter.chat([{ role: "user", content: "hi" }], {
      reasoningEffort: "high",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.reasoning_effort).toBe("high");
  });

  it("does not send reasoning_effort by default", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    await adapter.chat([{ role: "user", content: "hi" }]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.reasoning_effort).toBeUndefined();
  });

  it("converts and returns text response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage.inputTokens).toBe(10);
    expect(resp.usage.outputTokens).toBe(5);
    expect(resp.usage.provider).toBe("kimi");
  });

  it("handles tool_calls response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: '{"path":"/tmp"}' } }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 15, completion_tokens: 20 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "c1",
      name: "read_file",
      input: { path: "/tmp" },
    });
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("extracts reasoning_content from response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { role: "assistant", content: "Done", reasoning_content: "Let me think..." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.reasoningContent).toBe("Let me think...");
    expect(resp.content).toBe("Done");
  });

  it("converts tool result messages correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
    });

    const adapter = new KimiAdapter({ apiKey: "sk-kimi" });
    await adapter.chat([
      { role: "user", content: "read" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp" } }] },
      { role: "tool", content: "file content", toolCallId: "c1" },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    const toolMsg = callArgs.messages[2];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.content).toBe("file content");
  });

  it("uses custom baseUrl", () => {
    const adapter = new KimiAdapter({ apiKey: "sk-kimi", baseUrl: "https://custom.api.com/v1", model: "kimi-k2.6" });
    expect(adapter.id).toBe("kimi-k2.6");
  });

  describe("streaming with reasoning", () => {
    it("yields reasoning-delta chunks when reasoning_content is present", async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { reasoning_content: "Thinking..." } }] };
        yield { choices: [{ delta: { content: "Answer" } }] };
        yield { choices: [{ delta: {}, finish_reason: "stop" }] };
      }

      mockCreate.mockResolvedValue(mockStream());

      const adapter = new KimiAdapter({ apiKey: "sk-kimi", model: "kimi-k2.6" });
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
  });
});
