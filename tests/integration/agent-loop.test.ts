import { MockAdapter } from "@/adapters/mock.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import { AgentLoop } from "@/core/agent.js";
import { ToolRegistry } from "@/core/tools.js";
import type { AgentConfig, Tool, ToolContext } from "@/types.js";
import { describe, expect, it, vi } from "vitest";

const TEST_CONFIG: AgentConfig = {
  activeProvider: "mock",
  activeModel: "mock-model",
  providers: {},
  agent: {
    maxLoops: 50,
    maxOutputTokensPerTurn: 4096,
    budgetTotal: 50,
    refundableTools: ["read_file", "glob", "grep"],
    streaming: true,
    interruptible: true,
  },
};

describe("Integration: Agent Loop E2E", () => {
  it("runs a full multi-turn tool-use conversation", async () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const mockAdapter = new MockAdapter(
      [
        {
          content: "Let me read that file.",
          toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/hello.txt" } }],
          finishReason: "tool-calls",
        },
        {
          content: "The file contains: hello world. That's a simple greeting.",
          toolCalls: [],
          finishReason: "stop",
        },
      ],
      { id: "mock-model", provider: "mock" },
    );
    registry.registerAdapter("mock", mockAdapter);

    const toolRegistry = new ToolRegistry();
    const readFile: Tool = {
      name: "read_file",
      description: "Read a file",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      capabilities: ["ReadOnly"],
      execute: vi.fn(async (input: unknown) => ({
        toolCallId: "c1",
        content: "hello world",
        isError: false,
      })),
    };
    toolRegistry.register(readFile);

    const loop = new AgentLoop(
      registry.getActiveAdapter(),
      toolRegistry,
      "yolo",
      TEST_CONFIG.agent,
    );

    const events = [];
    for await (const event of loop.run([
      { role: "user", content: "Read /tmp/hello.txt and summarize" },
    ])) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "step-start")).toBe(true);
    expect(events.some((e) => e.type === "tool-call" && e.toolName === "read_file")).toBe(true);
    expect(events.some((e) => e.type === "tool-result")).toBe(true);
    expect(events.some((e) => e.type === "text-delta" && e.text?.includes("hello world"))).toBe(
      true,
    );
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");

    expect(readFile.execute).toHaveBeenCalledTimes(1);
  });

  it("handles tool errors gracefully in full flow", async () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const mockAdapter = new MockAdapter(
      [
        {
          content: "",
          toolCalls: [{ id: "c1", name: "read_file", input: { path: "/nonexistent" } }],
          finishReason: "tool-calls",
        },
        {
          content: "Sorry, the file doesn't exist. Would you like me to create it?",
          toolCalls: [],
          finishReason: "stop",
        },
      ],
      { id: "mock-model", provider: "mock" },
    );
    registry.registerAdapter("mock", mockAdapter);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object" },
      capabilities: ["ReadOnly"],
      execute: vi.fn(async () => ({
        toolCallId: "c1",
        content: "Error: ENOENT no such file or directory",
        isError: true,
      })),
    });

    const loop = new AgentLoop(
      registry.getActiveAdapter(),
      toolRegistry,
      "yolo",
      TEST_CONFIG.agent,
    );

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "read missing file" }])) {
      events.push(event);
    }

    const toolResult = events.find((e) => e.type === "tool-result");
    expect(toolResult?.toolResult?.isError).toBe(true);
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
  });

  it("respects budget limits across multiple tool calls", async () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const mockAdapter = new MockAdapter(
      [
        {
          content: "",
          toolCalls: [{ id: "c1", name: "bash", input: { command: "echo hi" } }],
          finishReason: "tool-calls",
        },
      ],
      { id: "mock-model", provider: "mock" },
    );
    registry.registerAdapter("mock", mockAdapter);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "bash",
      description: "Run bash",
      inputSchema: { type: "object" },
      capabilities: ["ExecCode"],
      execute: vi.fn(async () => ({
        toolCallId: "c1",
        content: "hi",
        isError: false,
      })),
    });

    const lowBudgetConfig = { ...TEST_CONFIG.agent, budgetTotal: 3, maxLoops: 50 };
    const loop = new AgentLoop(registry.getActiveAdapter(), toolRegistry, "yolo", lowBudgetConfig);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "loop" }])) {
      events.push(event);
    }

    const finish = events.find((e) => e.type === "finish");
    expect(finish?.finishReason).toMatch(/max-loops|completed/);
  });
});
