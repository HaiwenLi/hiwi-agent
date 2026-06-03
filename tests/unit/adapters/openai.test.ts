import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

import { OpenAIAdapter } from "@/adapters/openai.js";

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates adapter with default model", () => {
    const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
    expect(adapter.id).toBe("gpt-4o");
    expect(adapter.provider).toBe("openai");
    expect(adapter.capabilities.contextWindow).toBe(128_000);
    expect(adapter.capabilities.vision).toBe(true);
  });

  it("creates adapter with gpt-4o-mini", () => {
    const adapter = new OpenAIAdapter({ apiKey: "sk-test", model: "gpt-4o-mini" });
    expect(adapter.id).toBe("gpt-4o-mini");
    expect(adapter.capabilities.contextWindow).toBe(128_000);
  });

  it("converts and returns text response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Hello!" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      model: "gpt-4o",
    });

    const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage.inputTokens).toBe(10);
    expect(resp.usage.outputTokens).toBe(5);
    expect(resp.usage.contextWindow).toBe(128_000);
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
      model: "gpt-4o",
    });

    const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({ id: "c1", name: "read_file", input: { path: "/tmp" } });
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("passes response_format and tool_choice", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: '{"key":"val"}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 8 },
      model: "gpt-4o",
    });

    const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
    await adapter.chat([{ role: "user", content: "json" }], {
      responseFormat: { type: "json_object" },
      toolChoice: "none",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.response_format).toEqual({ type: "json_object" });
    expect(callArgs.tool_choice).toBe("none");
  });

  it("does not add extra_body (no thinking defaults)", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
      model: "gpt-4o",
    });

    const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
    await adapter.chat([{ role: "user", content: "hi" }]);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.extra_body).toBeUndefined();
  });

  it("converts tool result messages correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
      model: "gpt-4o",
    });

    const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
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
