import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLoop, IterationBudget } from "@/core/agent.js";
import { MockAdapter } from "@/adapters/mock.js";
import { ToolRegistry } from "@/core/tools.js";
import type { AgentLoopConfig, Tool, ToolContext, PermissionMode } from "@/types.js";

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: ["read_file", "glob", "grep"],
  streaming: false,
  interruptible: true,
};

const makeTool = (name: string, caps: Tool["capabilities"] = ["ReadOnly"]): Tool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: "object" },
  capabilities: caps,
  execute: vi.fn(async (_input: unknown, _ctx: ToolContext) => ({
    toolCallId: "c1",
    content: `${name} result`,
    isError: false,
  })),
});

describe("IterationBudget", () => {
  it("consumes budget and tracks remaining", () => {
    const budget = new IterationBudget(10, new Set(["read_file"]));
    expect(budget.remaining).toBe(10);
    budget.consume("bash");
    expect(budget.remaining).toBe(9);
  });

  it("refunds refundable tools", () => {
    const budget = new IterationBudget(10, new Set(["read_file"]));
    budget.consume("read_file");
    expect(budget.remaining).toBe(9);
    budget.refund("read_file");
    expect(budget.remaining).toBe(10);
  });

  it("does not refund non-refundable tools", () => {
    const budget = new IterationBudget(10, new Set(["read_file"]));
    budget.consume("bash");
    budget.refund("bash");
    expect(budget.remaining).toBe(9); // no refund
  });

  it("reports exhausted when remaining is 0", () => {
    const budget = new IterationBudget(2, new Set());
    budget.consume("a");
    budget.consume("b");
    expect(budget.exhausted).toBe(true);
  });
});

describe("AgentLoop", () => {
  let toolRegistry: ToolRegistry;
  const ctx = { workingDirectory: "/tmp", sessionId: "s1" };

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  it("completes a simple text-only conversation", async () => {
    const adapter = new MockAdapter([
      { content: "Hello!", toolCalls: [], finishReason: "stop" },
    ]);
    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    const finishEvent = events.find((e) => e.type === "finish");
    expect(finishEvent?.finishReason).toBe("completed");
    expect(events.some((e) => e.type === "text-delta")).toBe(true);
  });

  it("executes a single tool call and continues", async () => {
    const readTool = makeTool("read_file");
    toolRegistry.register(readTool);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/a" } }],
        finishReason: "tool-calls",
      },
      { content: "File contents: hello", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "read" }])) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "tool-call" && e.toolName === "read_file")).toBe(true);
    expect(events.some((e) => e.type === "tool-result")).toBe(true);
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
  });

  it("executes multiple read-only tools in parallel", async () => {
    const tool1 = makeTool("read_file");
    const tool2 = makeTool("glob");
    toolRegistry.register(tool1);
    toolRegistry.register(tool2);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [
          { id: "c1", name: "read_file", input: { path: "/a" } },
          { id: "c2", name: "glob", input: { pattern: "*.ts" } },
        ],
        finishReason: "tool-calls",
      },
      { content: "Done", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "search" }])) {
      events.push(event);
    }

    expect(tool1.execute).toHaveBeenCalled();
    expect(tool2.execute).toHaveBeenCalled();
  });

  it("executes write tools serially when paths conflict", async () => {
    const writeTool = makeTool("write_file", ["WriteFiles"]);
    toolRegistry.register(writeTool);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [
          { id: "c1", name: "write_file", input: { path: "/tmp/a.txt", content: "1" } },
          { id: "c2", name: "write_file", input: { path: "/tmp/a.txt", content: "2" } },
        ],
        finishReason: "tool-calls",
      },
      { content: "Done", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "write" }])) {
      events.push(event);
    }

    expect(writeTool.execute).toHaveBeenCalledTimes(2);
  });

  it("stops at max loops", async () => {
    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/a" } }],
        finishReason: "tool-calls",
      },
    ]);

    const readTool = makeTool("read_file");
    toolRegistry.register(readTool);

    const config = { ...DEFAULT_CONFIG, maxLoops: 3 };
    const loop = new AgentLoop(adapter, toolRegistry, "yolo", config);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "loop" }])) {
      events.push(event);
    }

    const finishEvent = events.find((e) => e.type === "finish");
    expect(finishEvent?.finishReason).toBe("max-loops");
  });

  it("can be interrupted", async () => {
    const adapter = new MockAdapter([
      { content: "Working...", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);
    loop.interrupt();

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    const finishEvent = events.find((e) => e.type === "finish");
    expect(finishEvent?.finishReason).toBe("interrupted");
  });

  it("handles empty response with retry", async () => {
    const adapter = new MockAdapter([
      { content: "", toolCalls: [], finishReason: "stop" },
      { content: "Recovered!", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    expect(events.some((e) => e.text === "Recovered!")).toBe(true);
  });

  it("emits step-start and step-finish per iteration", async () => {
    const adapter = new MockAdapter([
      { content: "Hi", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "step-start")).toBe(true);
    expect(events.some((e) => e.type === "step-finish")).toBe(true);
  });

  it("tool errors are fed back as tool results, loop continues", async () => {
    const failTool: Tool = {
      name: "bad_tool",
      description: "fails",
      inputSchema: { type: "object" },
      capabilities: ["ReadOnly"],
      execute: vi.fn(async () => ({
        toolCallId: "c1",
        content: "Error: file not found",
        isError: true,
      })),
    };
    toolRegistry.register(failTool);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "bad_tool", input: {} }],
        finishReason: "tool-calls",
      },
      { content: "I see the error, the file doesn't exist.", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "try" }])) {
      events.push(event);
    }

    const toolResult = events.find((e) => e.type === "tool-result");
    expect(toolResult?.toolResult?.isError).toBe(true);
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
  });
});
