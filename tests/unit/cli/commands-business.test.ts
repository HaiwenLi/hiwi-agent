/**
 * Business-logic tests for built-in CLI commands using REAL stores.
 *
 * No mocks on stores or managers — only vi.fn() for side-effect callbacks
 * (setPermissionMode, confirm, output).
 */
import { CommandRegistry, type CommandContext } from "@/cli/commands.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { SessionStore } from "@/memory/session.js";
import { SkillRegistry } from "@/skills/registry.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import { MockAdapter } from "@/adapters/mock.js";
import type { AgentConfig, PermissionMode } from "@/types.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// ─── Helpers ────────────────────────────────────────────────────────

interface SetupResult {
  ctx: CommandContext;
  cleanup: () => Promise<void>;
  memoryManager: MemoryManager;
  sessionStore: SessionStore;
  permissionMode: { value: PermissionMode };
  setPermissionMode: ReturnType<typeof vi.fn>;
  thinkingEffort: string;
}

async function createCommandContext(overrides?: Partial<CommandContext>): Promise<SetupResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-cmd-"));
  const fileStore = new MemoryFileStore(path.join(tempDir, "memory"));
  await fileStore.init();
  const mem0 = new Mem0Client({ apiKey: undefined });
  const memoryManager = new MemoryManager(fileStore, mem0);
  const sessionDbPath = path.join(tempDir, "sessions.db");
  const sessionStore = new SessionStore(sessionDbPath);
  await sessionStore.init();

  const config: AgentConfig = {
    activeProvider: "mock",
    activeModel: "mock-model",
    providers: {},
    agent: {
      maxLoops: 50,
      maxOutputTokensPerTurn: 4096,
      budgetTotal: 50,
      refundableTools: [],
      streaming: false,
      interruptible: true,
    },
  };
  const providerRegistry = new ProviderRegistry(config);
  const adapter = new MockAdapter([
    { content: "Done", toolCalls: [], finishReason: "stop" },
  ]);
  providerRegistry.registerAdapter("mock", adapter);

  const permissionMode = { value: "normal" as PermissionMode };
  const setPermissionMode = vi.fn((mode: PermissionMode) => {
    permissionMode.value = mode;
  });
  let thinkingEffort = "high";

  const ctx: CommandContext = {
    providerRegistry,
    memoryManager,
    sessionStore,
    skillRegistry: new SkillRegistry(),
    permissionMode,
    setPermissionMode,
    output: vi.fn(),
    thinkingEffort,
    setThinkingEffort: (effort: string) => {
      thinkingEffort = effort;
    },
    ...overrides,
  };

  return {
    ctx,
    cleanup: async () => {
      sessionStore.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    },
    memoryManager,
    sessionStore,
    permissionMode,
    setPermissionMode,
    thinkingEffort,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("built-in commands (real stores)", () => {
  let registry: CommandRegistry;
  let setup: SetupResult;

  beforeEach(async () => {
    setup = await createCommandContext();
    registry = new CommandRegistry();
    registry.registerBuiltinCommands();
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  // ── /remember ───────────────────────────────────────────────────

  describe("/remember", () => {
    it("valid format stores and returns 'Remembered: name'", async () => {
      const result = await registry.dispatch(
        "/remember user-profile: Alice is a developer",
        setup.ctx,
      );
      expect(result).toBe("Remembered: user-profile");

      // Verify actually stored via recall
      const recallResult = await setup.memoryManager.recall("Alice");
      expect(recallResult.isOk()).toBe(true);
      expect(recallResult.value.length).toBeGreaterThan(0);
      expect(recallResult.value[0].name).toBe("user-profile");
      expect(recallResult.value[0].content).toBe("Alice is a developer");
    });

    it("no colon returns usage message", async () => {
      const result = await registry.dispatch("/remember no-colon-here", setup.ctx);
      expect(result).toContain("Usage: /remember");
    });

    it("empty content after colon stores empty content", async () => {
      const result = await registry.dispatch("/remember empty-name: ", setup.ctx);
      expect(result).toBe("Remembered: empty-name");

      // Verify stored
      const recallResult = await setup.memoryManager.recall("empty-name");
      expect(recallResult.isOk()).toBe(true);
      expect(recallResult.value.length).toBeGreaterThan(0);
      expect(recallResult.value[0].name).toBe("empty-name");
    });

    it("write failure returns 'Failed: ...'", async () => {
      // Create a context with a memoryManager that throws on remember
      const brokenManager = {
        remember: async () => {
          const { err } = await import("neverthrow");
          return err(new Error("disk full"));
        },
      } as any;
      const brokenSetup = await createCommandContext({
        memoryManager: brokenManager,
      });
      try {
        const result = await registry.dispatch(
          "/remember test: value",
          brokenSetup.ctx,
        );
        expect(result).toContain("Failed:");
      } finally {
        await brokenSetup.cleanup();
      }
    });
  });

  // ── /recall ─────────────────────────────────────────────────────

  describe("/recall", () => {
    it("with matches returns formatted output", async () => {
      // First remember something
      await setup.memoryManager.remember(
        "lang-pref",
        "knowledge",
        "lang-pref",
        "TypeScript is preferred",
      );

      const result = await registry.dispatch("/recall TypeScript", setup.ctx);
      expect(result).toContain("[lang-pref]");
      expect(result).toContain("TypeScript is preferred");
    });

    it("no query returns usage error", async () => {
      const result = await registry.dispatch("/recall", setup.ctx);
      expect(result).toContain("Usage: /recall");
    });

    it("no matches returns 'No memories found.'", async () => {
      const result = await registry.dispatch(
        "/recall nonexistent-query-xyz",
        setup.ctx,
      );
      expect(result).toBe("No memories found.");
    });
  });

  // ── /forget ─────────────────────────────────────────────────────

  describe("/forget", () => {
    it("existing memory is removed and returns 'Forgot: name'", async () => {
      // First remember
      await setup.memoryManager.remember(
        "temp-note",
        "knowledge",
        "temp-note",
        "temporary data",
      );

      const result = await registry.dispatch("/forget temp-note", setup.ctx);
      expect(result).toContain("Forgot:");

      // Verify actually gone via recall
      const recallResult = await setup.memoryManager.recall("temp-note");
      expect(recallResult.isOk()).toBe(true);
      expect(recallResult.value).toHaveLength(0);
    });

    it("nonexistent memory returns error", async () => {
      const result = await registry.dispatch("/forget does-not-exist", setup.ctx);
      expect(result).toContain("Failed:");
    });

    it("no args returns usage error", async () => {
      const result = await registry.dispatch("/forget", setup.ctx);
      expect(result).toContain("Usage: /forget");
    });
  });

  // ── /model ──────────────────────────────────────────────────────

  describe("/model", () => {
    it("valid model sets and returns 'Model set to: X'", async () => {
      // The mock adapter is registered with id "mock-model"
      const result = await registry.dispatch("/model mock-model", setup.ctx);
      expect(result).toBe("Model set to: mock-model");
    });

    it("unknown model returns error with suggestion", async () => {
      const result = await registry.dispatch("/model unknown-xyz", setup.ctx);
      expect(result).toContain("Unknown model");
    });

    it("with requestModeSwitch triggers model-picker", async () => {
      const modeSwitch = vi.fn();
      const result = await registry.dispatch(
        "/model",
        { ...setup.ctx, requestModeSwitch: modeSwitch },
      );
      expect(modeSwitch).toHaveBeenCalledWith("model-picker");
      expect(result).toBe("");
    });

    it("without requestModeSwitch lists available models", async () => {
      const result = await registry.dispatch("/model", setup.ctx);
      // listModels includes our registered mock adapter
      expect(result).toContain("mock-model");
    });
  });

  // ── /provider ───────────────────────────────────────────────────

  describe("/provider", () => {
    it("valid provider sets and returns 'Provider set to: X'", async () => {
      const result = await registry.dispatch("/provider mock", setup.ctx);
      expect(result).toBe("Provider set to: mock");
    });

    it("unknown provider returns error", async () => {
      const result = await registry.dispatch("/provider nonexistent", setup.ctx);
      // ensureAdapter returns null, no promptInput → error message
      expect(result).toContain('No adapter for "nonexistent"');
    });
  });

  // ── /yolo ───────────────────────────────────────────────────────

  describe("/yolo", () => {
    it("normal→yolo with confirm=true sets yolo mode", async () => {
      const confirm = vi.fn(async () => true);
      const result = await registry.dispatch(
        "/yolo",
        { ...setup.ctx, confirm },
      );
      expect(setup.setPermissionMode).toHaveBeenCalledWith("yolo");
      expect(result).toBe("YOLO mode enabled!");
    });

    it("confirm=false stays normal", async () => {
      const confirm = vi.fn(async () => false);
      const result = await registry.dispatch(
        "/yolo",
        { ...setup.ctx, confirm },
      );
      expect(result).toBe("YOLO mode not enabled.");
    });

    it("already yolo→normal", async () => {
      setup.permissionMode.value = "yolo";
      const result = await registry.dispatch("/yolo", setup.ctx);
      expect(result).toBe("YOLO mode disabled. Back to normal.");
    });

    it("no confirm callback defaults to true", async () => {
      // No confirm function on ctx
      const result = await registry.dispatch("/yolo", setup.ctx);
      expect(result).toBe("YOLO mode enabled!");
    });
  });

  // ── /sessions ───────────────────────────────────────────────────

  describe("/sessions", () => {
    it("no sessions returns 'No sessions.'", async () => {
      const result = await registry.dispatch("/sessions", setup.ctx);
      expect(result).toContain("No sessions");
    });

    it("with sessions returns numbered list", async () => {
      setup.sessionStore.createSession("/tmp/project-a");
      setup.sessionStore.createSession("/tmp/project-b");

      const result = await registry.dispatch("/sessions", setup.ctx);
      expect(result).toContain("1.");
      expect(result).toContain("2.");
      expect(result).toContain("project-a");
      expect(result).toContain("project-b");
    });

    it("delete valid session returns success", async () => {
      const session = setup.sessionStore.createSession("/tmp/project-x");
      const result = await registry.dispatch(
        `/sessions delete ${session.id}`,
        setup.ctx,
      );
      expect(result).toContain("deleted");
    });

    it("delete invalid session returns not found", async () => {
      const result = await registry.dispatch(
        "/sessions delete 00000000-0000-0000-0000-000000000000",
        setup.ctx,
      );
      expect(result).toContain("Session not found");
    });
  });

  // ── /effort ─────────────────────────────────────────────────────

  describe("/effort", () => {
    it("valid level sets and returns confirmation", async () => {
      const result = await registry.dispatch("/effort low", setup.ctx);
      expect(result).toBe("Thinking effort set to: low");
    });

    it("invalid level returns usage message", async () => {
      const result = await registry.dispatch("/effort invalid", setup.ctx);
      expect(result).toContain("Usage:");
    });
  });

  // ── /unknown ────────────────────────────────────────────────────

  describe("/unknown", () => {
    it("unknown command returns 'Unknown command'", async () => {
      const result = await registry.dispatch("/nonexistent", setup.ctx);
      expect(result).toContain("Unknown command");
    });
  });

  // ── /exit and /quit ─────────────────────────────────────────────

  describe("/exit and /quit", () => {
    it("/exit returns 'exit'", async () => {
      const result = await registry.dispatch("/exit", setup.ctx);
      expect(result).toBe("exit");
    });

    it("/quit returns 'exit'", async () => {
      const result = await registry.dispatch("/quit", setup.ctx);
      expect(result).toBe("exit");
    });
  });
});
