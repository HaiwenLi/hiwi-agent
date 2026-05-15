import type {
  AgentLoopConfig,
  AgentLoopEvent,
  AgentLoopEventType,
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  PermissionMode,
  StreamChunk,
  TokenUsage,
  Tool,
  ToolCall,
  ToolCapability,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "@/types.js";
import { describe, expect, expectTypeOf, it } from "vitest";

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

describe("ToolContext", () => {
  it("accepts optional abort signal", () => {
    const controller = new AbortController();
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      abort: controller.signal,
    };
    expect(ctx.abort).toBe(controller.signal);
  });

  it("accepts optional askPermission callback", async () => {
    const askPermission = async () => true;
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      askPermission,
    };
    expect(await ctx.askPermission!({ tool: "bash", capability: "ExecCode" })).toBe(true);
  });

  it("works without optional fields", () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
    };
    expect(ctx.abort).toBeUndefined();
    expect(ctx.askPermission).toBeUndefined();
  });
});

describe("ToolResult extended fields", () => {
  it("accepts optional title field", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "file contents",
      isError: false,
      title: "Read src/index.ts",
    };
    expect(result.title).toBe("Read src/index.ts");
  });

  it("accepts optional metadata field", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "3 files found",
      isError: false,
      metadata: { fileCount: 3, truncated: true },
    };
    expect(result.metadata?.fileCount).toBe(3);
  });

  it("works without optional fields", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "ok",
      isError: false,
    };
    expect(result.title).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });
});
