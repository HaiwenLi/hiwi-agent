import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { DeepSeekAdapter } from "@/adapters/deepseek.js";

describe("DeepSeekAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates adapter with default model", () => {
    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    expect(adapter.id).toBe("deepseek-v4-pro");
    expect(adapter.provider).toBe("deepseek");
    expect(adapter.capabilities.contextWindow).toBe(1_000_000);
    expect(adapter.capabilities.tools).toBe(true);
  });

  it("creates adapter with custom model", () => {
    const adapter = new DeepSeekAdapter({ apiKey: "sk-test", model: "deepseek-v4-flash" });
    expect(adapter.id).toBe("deepseek-v4-flash");
    expect(adapter.capabilities.contextWindow).toBe(1_000_000);
  });

  it("falls back to default capabilities for unknown model", () => {
    const adapter = new DeepSeekAdapter({ apiKey: "sk-test", model: "unknown" });
    expect(adapter.id).toBe("unknown");
    expect(adapter.capabilities.contextWindow).toBe(1_000_000); // fallback to v4-pro
  });

  it("sends thinking + reasoning_effort in extra_body by default", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    await adapter.chat([{ role: "user", content: "hi" }]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.thinking).toEqual({ type: "enabled" });
    expect(callArgs.extra_body.reasoning_effort).toBe("high");
  });

  it("respects explicit thinking options", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    await adapter.chat([{ role: "user", content: "hi" }], {
      thinking: { type: "disabled" },
      reasoningEffort: "max",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body.thinking).toEqual({ type: "disabled" });
    expect(callArgs.extra_body.reasoning_effort).toBe("max");
  });

  it("passes response_format and tool_choice", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: '{ "key": "val" }' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 8 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    await adapter.chat([{ role: "user", content: "json please" }], {
      responseFormat: { type: "json_object" },
      toolChoice: "auto",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.response_format).toEqual({ type: "json_object" });
    expect(callArgs.tool_choice).toBe("auto");
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
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0].name).toBe("read_file");
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("extracts reasoning_content from response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { role: "assistant", content: "Done", reasoning_content: "Let me think..." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.reasoningContent).toBe("Let me think...");
    expect(resp.content).toBe("Done");
  });

  it("strips <think> content from response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { role: "assistant", content: "<think>Hmm, let me analyze this.</think>Done" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 8 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.content).toBe("Done");
    expect(resp.reasoningContent).toBe("Hmm, let me analyze this.");
  });

  it("passes reasoning_content in assistant messages for multi-turn", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
    await adapter.chat([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello", reasoningContent: "thinking...", toolCalls: [{ id: "c1", name: "t", input: {} }] },
      { role: "tool", content: "result", toolCallId: "c1" },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    const assistantMsg = callArgs.messages[1];
    expect(assistantMsg.reasoning_content).toBe("thinking...");
  });

  it("converts tool result messages correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
      model: "deepseek-v4-pro",
    });

    const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
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
});
