import { MockAdapter } from "@/adapters/mock.js";
import { CommandRegistry } from "@/cli/commands.js";
import { REPL, type REPLDependencies } from "@/cli/repl.js";
import { ToolRegistry } from "@/core/tools.js";
import { SkillRegistry } from "@/skills/registry.js";
import type { AgentLoopConfig } from "@/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOOP_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: [],
  streaming: false,
  interruptible: true,
};

describe("REPL", () => {
  let deps: REPLDependencies;
  let commandRegistry: CommandRegistry;
  let skillRegistry: SkillRegistry;
  let toolRegistry: ToolRegistry;
  let adapter: MockAdapter;
  let outputs: string[];
  let streamOutputs: string[];

  beforeEach(() => {
    outputs = [];
    streamOutputs = [];
    commandRegistry = new CommandRegistry();
    commandRegistry.registerBuiltinCommands();
    skillRegistry = new SkillRegistry();
    toolRegistry = new ToolRegistry();
    adapter = new MockAdapter([]);

    deps = {
      commandRegistry,
      skillRegistry,
      toolRegistry,
      adapter,
      loopConfig: LOOP_CONFIG,
      permissionMode: { value: "normal" as const },
      setPermissionMode: vi.fn(),
      providerRegistry: {
        getActiveAdapter: () => adapter,
        setActiveModel: vi.fn(),
        setActiveProvider: vi.fn(),
        getActiveModel: () => "mock",
        getActiveProvider: () => "mock",
        listModels: () => [],
      } as any,
      memoryManager: {
        remember: vi.fn(async () => ({ isOk: () => true })),
        recall: vi.fn(async () => ({ isOk: () => true, value: [] })),
        forget: vi.fn(async () => ({ isOk: () => true })),
        list: vi.fn(async () => ({ isOk: () => true, value: [] })),
        getSystemContext: vi.fn(async () => ""),
      } as any,
      sessionStore: {
        createSession: vi.fn(() => ({ id: "s1", workingDir: "/tmp", status: "active" })),
        listSessions: vi.fn(() => []),
        findActiveSession: vi.fn(() => null),
        completeSession: vi.fn(),
        appendMessage: vi.fn(),
        getMessages: vi.fn(() => []),
      } as any,
      onOutput: (text: string) => outputs.push(text),
      onStreamChunk: (chunk: string) => streamOutputs.push(chunk),
      confirm: vi.fn(async () => true),
    };
  });

  it("processes a slash command", async () => {
    const repl = new REPL(deps);
    await repl.processInput("/help");
    expect(outputs.join("")).toContain("/model");
  });

  it("processes a normal chat message via agent loop", async () => {
    const chatAdapter = new MockAdapter([
      { content: "Hello! How can I help?", toolCalls: [], finishReason: "stop" },
    ]);
    deps.adapter = chatAdapter;
    deps.providerRegistry.getActiveAdapter = () => chatAdapter;

    const repl = new REPL(deps);
    await repl.processInput("Hi there");
    const allOutput = [...outputs, ...streamOutputs];
    expect(allOutput.some((o) => o.includes("Hello"))).toBe(true);
  });

  it("routes skill triggers to skill executor", async () => {
    deps.adapter = new MockAdapter([
      { content: "Skill response", toolCalls: [], finishReason: "stop" },
    ]);
    deps.providerRegistry.getActiveAdapter = () => deps.adapter;

    skillRegistry.register({
      name: "test-skill",
      type: "domain",
      description: "Test",
      trigger: "/test-skill",
      prompt: "You are a test skill.",
      sourcePath: "/skills/test/SKILL.md",
    });

    const repl = new REPL(deps);
    await repl.processInput("/test-skill do something");
    expect(outputs.length).toBeGreaterThan(0);
  });

  it("creates a new session on first chat", async () => {
    deps.adapter = new MockAdapter([{ content: "Hi", toolCalls: [], finishReason: "stop" }]);
    deps.providerRegistry.getActiveAdapter = () => deps.adapter;

    const repl = new REPL(deps);
    await repl.processInput("hello");
    expect(deps.sessionStore.createSession).toHaveBeenCalled();
  });

  it("returns exit=true for /exit command", async () => {
    const repl = new REPL(deps);
    const result = await repl.processInput("/exit");
    expect(result).toBe("exit");
  });

  it("repl.pause() pauses the current agent loop", async () => {
    const chatAdapter = new MockAdapter(
      [
        {
          content: "A long streaming response that should pause mid-way",
          toolCalls: [],
          finishReason: "stop",
        },
      ],
      { streamDelay: 5 },
    );
    deps.adapter = chatAdapter;
    deps.providerRegistry.getActiveAdapter = () => chatAdapter;
    deps.loopConfig = { ...LOOP_CONFIG, streaming: true };

    const repl = new REPL(deps);

    // Start chat in background
    const chatPromise = repl.processInput("Hello");

    // Give it a moment to start streaming, then pause
    await new Promise((r) => setTimeout(r, 2));
    repl.pause();

    const result = await chatPromise;
    // Should return partial content even though paused
    expect(result.length).toBeGreaterThan(0);
  });

  it("pausing during chat preserves partial messages", async () => {
    const chatAdapter = new MockAdapter(
      [
        {
          content: "This is partial content that gets interrupted",
          toolCalls: [],
          finishReason: "stop",
        },
      ],
      { streamDelay: 5 },
    );
    deps.adapter = chatAdapter;
    deps.providerRegistry.getActiveAdapter = () => chatAdapter;
    deps.loopConfig = { ...LOOP_CONFIG, streaming: true };

    const repl = new REPL(deps);

    const chatPromise = repl.processInput("Hello");

    await new Promise((r) => setTimeout(r, 2));
    repl.pause();

    await chatPromise;

    // The session store should have been updated with partial content
    expect(deps.sessionStore.appendMessage).toHaveBeenCalled();
  });

  it("accumulates conversation history across turns", async () => {
    const chatAdapter = new MockAdapter([
      { content: "First response", toolCalls: [], finishReason: "stop" },
      { content: "Second response", toolCalls: [], finishReason: "stop" },
    ]);
    deps.adapter = chatAdapter;
    deps.providerRegistry.getActiveAdapter = () => chatAdapter;

    const repl = new REPL(deps);
    await repl.processInput("first message");
    await repl.processInput("second message");

    expect(deps.sessionStore.appendMessage).toHaveBeenCalled();
  });
});
