import type { CommandRegistry, CommandContext } from "./commands.js";
import type { SkillRegistry } from "../skills/registry.js";
import { SkillExecutor } from "../skills/executor.js";
import type { ToolRegistry } from "../core/tools.js";
import type { AgentLoopConfig, Message, PermissionMode } from "../types.js";
import type { ProviderRegistry } from "../adapters/registry.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SessionStore } from "../memory/session.js";
import { AgentLoop } from "../core/agent.js";
import type { Skill } from "../skills/loader.js";

export interface REPLDependencies {
  commandRegistry: CommandRegistry;
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  adapter: import("../types.js").ModelAdapter;
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

    if (trimmed === "/exit" || trimmed === "/quit") return "exit";

    if (trimmed.startsWith("/")) {
      const skillTrigger = this.parseSkillTrigger(trimmed);
      if (skillTrigger) {
        return await this.executeSkill(skillTrigger.skill, skillTrigger.args);
      }

      const ctx = this.buildCommandContext();
      const result = await this.deps.commandRegistry.dispatch(trimmed, ctx);
      this.deps.onOutput(result);
      return result;
    }

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
    if (!this.sessionId) {
      const session = this.deps.sessionStore.createSession(process.cwd());
      this.sessionId = session.id;
    }

    this.messages.push({ role: "user", content: message });
    this.deps.sessionStore.appendMessage(this.sessionId, "user", message, 0);

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
