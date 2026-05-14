import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  })),
}));

import { AnthropicAdapter } from "@/adapters/anthropic.js";

describe("AnthropicAdapter", () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AnthropicAdapter({ apiKey: "sk-test" });
  });

  it("converts messages to Anthropic format", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello!" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("handles tool use responses", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "" },
        { type: "tool_use", id: "c1", name: "read_file", input: { path: "/tmp" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "c1",
      name: "read_file",
      input: { path: "/tmp" },
    });
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("converts tool results back to Anthropic format", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "File contents here" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 30, output_tokens: 10 },
    });

    const resp = await adapter.chat([
      { role: "user", content: "read" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp" } }],
      },
      { role: "tool", content: "file content", toolCallId: "c1" },
    ]);

    expect(resp.content).toBe("File contents here");
    const callArgs = mockCreate.mock.calls[0][0];
    const toolResultBlock = callArgs.messages[2].content[0];
    expect(toolResultBlock.type).toBe("tool_result");
  });

  it("reports correct capabilities", () => {
    expect(adapter.id).toBe("claude-sonnet-4-6");
    expect(adapter.provider).toBe("anthropic");
    expect(adapter.capabilities.tools).toBe(true);
    expect(adapter.capabilities.contextWindow).toBe(200_000);
  });

  it("accepts a custom model", async () => {
    const customAdapter = new AnthropicAdapter({
      apiKey: "sk-test",
      model: "claude-opus-4-7",
    });
    expect(customAdapter.id).toBe("claude-opus-4-7");
  });
});
