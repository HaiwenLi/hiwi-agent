import { MockAdapter } from "@/adapters/mock.js";
import { AgentLoop } from "@/core/agent.js";
import { ToolRegistry } from "@/core/tools.js";
import type { AgentLoopConfig, Tool, ToolContext } from "@/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STREAM_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: ["read_file", "glob", "grep"],
  streaming: true,
  interruptible: true,
};

const makeTool = (name: string): Tool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: "object" },
  capabilities: ["ReadOnly"],
  execute: vi.fn(async (_input: unknown, _ctx: ToolContext) => ({
    toolCallId: "tc1",
    content: `${name} result`,
    isError: false,
  })),
});

describe("AgentLoop stream mode", () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  it("yields per-token text-delta events when streaming is enabled", async () => {
    const adapter = new MockAdapter([
      { content: "Hello World!", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", STREAM_CONFIG);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "Hi" }])) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text-delta");
    // MockAdapter.stream() splits "Hello World!" into ["Hello", " World!"]
    expect(textDeltas.length).toBe(2);
    expect(textDeltas[0].text).toBe("Hello");
    expect(textDeltas[1].text).toBe(" World!");
  });

  it("handles tool calls from stream chunks", async () => {
    toolRegistry.register(makeTool("read"));

    const adapter = new MockAdapter([
      {
        content: "Let me check",
        toolCalls: [{ id: "tc1", name: "read", input: { path: "/x" } }],
        finishReason: "tool-calls",
      },
      { content: "Done", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", STREAM_CONFIG);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "Read /x" }])) {
      events.push(event);
    }

    const toolCalls = events.filter((e) => e.type === "tool-call");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].toolName).toBe("read");

    // Should also have text-deltas from the tool-call turn
    const textDeltas = events.filter((e) => e.type === "text-delta");
    const fullText = textDeltas.map((e) => e.text).join("");
    expect(fullText).toContain("Let me check");
  });
});
