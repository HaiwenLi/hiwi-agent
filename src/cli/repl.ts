import type { ProviderRegistry } from "../adapters/registry.js";
import { AgentLoop } from "../core/agent.js";
import type { ToolRegistry } from "../core/tools.js";
import type { MemoryManager } from "../memory/manager.js";
import { SessionSummarizer } from "../memory/session-summary.js";
import type { SessionStore } from "../memory/session.js";
import { SkillExecutor } from "../skills/executor.js";
import type { Skill } from "../skills/loader.js";
import type { SkillRegistry } from "../skills/registry.js";
import { registerAgentTools, registerCoreTools, registerExtraTools } from "../tools/index.js";
import type { AgentLoopConfig, Message, PermissionMode } from "../types.js";
import type { CommandContext, CommandRegistry } from "./commands.js";

export interface REPLDependencies {
  commandRegistry: CommandRegistry;
  skillRegistry: SkillRegistry;
  toolRegistry: ToolRegistry;
  adapter?: import("../types.js").ModelAdapter | (() => import("../types.js").ModelAdapter) | null;
  loopConfig: AgentLoopConfig;
  permissionMode: { value: PermissionMode };
  setPermissionMode: (mode: PermissionMode) => void;
  providerRegistry: ProviderRegistry;
  memoryManager: MemoryManager;
  sessionStore: SessionStore;
  onOutput: (text: string) => void;
  onStreamChunk?: (chunk: string) => void;
  onStreamEnd?: () => void;
  onThinkingChunk?: (chunk: string) => void;
  onEndThinking?: () => void;
  confirm?: (message: string) => Promise<boolean>;
  onStatusBarUpdate?: (data: import("../types.js").TokenUsage) => void;
}

export class REPL {
  private deps: REPLDependencies;
  private messages: Message[] = [];
  private sessionId: string | null = null;
  // Permission tracking
  private approvedTools = new Set<string>();
  private deniedTools: string[] = [];
  private pendingPermissionTool: string | null = null;
  // Token usage tracking
  private cumulativeInputTokens = 0;
  private cumulativeOutputTokens = 0;
  private cumulativeCacheRead = 0;
  private cumulativeCacheWrite = 0;
  private thinkingEffort: string = "high";

  constructor(deps: REPLDependencies) {
    this.deps = deps;
    registerCoreTools(deps.toolRegistry);
    registerExtraTools(deps.toolRegistry);
    registerAgentTools(deps.toolRegistry, {
      adapter: () => deps.providerRegistry.getActiveAdapter(),
      memoryManager: deps.memoryManager,
      skillRegistry: deps.skillRegistry,
      providerRegistry: deps.providerRegistry,
      loopConfig: deps.loopConfig,
      permissionMode: () => deps.permissionMode.value,
    });
  }

  async processInput(input: string): Promise<string> {
    const trimmed = input.trim();
    if (!trimmed) return "";

    if (trimmed === "/exit" || trimmed === "/quit") {
      await this.summarizeOnExit();
      return "exit";
    }

    if (trimmed === "/new") {
      this.messages = [];
      this.sessionId = null;
      this.approvedTools.clear();
      this.deniedTools = [];
      this.deps.onOutput("[New Session] Context cleared. Ready for a fresh start.\n");
      return "[New Session]";
    }

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

    let fullOutput = "";
    let isThinking = false;
    let isStreaming = false;

    const endStreams = () => {
      if (isStreaming) {
        this.deps.onStreamEnd?.();
        isStreaming = false;
      }
      if (isThinking) {
        this.deps.onEndThinking?.();
        isThinking = false;
      }
    };

    for await (const event of loop.run(this.messages)) {
      if (event.type === "text-delta" && event.text) {
        if (isThinking) {
          this.deps.onEndThinking?.();
          isThinking = false;
        }
        if (!isStreaming) {
          isStreaming = true;
        }
        fullOutput += event.text;
        this.deps.onStreamChunk?.(event.text);
      } else if (event.type === "reasoning-delta" && event.text) {
        if (!isThinking) {
          isThinking = true;
        }
        this.deps.onThinkingChunk?.(event.text);
      } else if (event.type === "tool-call") {
        endStreams();
        this.deps.onOutput(`[Calling: ${event.toolName}]\n`);
      } else if (event.type === "tool-result" && event.toolResult) {
        this.deps.onOutput(`[Result]\n${event.toolResult.content}\n`);

        // Check for permission denial
        if (event.toolResult.isError && event.toolResult.content.includes("Permission denied")) {
          const toolName = this.extractToolNameFromResult(event.toolResult.content);
          if (
            toolName &&
            !this.deniedTools.includes(toolName) &&
            !this.approvedTools.has(toolName)
          ) {
            this.deps.onOutput(`\n[Permission Request] Agent needs to use "${toolName}"\n`);
            if (this.deps.confirm) {
              const granted = await this.deps.confirm(
                `Grant permission for tool "${toolName}"? (yes/no/skip)`,
              );
              if (granted) {
                this.approvedTools.add(toolName);
                this.deps.onOutput(`[Permission granted for ${toolName}]\n`);
              } else {
                this.deniedTools.push(toolName);
                this.deps.onOutput(
                  `\n[Paused] Waiting for your input. Type "yes" to grant permission, or continue with other tasks.\n`,
                );
                break;
              }
            } else {
              this.deps.onOutput("\n[Paused] Waiting for your input.\n");
              break;
            }
          }
        }
      } else if (event.type === "finish") {
        endStreams();
        if (event.usage) {
          this.cumulativeInputTokens += event.usage.inputTokens ?? 0;
          this.cumulativeOutputTokens += event.usage.outputTokens ?? 0;
        }
        this.deps.onOutput(`\n[Finished: ${event.finishReason}]\n`);
      } else if (event.type === "messages" && event.messages) {
        this.messages = event.messages;
      }
    }

    // Flush any remaining streams
    endStreams();

    // Update status bar with adapter info
    const currentAdapter = this.deps.providerRegistry.getActiveAdapter();
    const statusData = this.getStatusBarData();

    // Fallback: estimate tokens if none were counted (some APIs don't return usage in streaming)
    if (this.cumulativeInputTokens === 0 && this.messages.length > 0) {
      this.cumulativeInputTokens = Math.max(1, Math.ceil(JSON.stringify(this.messages).length / 4));
      statusData.inputTokens = this.cumulativeInputTokens;
    }
    if (this.cumulativeOutputTokens === 0 && fullOutput.length > 0) {
      this.cumulativeOutputTokens = Math.max(1, Math.ceil(fullOutput.length / 4));
      statusData.outputTokens = this.cumulativeOutputTokens;
    }

    statusData.modelName = currentAdapter.id ?? "unknown";
    statusData.provider = currentAdapter.provider ?? "unknown";
    statusData.contextWindow = currentAdapter.capabilities?.contextWindow ?? 200000;
    if (statusData.contextWindow && statusData.contextWindow > 0) {
      const totalTokens = statusData.inputTokens + statusData.outputTokens;
      statusData.contextPercent = (totalTokens / statusData.contextWindow) * 100;
    }
    this.deps.onStatusBarUpdate?.(statusData);

    if (fullOutput) {
      this.deps.sessionStore.appendMessage(this.sessionId, "assistant", fullOutput, 0);
    }

    return fullOutput;
  }

  private extractToolNameFromResult(content: string): string | null {
    const match = content.match(/Permission denied for tool: (\w+)/);
    return match ? match[1] : null;
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
      thinkingEffort: this.thinkingEffort,
      setThinkingEffort: (effort: string) => this.setThinkingEffort(effort),
    };
  }

  getStatusBarData(): import("../types.js").TokenUsage {
    return {
      inputTokens: this.cumulativeInputTokens,
      outputTokens: this.cumulativeOutputTokens,
      cacheReadTokens: this.cumulativeCacheRead,
      cacheWriteTokens: this.cumulativeCacheWrite,
      contextPercent: null,
      contextWindow: 0,
      modelName: "",
      provider: "",
      thinkingEffort: this.thinkingEffort,
    };
  }

  setThinkingEffort(effort: string): void {
    this.thinkingEffort = effort;
    this.deps.onStatusBarUpdate?.(this.getStatusBarData());
  }

  async fetchCommands(): Promise<import("./commands.js").Command[]> {
    return this.deps.commandRegistry.list();
  }

  private async summarizeOnExit(): Promise<void> {
    if (this.messages.length < 4) return;
    try {
      const adapter = this.deps.providerRegistry.getActiveAdapter();
      // biome-ignore lint/complexity/useLiteralKeys: fileStore is private
      const store = this.deps.memoryManager["fileStore"];
      const summarizer = new SessionSummarizer(adapter, store);
      const result = await summarizer.summarize(
        this.messages,
        new Date().toISOString().slice(0, 10),
      );
      if (result.isOk() && result.value) {
        await summarizer.storeSummary(result.value);
      }
    } catch {
      // Silent failure — never break exit
    }
  }
}
