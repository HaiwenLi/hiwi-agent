import { describe, it, expectTypeOf, expect } from "vitest";
import type {
  Message,
  ToolCall,
  ToolResult,
  ChatResponse,
  StreamChunk,
  TokenUsage,
  ModelCapabilities,
  ChatOptions,
  ToolDefinition,
  ModelAdapter,
  Tool,
  ToolCapability,
  PermissionMode,
  AgentLoopEvent,
  AgentLoopEventType,
  AgentLoopConfig,
} from "@/types.js";

describe("Shared Types", () => {
  it("Message has required fields", () => {
    const msg: Message = { role: "user", content: "hello" };
    expectTypeOf(msg.role).toEqualTypeOf<"system" | "user" | "assistant" | "tool">();
  });

  it("Message can have optional toolCalls", () => {
    const msg: Message = {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/a" } }],
    };
    expect(msg.toolCalls).toHaveLength(1);
  });

  it("ToolResult has isError flag", () => {
    const result: ToolResult = { toolCallId: "c1", content: "ok", isError: false };
    expect(result.isError).toBe(false);
  });

  it("ChatResponse has finishReason", () => {
    const resp: ChatResponse = {
      content: "hi",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    expect(resp.finishReason).toBe("stop");
  });

  it("StreamChunk discriminated union works", () => {
    const textChunk: StreamChunk = { type: "text-delta", text: "hello" };
    const toolChunk: StreamChunk = {
      type: "tool-call",
      toolCall: { id: "c1", name: "bash", input: { command: "ls" } },
    };
    const finishChunk: StreamChunk = {
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    expect(textChunk.type).toBe("text-delta");
    expect(toolChunk.type).toBe("tool-call");
    expect(finishChunk.type).toBe("finish");
  });

  it("PermissionMode is the correct union", () => {
    const mode: PermissionMode = "normal";
    expect(["normal", "auto", "yolo"]).toContain(mode);
  });

  it("AgentLoopConfig has sensible defaults", () => {
    const config: AgentLoopConfig = {
      maxLoops: 50,
      maxOutputTokensPerTurn: 4096,
      budgetTotal: 50,
      refundableTools: ["read_file", "glob", "grep"],
      streaming: true,
      interruptible: true,
    };
    expect(config.maxLoops).toBe(50);
  });
});
