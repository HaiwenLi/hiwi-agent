import { type Command, type CommandContext, CommandRegistry } from "@/cli/commands.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const makeContext = (): CommandContext => ({
  providerRegistry: {
    setProvider: vi.fn(),
    setModel: vi.fn(),
    getActiveProvider: vi.fn(() => "anthropic"),
    getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
    listModels: vi.fn(() => [
      { id: "gpt-4o", provider: "openai", capabilities: {} },
    ]),
    ensureAdapter: vi.fn(() => ({})),
    updateProviderConfig: vi.fn(),
    registerAdapter: vi.fn(),
    createAdapter: vi.fn(() => ({})),
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
    it("/model with args sets active model", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/model gpt-4o", ctx);
      expect(ctx.providerRegistry.setModel).toHaveBeenCalledWith("gpt-4o");
    });

    it("/model with no args requests mode switch to model-picker", async () => {
      const modeSwitchSpy = vi.fn();
      registry.registerBuiltinCommands();
      await registry.dispatch("/model", { ...ctx, requestModeSwitch: modeSwitchSpy });
      expect(modeSwitchSpy).toHaveBeenCalledWith("model-picker");
    });

    it("/provider with args sets active provider", async () => {
      registry.registerBuiltinCommands();
      await registry.dispatch("/provider openai", ctx);
      expect(ctx.providerRegistry.setProvider).toHaveBeenCalledWith("openai");
    });

    it("/provider with no args requests mode switch to provider-picker", async () => {
      const modeSwitchSpy = vi.fn();
      registry.registerBuiltinCommands();
      await registry.dispatch("/provider", { ...ctx, requestModeSwitch: modeSwitchSpy });
      expect(modeSwitchSpy).toHaveBeenCalledWith("provider-picker");
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
