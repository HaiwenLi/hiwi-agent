import { testConnection } from "../adapters/connection-test.js";
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
  thinkingEffort?: string;
  setThinkingEffort?: (effort: string) => void;
  requestModeSwitch?: (mode: string) => void;
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
      return "";
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
      description: "Set active model (usage: /model <id>)",
      handler: async (args, ctx) => {
        if (!args) {
          if (ctx.requestModeSwitch) {
            await Promise.resolve(ctx.requestModeSwitch("model-picker"));
            return "";
          }
          const models = ctx.providerRegistry.listModels();
          if (models.length === 0) return "No models registered. Use: /model <id>";
          return models.map((m) => `  ${m.id} (${m.provider})`).join("\n");
        }
        ctx.providerRegistry.setModel(args);
        return `Model set to: ${args}`;
      },
    });

    this.register({
      name: "provider",
      description: "Set active provider (usage: /provider <name>)",
      handler: async (args, ctx) => {
        if (!args) {
          if (ctx.requestModeSwitch) {
            await Promise.resolve(ctx.requestModeSwitch("provider-picker"));
            return "";
          }
          return "Usage: /provider <name>";
        }
        ctx.providerRegistry.setProvider(args);
        return `Provider set to: ${args}`;
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
      description: "List/delete sessions: /sessions [delete <id>]",
      handler: async (args, ctx) => {
        if (args.startsWith("delete")) {
          const id = args.slice("delete".length).trim();
          if (!id) return "Usage: /sessions delete <session-id>";
          const deleted = ctx.sessionStore.deleteSession(id);
          return deleted
            ? `Session ${id.slice(0, 8)}... deleted.`
            : `Session not found: ${id}`;
        }
        const sessions = ctx.sessionStore.listSessions();
        if (sessions.length === 0) return "No sessions.";
        return sessions
          .map((s, i) => `  ${i + 1}. ${s.id.slice(0, 8)}  ${s.status.padEnd(10)} ${s.workingDir}`)
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
        const confirmed = ctx.confirm
          ? await ctx.confirm("Enable YOLO mode? All actions will be auto-approved.")
          : true;
        if (confirmed) {
          ctx.setPermissionMode("yolo");
          return "YOLO mode enabled!";
        }
        return "YOLO mode not enabled.";
      },
    });

    this.register({
      name: "test",
      description: "Test connection to current or specified provider",
      handler: async (args, ctx) => {
        const result = await testConnection(ctx.providerRegistry, args || undefined);
        if (result.connected) {
          return `Connected to ${result.provider}/${result.model} (${result.latencyMs}ms)`;
        }
        return `Connection failed: ${result.error}`;
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

    this.register({
      name: "effort",
      description: "Set thinking effort (low/medium/high/max)",
      handler: async (args, ctx) => {
        const validEfforts = ["low", "medium", "high", "max"];
        if (!args || !validEfforts.includes(args)) {
          return `Thinking effort: ${ctx.thinkingEffort ?? "high"}. Usage: /effort <low|medium|high|max>`;
        }
        ctx.setThinkingEffort?.(args);
        return `Thinking effort set to: ${args}`;
      },
    });

    this.register({
      name: "exit",
      description: "Exit the REPL",
      handler: async () => "exit",
    });

    this.register({
      name: "quit",
      description: "Exit the REPL",
      handler: async () => "exit",
    });
  }
}
