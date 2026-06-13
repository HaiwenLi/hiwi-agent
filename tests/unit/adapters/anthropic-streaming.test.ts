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
import type { Message, StreamChunk } from "@/types.js";

// ─── Helpers ──────────────────────────────────────────────────

async function* createMockStream(events: any[]) {
  for (const event of events) yield event;
}

function mockStreamResponse(events: any[], finalMessage: any) {
  const stream = {
    [Symbol.asyncIterator]() {
      return createMockStream(events)[Symbol.asyncIterator]();
    },
    finalMessage: vi.fn().mockResolvedValue(finalMessage),
  };
  mockStream.mockReturnValue(stream);
  return stream;
}

async function collectChunks(adapter: AnthropicAdapter, messages: Message[]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.stream(messages)) {
    chunks.push(chunk);
  }
  return chunks;
}

// ─── Tests ────────────────────────────────────────────────────

describe("AnthropicAdapter streaming", () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AnthropicAdapter({ apiKey: "sk-test" });
  });

  // ── Tool call accumulation ────────────────────────────────

  describe("tool call accumulation", () => {
    it("content_block_start records pending tool, content_block_stop emits complete tool-call", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "tool_use", id: "tc1", name: "read_file" },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: '{"path": "/tmp"}' },
          },
          { type: "content_block_stop", index: 1 },
        ],
        {
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "read /tmp" }]);

      const toolCall = chunks.find((c) => c.type === "tool-call");
      expect(toolCall).toEqual({
        type: "tool-call",
        toolCall: { id: "tc1", name: "read_file", input: { path: "/tmp" } },
      });
    });

    it("input_json_delta fragments accumulate across multiple events", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "tc2", name: "write_file" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '{"' },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: 'path":' },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: ' "/tmp"}' },
          },
          { type: "content_block_stop", index: 0 },
        ],
        {
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "write" }]);

      const toolCall = chunks.find((c) => c.type === "tool-call");
      expect(toolCall).toEqual({
        type: "tool-call",
        toolCall: { id: "tc2", name: "write_file", input: { path: "/tmp" } },
      });
    });

    it("malformed JSON defaults to empty object", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "tc3", name: "bash" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: "not-valid-json{" },
          },
          { type: "content_block_stop", index: 0 },
        ],
        {
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "run" }]);

      const toolCall = chunks.find((c) => c.type === "tool-call");
      expect(toolCall).toEqual({
        type: "tool-call",
        toolCall: { id: "tc3", name: "bash", input: {} },
      });
    });

    it("multiple tool calls accumulate independently by index", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "ta", name: "tool_a" },
          },
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "tool_use", id: "tb", name: "tool_b" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '{"x": 1}' },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "input_json_delta", partial_json: '{"y": 2}' },
          },
          { type: "content_block_stop", index: 0 },
          { type: "content_block_stop", index: 1 },
        ],
        {
          stop_reason: "tool_use",
          usage: { input_tokens: 20, output_tokens: 10 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "multi" }]);

      const toolCalls = chunks.filter((c) => c.type === "tool-call");
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0]).toEqual({
        type: "tool-call",
        toolCall: { id: "ta", name: "tool_a", input: { x: 1 } },
      });
      expect(toolCalls[1]).toEqual({
        type: "tool-call",
        toolCall: { id: "tb", name: "tool_b", input: { y: 2 } },
      });
    });

    it("pending tool-call is cleaned up after emission — duplicate stop does not re-emit", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "tc_dup", name: "grep" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '{"q": "todo"}' },
          },
          { type: "content_block_stop", index: 0 },
          // Duplicate stop for same index — should be a no-op
          { type: "content_block_stop", index: 0 },
        ],
        {
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "search" }]);

      const toolCalls = chunks.filter((c) => c.type === "tool-call");
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        type: "tool-call",
        toolCall: { id: "tc_dup", name: "grep", input: { q: "todo" } },
      });
    });
  });

  // ── Text and thinking streaming ───────────────────────────

  describe("text and thinking streaming", () => {
    it("text_delta events yield text-delta chunks", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "hello" },
          },
        ],
        {
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 1 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "hi" }]);

      const textDelta = chunks.find((c) => c.type === "text-delta");
      expect(textDelta).toEqual({ type: "text-delta", text: "hello" });
    });

    it("thinking_delta events yield reasoning-delta chunks", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "reasoning..." },
          },
        ],
        {
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 1 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "think" }]);

      const reasoningDelta = chunks.find((c) => c.type === "reasoning-delta");
      expect(reasoningDelta).toEqual({ type: "reasoning-delta", text: "reasoning..." });
    });

    it("mixed text and thinking events maintain order", async () => {
      mockStreamResponse(
        [
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "text_delta", text: "first" },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: { type: "thinking_delta", thinking: "pondering" },
          },
          {
            type: "content_block_delta",
            index: 2,
            delta: { type: "text_delta", text: "second" },
          },
        ],
        {
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 3 },
          model: "claude-sonnet-4-6",
        },
      );

      const chunks = await collectChunks(adapter, [{ role: "user", content: "go" }]);
      // Filter out the "finish" chunk at the end
      const deltas = chunks.filter((c) => c.type !== "finish");

      expect(deltas).toEqual([
        { type: "text-delta", text: "first" },
        { type: "reasoning-delta", text: "pondering" },
        { type: "text-delta", text: "second" },
      ]);
    });
  });

  // ── finalMessage usage enrichment ────────────────────────

  describe("finalMessage usage enrichment", () => {
    it("finish chunk includes usage from finalMessage", async () => {
      mockStreamResponse([], {
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
        model: "claude-sonnet-4-6",
      });

      const chunks = await collectChunks(adapter, [{ role: "user", content: "hi" }]);

      const finish = chunks.find((c) => c.type === "finish") as any;
      expect(finish).toBeDefined();
      expect(finish.finishReason).toBe("stop");
      expect(finish.usage.inputTokens).toBe(100);
      expect(finish.usage.outputTokens).toBe(50);
    });

    it("finish chunk includes cache tokens", async () => {
      mockStreamResponse([], {
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 80,
          cache_creation_input_tokens: 20,
        },
        model: "claude-sonnet-4-6",
      });

      const chunks = await collectChunks(adapter, [{ role: "user", content: "hi" }]);

      const finish = chunks.find((c) => c.type === "finish") as any;
      expect(finish).toBeDefined();
      expect(finish.usage.cacheReadTokens).toBe(80);
      expect(finish.usage.cacheWriteTokens).toBe(20);
    });
  });

  // ── Message conversion ───────────────────────────────────

  describe("message conversion", () => {
    it("system messages are extracted separately", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await adapter.chat([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "hi" },
      ]);

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBe("You are helpful.");
      // System message should NOT appear in messages array
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe("user");
    });

    it("tool_result messages are injected after assistant tool_use", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "done" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await adapter.chat([
        { role: "user", content: "run it" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "c1", name: "bash", input: { cmd: "ls" } },
            { id: "c2", name: "bash", input: { cmd: "pwd" } },
          ],
        },
        { role: "tool", content: "file1.txt\nfile2.txt", toolCallId: "c1" },
        { role: "tool", content: "/home", toolCallId: "c2" },
        { role: "user", content: "thanks" },
      ]);

      const callArgs = mockCreate.mock.calls[0][0];
      // user, assistant, user(tool_result), user
      expect(callArgs.messages).toHaveLength(4);

      // The tool_result block should follow the assistant message as a user message
      const toolResultMsg = callArgs.messages[2];
      expect(toolResultMsg.role).toBe("user");
      expect(toolResultMsg.content).toEqual([
        { type: "tool_result", tool_use_id: "c1", content: "file1.txt\nfile2.txt" },
        { type: "tool_result", tool_use_id: "c2", content: "/home" },
      ]);
    });

    it("image blocks are converted to Anthropic format", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "I see an image" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 50, output_tokens: 5 },
      });

      await adapter.chat([
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            {
              type: "image_url",
              image_url: {
                url: "data:image/png;base64,iVBORw0KGgo=",
              },
            },
          ],
        },
      ]);

      const callArgs = mockCreate.mock.calls[0][0];
      const userMsg = callArgs.messages[0];
      expect(userMsg.role).toBe("user");
      expect(userMsg.content).toHaveLength(2);
      expect(userMsg.content[0]).toEqual({ type: "text", text: "What is in this image?" });
      expect(userMsg.content[1]).toEqual({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: "iVBORw0KGgo=",
        },
      });
    });

    it("thinking/reasoning content is prepended as thinking block", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "answer" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      await adapter.chat([
        { role: "user", content: "think hard" },
        {
          role: "assistant",
          content: "answer",
          reasoningContent: "I considered many options...",
        },
        { role: "user", content: "follow up" },
      ]);

      const callArgs = mockCreate.mock.calls[0][0];
      // user, assistant(with thinking), user
      const assistantMsg = callArgs.messages[1];
      expect(assistantMsg.role).toBe("assistant");
      // First block should be thinking
      expect(assistantMsg.content[0]).toEqual({
        type: "thinking",
        thinking: "I considered many options...",
      });
      // Second block should be text
      expect(assistantMsg.content[1]).toEqual({ type: "text", text: "answer" });
    });
  });

  // ── Edge case ─────────────────────────────────────────────

  describe("edge case", () => {
    it("empty messages array produces valid request", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 0, output_tokens: 1 },
      });

      const resp = await adapter.chat([]);

      expect(resp.content).toBe("Hello!");
      expect(mockCreate).toHaveBeenCalledOnce();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual([]);
    });
  });
});
