# Sprint 4: CLI + MCP — TDD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the CLI/TUI interface and MCP server mode — slash commands, interactive REPL, Ink-based streaming TUI, and MCP server that exposes memory/skills/tools to other agents.

**Architecture:** Dual-mode: CLI mode (default, Ink TUI) or MCP server mode (`--mcp` flag, stdio/SSE). Slash commands route to internal modules. MCP exposes 6 tools for external agent integration. REPL manages the agent loop lifecycle.

**Tech Stack:** Ink + React, commander, @modelcontextprotocol/sdk, Vitest

**Prerequisite:** Sprint 1 (core), Sprint 2 (memory), Sprint 3 (skills) complete

**Reference:** `docs/plans/2026-05-13-personal-agent-design.md` (Sections 7-8), `docs/plans/checkpoint-2026-05-13-implementation-planning.md` (TUI Streaming section)

---

## Task 1: Slash Commands

**Files:**
- Create: `src/cli/commands.ts`
- Create: `tests/unit/cli/commands.test.ts`

Command registry with handlers for: `/model`, `/provider`, `/models`, `/skills`, `/remember`, `/recall`, `/forget`, `/sessions`, `/resume`, `/new`, `/yolo`, `/help`. Each command has a name, description, and handler function. The REPL dispatches user input starting with `/` to the matching command.

**Step 1: Write the failing tests**

```typescript
// tests/unit/cli/commands.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandRegistry, type Command, type CommandContext } from "@/cli/commands.js";

const makeContext = (): CommandContext => ({
  providerRegistry: {
    setActiveProvider: vi.fn(),
    setActiveModel: vi.fn(),
    getActiveProvider: vi.fn(() => "anthropic"),
    getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
    listModels: vi.fn(() => []),
  } as any,
  memoryManager: {
    remember: vi.fn(async () => ({ isOk: () => true })),
    recall: vi.fn(async () => ({ isOk: () => true, value: [] })),
    forget: vi.fn(async () => ({ isOk: () => true })),
    list: vi.fn(async () => ({ isOk: () => true, value: [] })),
    getSystemContext: vi.fn(async () => ""),
  } as any,
  sessionStore: {
    createSession: vi.fn(() => ({ id: "s1" })),
    listSessions: vi.fn(() => []),
    findActiveSession: vi.fn(() => null),
    completeSession: vi.fn(),
  } as any,
  skillRegistry: {
    list: vi.fn(() => []),
    hasTrigger: vi.fn(() => false),
    getTriggers: vi.fn(() => []),
  } as any,
  permissionMode: { value: "normal" as const },
  setPermissionMode: vi.fn(),
  output: vi.fn(),
});

describe("CommandRegistry", () => {
  let registry: CommandRegistry;
  let ctx: CommandContext;

  beforeEach(() => {
    ctx = makeContext();
    registry = new CommandRegistry();
  });

  it("registers and dispatches a command", async () => {
    const handler = vi.fn(async () => "ok");
    registry.register({
      name: "test",
      description: "Test command",
      handler,
    });

    const result = await registry.dispatch("/test", ctx);
    expect(handler).toHaveBeenCalledWith("", ctx);
    expect(result).toBe("ok");
  });

  it("dispatches with arguments after command name", async () => {
    const handler = vi.fn(async () => "ok");
    registry.register({ name: "model", description: "Set model", handler });

    await registry.dispatch("/model gpt-4o", ctx);
    expect(handler).toHaveBeenCalledWith("gpt-4o", ctx);
  });

  it("returns help text for unknown command", async () => {
    const result = await registry.dispatch("/nonexistent", ctx);
    expect(result).toContain("Unknown command");
  });

  it("lists all registered commands", () => {
    registry.register({ name: "a", description: "Command A", handler: vi.fn() });
    registry.register({ name: "b", description: "Command B", handler: vi.fn() });
    expect(registry.list()).toHaveLength(2);
  });

  describe("built-in commands", () => {
    it("/model sets active model", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/model gpt-4o", ctx);
      expect(ctx.providerRegistry.setActiveModel).toHaveBeenCalledWith("gpt-4o");
    });

    it("/provider sets active provider", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/provider openai", ctx);
      expect(ctx.providerRegistry.setActiveProvider).toHaveBeenCalledWith("openai");
    });

    it("/models lists available models", async () => {
      registry.registerBuiltinCommands();
      const result = await registry.dispatch("/models", ctx);
      expect(ctx.providerRegistry.listModels).toHaveBeenCalled();
    });

    it("/remember saves a memory", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/remember user-profile: Alice is a developer", ctx);
      expect(ctx.memoryManager.remember).toHaveBeenCalled();
    });

    it("/recall searches memories", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/recall TypeScript", ctx);
      expect(ctx.memoryManager.recall).toHaveBeenCalledWith("TypeScript");
    });

    it("/forget deletes a memory", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/forget old-note", ctx);
      expect(ctx.memoryManager.forget).toHaveBeenCalledWith("old-note");
    });

    it("/skills lists loaded skills", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/skills", ctx);
      expect(ctx.skillRegistry.list).toHaveBeenCalled();
    });

    it("/sessions lists sessions", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/sessions", ctx);
      expect(ctx.sessionStore.listSessions).toHaveBeenCalled();
    });

    it("/yolo enables yolo mode with confirmation", async () => {
      registry.registerBuiltinCommands();
      ctx.confirm = vi.fn(async () => true);
      await registry.dispatch("/yolo", ctx);
      expect(ctx.setPermissionMode).toHaveBeenCalledWith("yolo");
    });

    it("/help shows all commands", async () => {
      registry.registerBuiltinCommands();
      const result = await registry.dispatch("/help", ctx);
      expect(result).toContain("/model");
      expect(result).toContain("/provider");
      expect(result).toContain("/remember");
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/cli/commands.test.ts
```

Expected: FAIL

**Step 3: Create src/cli/commands.ts**

```typescript
// src/cli/commands.ts
import type { ProviderRegistry } from "../adapters/registry.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SessionStore } from "../memory/session.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { PermissionMode } from "../types.js";

export interface CommandContext {
  providerRegistry: ProviderRegistry;
  memoryManager: MemoryManager;
  sessionStore: SessionStore;
  skillRegistry: SkillRegistry;
  permissionMode: { value: PermissionMode };
  setPermissionMode: (mode: PermissionMode) => void;
  output: (text: string) => void;
  confirm?: (message: string) => Promise<boolean>;
}

export interface Command {
  name: string;
  description: string;
  handler: (args: string, ctx: CommandContext) => Promise<string>;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command): void {
    this.commands.set(command.name, command);
  }

  async dispatch(input: string, ctx: CommandContext): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
      return ""; // not a command
    }

    const parts = trimmed.slice(1).split(/\s+(.*)/s);
    const name = parts[0];
    const args = parts[1] ?? "";

    const command = this.commands.get(name);
    if (!command) {
      const help = this.getHelpText();
      return `Unknown command: /${name}\n\n${help}`;
    }

    return command.handler(args.trim(), ctx);
  }

  list(): Command[] {
    return Array.from(this.commands.values());
  }

  private getHelpText(): string {
    const cmds = this.list();
    const lines = cmds.map((c) => `  /${c.name.padEnd(12)} — ${c.description}`);
    return `Available commands:\n${lines.join("\n")}`;
  }

  registerBuiltinCommands(): void {
    this.register({
      name: "model",
      description: "Set or show active model",
      handler: async (args, ctx) => {
        if (args) {
          ctx.providerRegistry.setModel(args);
          return `Model set to: ${args}`;
        }
        return `Active model: ${ctx.providerRegistry.getActiveModel()}`;
      },
    });

    this.register({
      name: "provider",
      description: "Set or show active provider",
      handler: async (args, ctx) => {
        if (args) {
          ctx.providerRegistry.setProvider(args);
          return `Provider set to: ${args}`;
        }
        return `Active provider: ${ctx.providerRegistry.getActiveProvider()}`;
      },
    });

    this.register({
      name: "models",
      description: "List available models",
      handler: async (_args, ctx) => {
        const models = ctx.providerRegistry.listModels();
        if (models.length === 0) return "No models registered.";
        return models.map((m) => `  ${m.id} (${m.provider})`).join("\n");
      },
    });

    this.register({
      name: "remember",
      description: "Save a memory (name: content)",
      handler: async (args, ctx) => {
        const colonIdx = args.indexOf(":");
        if (colonIdx === -1) return "Usage: /remember <name>: <content>";
        const name = args.slice(0, colonIdx).trim();
        const content = args.slice(colonIdx + 1).trim();
        const result = await ctx.memoryManager.remember(name, "knowledge", name, content);
        if (result.isOk()) return `Remembered: ${name}`;
        return `Failed: ${result.error.message}`;
      },
    });

    this.register({
      name: "recall",
      description: "Search memories",
      handler: async (args, ctx) => {
        if (!args) return "Usage: /recall <query>";
        const result = await ctx.memoryManager.recall(args);
        if (result.isOk()) {
          if (result.value.length === 0) return "No memories found.";
          return result.value.map((m) => `[${m.name}] ${m.content}`).join("\n");
        }
        return `Search failed: ${result.error.message}`;
      },
    });

    this.register({
      name: "forget",
      description: "Delete a memory by name",
      handler: async (args, ctx) => {
        if (!args) return "Usage: /forget <name>";
        const result = await ctx.memoryManager.forget(args);
        if (result.isOk()) return `Forgot: ${args}`;
        return `Failed: ${result.error.message}`;
      },
    });

    this.register({
      name: "skills",
      description: "List loaded skills",
      handler: async (_args, ctx) => {
        const skills = ctx.skillRegistry.list();
        if (skills.length === 0) return "No skills loaded.";
        return skills.map((s) => `  ${s.trigger} — ${s.description}`).join("\n");
      },
    });

    this.register({
      name: "sessions",
      description: "List sessions",
      handler: async (_args, ctx) => {
        const sessions = ctx.sessionStore.listSessions();
        if (sessions.length === 0) return "No sessions.";
        return sessions
          .map((s) => `  ${s.id.slice(0, 8)}... ${s.status} ${s.workingDir}`)
          .join("\n");
      },
    });

    this.register({
      name: "yolo",
      description: "Toggle YOLO mode (auto-approve all)",
      handler: async (_args, ctx) => {
        if (ctx.permissionMode.value === "yolo") {
          ctx.setPermissionMode("normal");
          return "YOLO mode disabled. Back to normal.";
        }
        const confirmed = ctx.confirm ? await ctx.confirm("Enable YOLO mode? All actions will be auto-approved.") : true;
        if (confirmed) {
          ctx.setPermissionMode("yolo");
          return "YOLO mode enabled!";
        }
        return "YOLO mode not enabled.";
      },
    });

    this.register({
      name: "help",
      description: "Show available commands",
      handler: async (_args, _ctx) => this.getHelpText(),
    });

    this.register({
      name: "new",
      description: "Start a new session",
      handler: async (_args, ctx) => {
        const session = ctx.sessionStore.createSession(process.cwd());
        return `New session started: ${session.id}`;
      },
    });
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/cli/commands.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/commands.ts tests/unit/cli/commands.test.ts
git commit -m "feat: slash command registry with 10 built-in commands"
```

---

## Task 2: REPL Loop

**Files:**
- Create: `src/cli/repl.ts`
- Create: `tests/unit/cli/repl.test.ts`

The interactive read-eval-print loop. Reads user input, dispatches `/commands` to CommandRegistry, routes skill triggers to SkillExecutor, and sends normal chat to the AgentLoop. Manages session lifecycle (auto-detect + resume on startup).

**Step 1: Write the failing tests**

```typescript
// tests/unit/cli/repl.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { REPL, type REPLDependencies } from "@/cli/repl.js";
import { MockAdapter } from "@/adapters/mock.js";
import { CommandRegistry } from "@/cli/commands.js";
import { SkillRegistry } from "@/skills/registry.js";
import { ToolRegistry } from "@/core/tools.js";
import type { AgentLoopConfig } from "@/types.js";

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

  beforeEach(() => {
    outputs = [];
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
    expect(outputs.some((o) => o.includes("Hello"))).toBe(true);
  });

  it("routes skill triggers to skill executor", async () => {
    deps.adapter = new MockAdapter([
      { content: "Skill response", toolCalls: [], finishReason: "stop" },
    ]);
    deps.providerRegistry.getActiveAdapter = () => deps.adapter;

    // Register a skill
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
    // Skill executor should have been called (via agent loop)
    expect(outputs.length).toBeGreaterThan(0);
  });

  it("creates a new session on first chat", async () => {
    deps.adapter = new MockAdapter([
      { content: "Hi", toolCalls: [], finishReason: "stop" },
    ]);
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

    // Second call should have accumulated history
    expect(deps.sessionStore.appendMessage).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/cli/repl.test.ts
```

Expected: FAIL

**Step 3: Create src/cli/repl.ts**

```typescript
// src/cli/repl.ts
import type { CommandRegistry, CommandContext } from "./commands.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { SkillExecutor } from "../skills/executor.js";
import type { ToolRegistry } from "../core/tools.js";
import type { ModelAdapter, AgentLoopConfig, Message, PermissionMode } from "../types.js";
import type { ProviderRegistry } from "../adapters/registry.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SessionStore } from "../memory/session.js";
import { AgentLoop } from "../core/agent.js";
import { SkillLoader, type Skill } from "../skills/loader.js";

export interface REPLDependencies {
  commandRegistry: CommandRegistry;
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  adapter: ModelAdapter;
  loopConfig: AgentLoopConfig;
  permissionMode: { value: PermissionMode };
  setPermissionMode: (mode: PermissionMode) => void;
  providerRegistry: ProviderRegistry;
  memoryManager: MemoryManager;
  sessionStore: SessionStore;
  onOutput: (text: string) => void;
  confirm?: (message: string) => Promise<boolean>;
}

export class REPL {
  private deps: REPLDependencies;
  private messages: Message[] = [];
  private sessionId: string | null = null;

  constructor(deps: REPLDependencies) {
    this.deps = deps;
  }

  async processInput(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) return "";

    // Exit
    if (trimmed === "/exit" || trimmed === "/quit") return "exit";

    // Slash commands
    if (trimmed.startsWith("/")) {
      // Check if it's a skill trigger
      const skillTrigger = this.parseSkillTrigger(trimmed);
      if (skillTrigger) {
        return await this.executeSkill(skillTrigger.skill, skillTrigger.args);
      }

      // Regular command
      const ctx = this.buildCommandContext();
      const result = await this.deps.commandRegistry.dispatch(trimmed, ctx);
      this.deps.onOutput(result);
      return result;
    }

    // Normal chat
    return await this.chat(trimmed);
  }

  private parseSkillTrigger(input: string): { skill: Skill; args: string } | null {
    const parts = input.split(/\s+(.*)/s);
    const trigger = parts[0];
    const skill = this.deps.skillRegistry.getByTrigger(trigger);
    if (!skill) return null;
    return { skill, args: parts[1] ?? "" };
  }

  private async executeSkill(skill: Skill, args: string): Promise<string> {
    const executor = new SkillExecutor(this.deps.toolRegistry);
    const result = await executor.execute(skill, args || skill.description, {
      adapter: this.deps.providerRegistry.getActiveAdapter(),
      permissionMode: this.deps.permissionMode.value,
      loopConfig: this.deps.loopConfig,
    });

    if (result.isOk()) {
      let output = "";
      for (const event of result.value.events) {
        if (event.type === "text-delta" && event.text) {
          output += event.text;
        }
        if (event.type === "tool-call") {
          output += `\n[Tool: ${event.toolName}]`;
        }
      }
      this.deps.onOutput(output);
      return output;
    }

    this.deps.onOutput(`Skill failed: ${result.error.message}`);
    return `Skill failed: ${result.error.message}`;
  }

  private async chat(message: string): Promise<string> {
    // Ensure session exists
    if (!this.sessionId) {
      const session = this.deps.sessionStore.createSession(process.cwd());
      this.sessionId = session.id;
    }

    // Add user message
    this.messages.push({ role: "user", content: message });
    this.deps.sessionStore.appendMessage(this.sessionId, "user", message, 0);

    // Run agent loop
    const adapter = this.deps.providerRegistry.getActiveAdapter();
    const loop = new AgentLoop(
      adapter,
      this.deps.toolRegistry,
      this.deps.permissionMode.value,
      this.deps.loopConfig,
    );

    let output = "";
    for await (const event of loop.run(this.messages)) {
      if (event.type === "text-delta" && event.text) {
        output += event.text;
      }
      if (event.type === "tool-call") {
        output += `\n[Tool: ${event.toolName}]`;
      }
      if (event.type === "tool-result" && event.toolResult) {
        output += `\n[Result: ${event.toolResult.content.slice(0, 100)}]`;
      }
    }

    // Add assistant response to history
    if (output) {
      this.messages.push({ role: "assistant", content: output });
      this.deps.sessionStore.appendMessage(this.sessionId, "assistant", output, 0);
    }

    this.deps.onOutput(output);
    return output;
  }

  private buildCommandContext(): CommandContext {
    return {
      providerRegistry: this.deps.providerRegistry,
      memoryManager: this.deps.memoryManager,
      sessionStore: this.deps.sessionStore,
      skillRegistry: this.deps.skillRegistry,
      permissionMode: this.deps.permissionMode,
      setPermissionMode: this.deps.setPermissionMode,
      output: this.deps.onOutput,
      confirm: this.deps.confirm,
    };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/cli/repl.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/repl.ts tests/unit/cli/repl.test.ts
git commit -m "feat: REPL loop with command dispatch, skill routing, chat history"
```

---

## Task 3: MCP Tools

**Files:**
- Create: `src/mcp/tools.ts`
- Create: `tests/unit/mcp/tools.test.ts`

Defines the 6 MCP-exposed tools: `memory_search`, `memory_add`, `memory_get_context`, `skill_list`, `skill_execute`, `model_list`. Each tool wraps the corresponding internal module and adapts input/output to MCP format.

**Step 1: Write the failing tests**

```typescript
// tests/unit/mcp/tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMCPTools, type MCPToolContext } from "@/mcp/tools.js";

describe("MCP Tools", () => {
  let ctx: MCPToolContext;

  beforeEach(() => {
    ctx = {
      memoryManager: {
        recall: vi.fn(async () => ({
          isOk: () => true,
          value: [
            { name: "user-profile", content: "Alice is a developer", type: "user", score: 1, source: "file", description: "" },
          ],
        })),
        remember: vi.fn(async () => ({ isOk: () => true })),
        getSystemContext: vi.fn(async () => "# Memory Index\n\n- [user-profile](user-profile.md)"),
      } as any,
      skillRegistry: {
        list: vi.fn(() => [
          { name: "paper-search", trigger: "/paper-search", description: "Search papers", type: "domain", prompt: "Search", sourcePath: "" },
        ]),
        getByTrigger: vi.fn(() => null),
      } as any,
      providerRegistry: {
        listModels: vi.fn(() => [
          { id: "claude-sonnet-4-6", provider: "anthropic", capabilities: { tools: true, vision: true, maxTokens: 16384, contextWindow: 200000 } },
        ]),
        getActiveProvider: vi.fn(() => "anthropic"),
        getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({
          isOk: () => true,
          value: { events: [{ type: "text-delta", text: "Skill result" }] },
        })),
      } as any,
    };
  });

  it("creates all 6 MCP tools", () => {
    const tools = createMCPTools(ctx);
    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "memory_add",
      "memory_get_context",
      "memory_search",
      "model_list",
      "skill_execute",
      "skill_list",
    ]);
  });

  it("memory_search returns results", async () => {
    const tools = createMCPTools(ctx);
    const searchTool = tools.find((t) => t.name === "memory_search")!;
    const result = await searchTool.handler({ query: "developer" });
    expect(result.content).toContain("user-profile");
    expect(result.content).toContain("Alice");
  });

  it("memory_add saves a memory", async () => {
    const tools = createMCPTools(ctx);
    const addTool = tools.find((t) => t.name === "memory_add")!;
    const result = await addTool.handler({ name: "test", content: "Test memory", type: "knowledge" });
    expect(ctx.memoryManager.remember).toHaveBeenCalledWith("test", "knowledge", "test", "Test memory");
    expect(result.content).toContain("Saved");
  });

  it("memory_get_context returns system context", async () => {
    const tools = createMCPTools(ctx);
    const ctxTool = tools.find((t) => t.name === "memory_get_context")!;
    const result = await ctxTool.handler({});
    expect(result.content).toContain("user-profile");
  });

  it("skill_list lists available skills", async () => {
    const tools = createMCPTools(ctx);
    const listTool = tools.find((t) => t.name === "skill_list")!;
    const result = await listTool.handler({});
    expect(result.content).toContain("paper-search");
  });

  it("skill_execute runs a skill", async () => {
    ctx.skillRegistry.getByTrigger = vi.fn(() => ({
      name: "paper-search", trigger: "/paper-search", description: "Search papers",
      type: "domain", prompt: "Search", sourcePath: "", tools: [],
    })) as any;

    const tools = createMCPTools(ctx);
    const execTool = tools.find((t) => t.name === "skill_execute")!;
    const result = await execTool.handler({ skill: "/paper-search", input: "transformers" });
    expect(ctx.skillExecutor.execute).toHaveBeenCalled();
  });

  it("model_list lists models", async () => {
    const tools = createMCPTools(ctx);
    const listTool = tools.find((t) => t.name === "model_list")!;
    const result = await listTool.handler({});
    expect(result.content).toContain("claude-sonnet-4-6");
    expect(result.content).toContain("anthropic");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/mcp/tools.test.ts
```

Expected: FAIL

**Step 3: Create src/mcp/tools.ts**

```typescript
// src/mcp/tools.ts
import type { MemoryManager } from "../memory/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { ProviderRegistry } from "../adapters/registry.js";
import type { SkillExecutor } from "../skills/executor.js";

export interface MCPToolContext {
  memoryManager: MemoryManager;
  skillRegistry: SkillRegistry;
  providerRegistry: ProviderRegistry;
  skillExecutor: SkillExecutor;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{ content: string }>;
}

export function createMCPTools(ctx: MCPToolContext): MCPTool[] {
  return [
    {
      name: "memory_search",
      description: "Search memories by query",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
      handler: async ({ query }) => {
        const result = await ctx.memoryManager.recall(query as string);
        if (result.isOk()) {
          if (result.value.length === 0) return { content: "No memories found." };
          return {
            content: result.value.map((m) => `[${m.name}] ${m.content}`).join("\n"),
          };
        }
        return { content: `Search failed: ${result.error.message}` };
      },
    },
    {
      name: "memory_add",
      description: "Add a new memory",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Memory name" },
          content: { type: "string", description: "Memory content" },
          type: { type: "string", description: "Memory type (user/project/knowledge/feedback)" },
        },
        required: ["name", "content"],
      },
      handler: async ({ name, content, type }) => {
        const result = await ctx.memoryManager.remember(
          name as string,
          (type as string) ?? "knowledge",
          name as string,
          content as string,
        );
        if (result.isOk()) return { content: `Saved memory: ${name}` };
        return { content: `Failed: ${result.error.message}` };
      },
    },
    {
      name: "memory_get_context",
      description: "Get the full memory context (MEMORY.md index)",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const context = await ctx.memoryManager.getSystemContext();
        return { content: context };
      },
    },
    {
      name: "skill_list",
      description: "List available skills",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const skills = ctx.skillRegistry.list();
        if (skills.length === 0) return { content: "No skills loaded." };
        return {
          content: skills.map((s) => `${s.trigger} — ${s.description}`).join("\n"),
        };
      },
    },
    {
      name: "skill_execute",
      description: "Execute a named skill",
      inputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", description: "Skill trigger (e.g. /paper-search)" },
          input: { type: "string", description: "Input for the skill" },
        },
        required: ["skill"],
      },
      handler: async ({ skill, input }) => {
        const skillObj = ctx.skillRegistry.getByTrigger(skill as string);
        if (!skillObj) return { content: `Skill not found: ${skill}` };

        const result = await ctx.skillExecutor.execute(skillObj, (input as string) || "", {
          adapter: null as any, // filled by MCP server with active adapter
          permissionMode: "auto",
          loopConfig: {
            maxLoops: 50,
            maxOutputTokensPerTurn: 4096,
            budgetTotal: 50,
            refundableTools: [],
            streaming: false,
            interruptible: false,
          },
        });

        if (result.isOk()) {
          const texts = result.value.events
            .filter((e) => e.type === "text-delta" && e.text)
            .map((e) => e.text);
          return { content: texts.join("") || "Skill completed." };
        }
        return { content: `Skill failed: ${result.error.message}` };
      },
    },
    {
      name: "model_list",
      description: "List available models",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const models = ctx.providerRegistry.listModels();
        const provider = ctx.providerRegistry.getActiveProvider();
        const model = ctx.providerRegistry.getActiveModel();
        const lines = models.map((m) => `${m.id} (${m.provider})`);
        lines.push(`\nActive: ${model} @ ${provider}`);
        return { content: lines.join("\n") };
      },
    },
  ];
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/mcp/tools.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp/tools.ts tests/unit/mcp/tools.test.ts
git commit -m "feat: 6 MCP-exposed tools wrapping memory, skills, and model APIs"
```

---

## Task 4: MCP Server

**Files:**
- Create: `src/mcp/server.ts`
- Create: `tests/unit/mcp/server.test.ts`

MCP server using `@modelcontextprotocol/sdk`. Supports stdio transport (default for `--mcp`) and SSE transport (for `--mcp --port 3000`). Registers the 6 tools from Task 3 and handles tool call routing.

**Step 1: Write the failing tests**

```typescript
// tests/unit/mcp/server.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPServer } from "@/mcp/server.js";
import { createMCPTools, type MCPToolContext } from "@/mcp/tools.js";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(() => ({ connect: vi.fn() })),
}));

describe("MCPServer", () => {
  let ctx: MCPToolContext;

  beforeEach(() => {
    ctx = {
      memoryManager: {
        recall: vi.fn(async () => ({ isOk: () => true, value: [] })),
        remember: vi.fn(async () => ({ isOk: () => true })),
        getSystemContext: vi.fn(async () => ""),
      } as any,
      skillRegistry: {
        list: vi.fn(() => []),
        getByTrigger: vi.fn(() => null),
      } as any,
      providerRegistry: {
        listModels: vi.fn(() => []),
        getActiveProvider: vi.fn(() => "anthropic"),
        getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({ isOk: () => true, value: { events: [] } })),
      } as any,
    };
  });

  it("creates server with tool context", () => {
    const server = new MCPServer(ctx);
    expect(server).toBeDefined();
  });

  it("registers tools from context", () => {
    const server = new MCPServer(ctx);
    const tools = server.getRegisteredTools();
    expect(tools).toHaveLength(6);
  });

  it("creates with stdio transport mode", () => {
    const server = new MCPServer(ctx, { transport: "stdio" });
    expect(server.getTransportMode()).toBe("stdio");
  });

  it("creates with SSE transport mode", () => {
    const server = new MCPServer(ctx, { transport: "sse", port: 3000 });
    expect(server.getTransportMode()).toBe("sse");
    expect(server.getPort()).toBe(3000);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/mcp/server.test.ts
```

Expected: FAIL

**Step 3: Add MCP SDK dependency**

```bash
pnpm add @modelcontextprotocol/sdk
```

**Step 4: Create src/mcp/server.ts**

```typescript
// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPTools, type MCPToolContext } from "./tools.js";

export interface MCPServerOptions {
  transport?: "stdio" | "sse";
  port?: number;
}

export class MCPServer {
  private server: Server;
  private tools: ReturnType<typeof createMCPTools>;
  private options: MCPServerOptions;
  private toolContext: MCPToolContext;

  constructor(ctx: MCPToolContext, options: MCPServerOptions = {}) {
    this.toolContext = ctx;
    this.options = options;

    this.tools = createMCPTools(ctx);

    this.server = new Server(
      { name: "hiwi-agent", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List tools
    this.server.setRequestHandler(
      { method: "tools/list" } as any,
      async () => ({
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }),
    );

    // Call tool
    this.server.setRequestHandler(
      { method: "tools/call" } as any,
      async (request: any) => {
        const toolName = request.params.name;
        const toolArgs = request.params.arguments ?? {};

        const tool = this.tools.find((t) => t.name === toolName);
        if (!tool) {
          return {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          };
        }

        try {
          const result = await tool.handler(toolArgs);
          return {
            content: [{ type: "text", text: result.content }],
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      },
    );
  }

  async start(): Promise<void> {
    if (this.options.transport === "sse") {
      // SSE transport would use SSEServerTransport from the SDK
      // For MVP, stdio is the primary mode
      throw new Error("SSE transport not yet implemented. Use stdio mode.");
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  getRegisteredTools() {
    return this.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  getTransportMode() {
    return this.options.transport ?? "stdio";
  }

  getPort() {
    return this.options.port ?? 0;
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/mcp/server.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/mcp/server.ts tests/unit/mcp/server.test.ts
git commit -m "feat: MCP server with stdio transport and tool call routing"
```

---

## Task 5: Ink TUI (Minimal Streaming Renderer)

**Files:**
- Create: `src/cli/app.tsx`
- Create: `tests/unit/cli/app.test.tsx`

Minimal Ink-based TUI that renders streaming agent output. Shows: user prompt, streaming assistant response, tool calls, and command output. For MVP, a simple renderer that displays text as it arrives — the full OpenCode StreamCommit pattern (role-gated buffering, incremental markdown, tool echo stripping) is deferred to Phase 2 polish.

**Step 1: Write the failing tests**

```typescript
// tests/unit/cli/app.test.tsx
import { describe, it, expect } from "vitest";
import { renderApp, type AppProps } from "@/cli/app.js";

describe("App (TUI)", () => {
  it("exports a renderApp function", () => {
    expect(typeof renderApp).toBe("function");
  });

  it("returns an object with render control methods", () => {
    const app = renderApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("waitUntilExit");
    expect(typeof app.addOutput).toBe("function");
  });

  it("addOutput accepts text and role", () => {
    const app = renderApp({ onInput: async () => {} });
    // Should not throw
    app.addOutput("Hello, world!", "assistant");
    app.addOutput("Tool: read_file", "tool");
    app.addOutput("System message", "system");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/cli/app.test.tsx
```

Expected: FAIL

**Step 3: Add Ink + React dependencies**

```bash
pnpm add ink react
pnpm add -D @types/react
```

**Step 4: Create src/cli/app.tsx**

```typescript
// src/cli/app.tsx
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp } from "ink";

export interface AppProps {
  onInput: (text: string) => Promise<void>;
}

interface OutputLine {
  text: string;
  role: "user" | "assistant" | "tool" | "system" | "error";
}

function App({ onInput }: AppProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const { exit } = useApp();

  useInput((char, key) => {
    if (key.escape) {
      exit();
      return;
    }

    if (key.return) {
      if (input.trim() === "/exit" || input.trim() === "/quit") {
        exit();
        return;
      }

      const userText = input;
      setLines((prev) => [...prev, { text: userText, role: "user" }]);
      setInput("");
      setProcessing(true);

      onInput(userText)
        .then(() => setProcessing(false))
        .catch(() => setProcessing(false));
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    setInput((prev) => prev + char);
  });

  const roleColor = (role: string) => {
    switch (role) {
      case "user": return "cyan";
      case "assistant": return "green";
      case "tool": return "yellow";
      case "error": return "red";
      default: return "white";
    }
  };

  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Box key={i} flexDirection="column">
          <Text color={roleColor(line.role)}>{line.text}</Text>
        </Box>
      ))}
      {processing && <Text color="gray">Thinking...</Text>}
      <Box marginTop={1}>
        <Text color="blue">&gt; </Text>
        <Text>{input}</Text>
        <Text color="gray">█</Text>
      </Box>
    </Box>
  );
}

export function renderApp(props: AppProps) {
  let addOutputFn: ((text: string, role: OutputLine["role"]) => void) = () => {};

  // We'll use a simple approach: the render instance plus an imperative API
  const instance = render(React.createElement(App, props));

  return {
    addOutput: (text: string, role: OutputLine["role"] = "assistant") => {
      // For MVP, just write to stdout (Ink handles the terminal)
      // In Phase 2, this would update React state via a ref
      process.stdout.write(`${text}\n`);
    },
    waitUntilExit: () => instance.waitUntilExit(),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/cli/app.test.tsx
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/cli/app.tsx tests/unit/cli/app.test.tsx
git commit -m "feat: minimal Ink TUI with streaming output and input handling"
```

---

## Task 6: CLI Entry Point + Integration Test

**Files:**
- Create: `src/cli/index.ts`
- Create: `tests/integration/cli-mcp.test.ts`
- Modify: `src/index.ts`

The main entry point. Parses args: `hiwi-agent` (CLI mode), `hiwi-agent --mcp` (MCP stdio), `hiwi-agent --mcp --port 3000` (MCP SSE). Initializes all modules, discovers skills, starts REPL or MCP server.

**Step 1: Create src/cli/index.ts**

```typescript
// src/cli/index.ts
import { loadConfig } from "../core/config.js";
import { ProviderRegistry } from "../adapters/registry.js";
import { ToolRegistry } from "../core/tools.js";
import { MemoryFileStore } from "../memory/file-store.js";
import { Mem0Client } from "../memory/mem0-client.js";
import { MemoryManager } from "../memory/manager.js";
import { SessionStore } from "../memory/session.js";
import { SkillLoader } from "../skills/loader.js";
import { SkillRegistry } from "../skills/registry.js";
import { SkillExecutor } from "../skills/executor.js";
import { CommandRegistry } from "./commands.js";
import { REPL } from "./repl.js";
import { MCPServer } from "../mcp/server.js";
import path from "node:path";
import os from "node:os";

export interface CLIOptions {
  mcp?: boolean;
  port?: number;
  debug?: boolean;
}

export async function main(options: CLIOptions = {}): Promise<void> {
  // 1. Load config
  const globalDir = path.join(os.homedir(), ".hiwi-agent");
  const projectDir = process.cwd();
  const configResult = await loadConfig(globalDir, projectDir);

  if (configResult.isErr()) {
    console.error(`Config error: ${configResult.error.message}`);
    process.exit(1);
  }

  const config = configResult.value;

  // 2. Set up provider registry
  const providerRegistry = new ProviderRegistry(config);
  const providerNames = Object.keys(config.providers);
  for (const name of providerNames) {
    try {
      const adapter = providerRegistry.createAdapter(name);
      providerRegistry.registerAdapter(name, adapter);
    } catch {
      // skip providers that fail (e.g. no API key)
    }
  }

  // 3. Set up tool registry (built-in tools added in later phase)
  const toolRegistry = new ToolRegistry();

  // 4. Set up memory
  const memoryDir = path.join(globalDir, "memory");
  const fileStore = new MemoryFileStore(memoryDir);
  await fileStore.init();
  const mem0 = new Mem0Client({
    apiKey: config.providers.mem0?.apiKey,
    host: config.providers.mem0?.baseUrl,
  });
  const memoryManager = new MemoryManager(fileStore, mem0);

  // 5. Set up session
  const sessionDir = path.join(projectDir, ".agent");
  const sessionStore = new SessionStore(path.join(sessionDir, "session.db"));
  sessionStore.init();

  // 6. Discover skills
  const skillSearchPaths = [
    path.join(globalDir, "skills"),
    path.join(projectDir, ".agent", "skills"),
    path.join(projectDir, ".opencode", "skills"),
    path.join(projectDir, ".claude", "skills"),
  ];
  const skillLoader = new SkillLoader(skillSearchPaths);
  const skills = await skillLoader.discover();
  const skillRegistry = new SkillRegistry();
  for (const skill of skills) {
    skillRegistry.register(skill);
  }

  // 7. Route to CLI or MCP mode
  if (options.mcp) {
    const skillExecutor = new SkillExecutor(toolRegistry);
    const mcpServer = new MCPServer(
      { memoryManager, skillRegistry, providerRegistry, skillExecutor },
      { transport: "stdio", port: options.port },
    );
    await mcpServer.start();
    return;
  }

  // CLI mode
  const commandRegistry = new CommandRegistry();
  commandRegistry.registerBuiltinCommands();

  const permissionMode = { value: "normal" as const };

  const repl = new REPL({
    commandRegistry,
    skillRegistry,
    toolRegistry,
    adapter: providerRegistry.getActiveAdapter(),
    loopConfig: config.agent,
    permissionMode,
    setPermissionMode: (mode) => { permissionMode.value = mode; },
    providerRegistry,
    memoryManager,
    sessionStore,
    onOutput: (text) => process.stdout.write(`${text}\n`),
  });

  // Simple stdin loop (Ink TUI replaces this in production)
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  process.stdout.write("hiwi-agent ready. Type /help for commands.\n");

  for await (const line of rl) {
    const result = await repl.processInput(line);
    if (result === "exit") break;
  }

  sessionStore.close();
}
```

**Step 2: Write integration test**

```typescript
// tests/integration/cli-mcp.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CommandRegistry } from "@/cli/commands.js";
import { SkillLoader } from "@/skills/loader.js";
import { SkillRegistry } from "@/skills/registry.js";
import { ToolRegistry } from "@/core/tools.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { MemoryManager } from "@/memory/manager.js";
import { SessionStore } from "@/memory/session.js";
import { createMCPTools } from "@/mcp/tools.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Integration: CLI + MCP", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-cli-integration");
  const skillsDir = path.join(tmpDir, "skills");
  const memoryDir = path.join(tmpDir, "memory");

  beforeEach(async () => {
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(memoryDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("discovers skills and exposes them via MCP", async () => {
    // Write a skill
    await fs.writeFile(
      path.join(skillsDir, "SKILL.md"),
      '---\nname: "echo"\ntype: domain\ndescription: "Echo input"\ntrigger: "/echo"\n---\n\nEcho back the input.',
    );

    // Discover
    const loader = new SkillLoader([skillsDir]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(1);

    const skillRegistry = new SkillRegistry();
    for (const s of skills) skillRegistry.register(s);

    // MCP tools
    const memoryDir2 = path.join(tmpDir, "mem");
    await fs.mkdir(memoryDir2, { recursive: true });
    const fileStore = new MemoryFileStore(memoryDir2);
    await fileStore.init();
    const mem0 = new Mem0Client({ apiKey: undefined });
    const memMgr = new MemoryManager(fileStore, mem0);
    const toolRegistry = new ToolRegistry();

    const mcpTools = createMCPTools({
      memoryManager: memMgr,
      skillRegistry,
      providerRegistry: {
        listModels: () => [],
        getActiveProvider: () => "test",
        getActiveModel: () => "test",
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({ isOk: () => true, value: { events: [] } })),
      } as any,
    });

    // Skill should be listed
    const listResult = await mcpTools.find((t) => t.name === "skill_list")!.handler({});
    expect(listResult.content).toContain("/echo");
  });

  it("remembers and recalls via slash commands", async () => {
    const fileStore = new MemoryFileStore(memoryDir);
    await fileStore.init();
    const mem0 = new Mem0Client({ apiKey: undefined });
    const memMgr = new MemoryManager(fileStore, mem0);

    // Remember
    const addResult = await memMgr.remember("test-note", "knowledge", "Test", "Hello world note");
    expect(addResult.isOk()).toBe(true);

    // Recall
    const searchResult = await memMgr.recall("Hello");
    expect(searchResult.isOk()).toBe(true);
    if (searchResult.isOk()) {
      expect(searchResult.value.length).toBeGreaterThan(0);
      expect(searchResult.value[0].content).toContain("Hello world note");
    }
  });
});
```

**Step 3: Update src/index.ts to export Sprint 4 modules**

```typescript
// Add to src/index.ts:
// CLI
export { CommandRegistry, type Command, type CommandContext } from "./cli/commands.js";
export { REPL, type REPLDependencies } from "./cli/repl.js";
export { renderApp, type AppProps } from "./cli/app.js";
export { main } from "./cli/index.js";

// MCP
export { MCPServer, type MCPServerOptions } from "./mcp/server.js";
export { createMCPTools, type MCPTool, type MCPToolContext } from "./mcp/tools.js";
```

**Step 4: Run all tests**

```bash
pnpm test
```

Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/cli/index.ts tests/integration/cli-mcp.test.ts src/index.ts
git commit -m "feat: CLI entry point with module init, REPL + MCP dual mode, integration tests"
```

---

## Sprint 4 Summary

### Files Created (6 source + 5 test)

| Category | Source Files | Test Files |
|----------|-------------|------------|
| Commands | `src/cli/commands.ts` | `tests/unit/cli/commands.test.ts` |
| REPL | `src/cli/repl.ts` | `tests/unit/cli/repl.test.ts` |
| TUI | `src/cli/app.tsx` | `tests/unit/cli/app.test.tsx` |
| MCP Tools | `src/mcp/tools.ts` | `tests/unit/mcp/tools.test.ts` |
| MCP Server | `src/mcp/server.ts` | `tests/unit/mcp/server.test.ts` |
| Entry Point | `src/cli/index.ts` | `tests/integration/cli-mcp.test.ts` |

### New Dependencies

| Package | Purpose |
|---------|---------|
| `ink` + `react` | Terminal UI framework |
| `@modelcontextprotocol/sdk` | MCP server protocol |
| `commander` | CLI argument parsing (optional, can use manual arg parse) |

### 10 Slash Commands

| Command | Description |
|---------|-------------|
| `/model <id>` | Set or show active model |
| `/provider <name>` | Set or show active provider |
| `/models` | List available models |
| `/remember <name>: <content>` | Save a memory |
| `/recall <query>` | Search memories |
| `/forget <name>` | Delete a memory |
| `/skills` | List loaded skills |
| `/sessions` | List sessions |
| `/yolo` | Toggle YOLO mode |
| `/help` | Show commands |

### 6 MCP-Exposed Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Search memories by query |
| `memory_add` | Add a new memory |
| `memory_get_context` | Get full MEMORY.md context |
| `skill_list` | List available skills |
| `skill_execute` | Execute a named skill |
| `model_list` | List available models |

### Startup Modes

```bash
hiwi-agent              # CLI mode (REPL + Ink TUI)
hiwi-agent --mcp        # MCP server (stdio)
hiwi-agent --mcp --port 3000  # MCP server (SSE, Phase 2)
hiwi-agent --debug      # Debug logging
```

---

## Full MVP Summary (Sprints 1-4)

### Total Files

| Sprint | Source | Tests | Key Modules |
|--------|--------|-------|-------------|
| 1: Core | 12 | 11 | Types, Config, Adapters, Registry, Tools, Agent Loop |
| 2: Memory | 5 | 6 | File Store, mem0, Manager, Session, Compaction |
| 3: Skills | 3 | 4 | Loader, Registry, Executor |
| 4: CLI+MCP | 6 | 5 | Commands, REPL, TUI, MCP Tools, MCP Server |
| **Total** | **26** | **26** | **Complete MVP** |

### Architecture

```
hiwi-agent/
├── src/
│   ├── types.ts              # Shared types
│   ├── core/
│   │   ├── config.ts         # Config loading (Zod)
│   │   ├── agent.ts          # Agent loop (while-loop)
│   │   └── tools.ts          # Tool registry + permissions
│   ├── adapters/
│   │   ├── anthropic.ts      # Claude adapter
│   │   ├── openai-compat.ts  # OpenAI/DeepSeek/Zhipu/Kimi/MiniMax
│   │   ├── ollama.ts         # Ollama adapter
│   │   ├── mock.ts           # Test mock
│   │   └── registry.ts       # Provider registry
│   ├── memory/
│   │   ├── file-store.ts     # MEMORY.md + frontmatter
│   │   ├── mem0-client.ts    # mem0 SDK wrapper
│   │   ├── manager.ts        # Memory orchestrator
│   │   ├── session.ts        # SQLite session
│   │   └── compaction.ts     # Context compaction
│   ├── skills/
│   │   ├── loader.ts         # SKILL.md discovery
│   │   ├── registry.ts       # Skill registry
│   │   └── executor.ts       # Skill execution
│   ├── cli/
│   │   ├── commands.ts       # Slash commands
│   │   ├── repl.ts           # Interactive REPL
│   │   ├── app.tsx           # Ink TUI
│   │   └── index.ts          # Entry point
│   ├── mcp/
│   │   ├── server.ts         # MCP server
│   │   └── tools.ts          # MCP-exposed tools
│   └── index.ts              # Public exports
├── config/
│   └── default.json
├── package.json
├── tsconfig.json
├── biome.json
├── vitest.config.ts
└── tsup.config.ts
```
