import type { AgentFS } from "../agentfs/index.js";
import { AutoExtractor } from "../memory/auto-extract.js";
import type { MemoryFileStore } from "../memory/file-store.js";
import type {
  AgentLoopConfig,
  AgentLoopEvent,
  ChatOptions,
  Message,
  ModelAdapter,
  PermissionMode,
  TokenUsage,
  ToolCall,
  ToolContext,
  ToolResult,
} from "../types.js";
import { assembleSystemPrompt } from "./prompt/assembler.js";
import type { ToolRegistry } from "./tools.js";

// ─── IterationBudget ──────────────────────────────────────────

export class IterationBudget {
  private _remaining: number;
  private refundable: Set<string>;

  constructor(total: number, refundableTools: Iterable<string>) {
    this._remaining = total;
    this.refundable = new Set(refundableTools);
  }

  consume(toolName: string): void {
    this._remaining -= 1;
  }

  refund(toolName: string): void {
    if (this.refundable.has(toolName)) {
      this._remaining += 1;
    }
  }

  get remaining(): number {
    return this._remaining;
  }

  get exhausted(): boolean {
    return this._remaining <= 0;
  }
}

// ─── Tool Execution Strategy ──────────────────────────────────

type ExecutionMode = "serial" | "parallel" | "mixed";

interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function extractFilePaths(input: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (typeof input.path === "string") paths.push(input.path);
  if (typeof input.file === "string") paths.push(input.file);
  if (typeof input.directory === "string") paths.push(input.directory);
  if (Array.isArray(input.paths))
    paths.push(...input.paths.filter((p): p is string => typeof p === "string"));
  return paths;
}

function shouldParallelize(calls: ToolCallInfo[], registry: ToolRegistry): ExecutionMode {
  if (calls.length <= 1) return "serial";

  const tools = calls.map((c) => registry.get(c.name));
  const anyInteractive = tools.some((t) => t?.capabilities.includes("ExecCode"));
  if (anyInteractive) return "serial";

  const allReadOnly = tools.every(
    (t) => t?.capabilities.includes("ReadOnly") && !t?.capabilities.includes("WriteFiles"),
  );
  if (allReadOnly) return "parallel";

  const writeCalls = calls.filter((c) => {
    const t = registry.get(c.name);
    return t?.capabilities.includes("WriteFiles");
  });
  const writePaths = writeCalls.flatMap((c) => extractFilePaths(c.input));
  if (new Set(writePaths).size < writePaths.length) {
    return "serial";
  }

  return "mixed";
}

// ─── AgentLoop ────────────────────────────────────────────────

export class AgentLoop {
  private interrupted = false;
  private _paused = false;
  private abortController = new AbortController();
  private autoExtractor?: AutoExtractor;

  constructor(
    private adapter: ModelAdapter,
    private toolRegistry: ToolRegistry,
    private permissionMode: PermissionMode,
    private config: AgentLoopConfig,
    private context?: ToolContext,
    private memoryStore?: MemoryFileStore,
    private agentfs?: AgentFS,
  ) {
    if (memoryStore) {
      this.autoExtractor = new AutoExtractor(adapter, memoryStore);
    }
  }

  get paused(): boolean {
    return this._paused;
  }

  interrupt(): void {
    this.interrupted = true;
  }

  pause(): void {
    this._paused = true;
    this.interrupted = true;
    this.abortController.abort();
  }

  async *run(messages: Message[]): AsyncGenerator<AgentLoopEvent> {
    // Reset abort/interrupt state so this instance can be reused after pause()
    this.abortController = new AbortController();
    this.interrupted = false;
    this._paused = false;

    const budget = new IterationBudget(this.config.budgetTotal, this.config.refundableTools);
    const ctx: ToolContext = this.context ?? {
      workingDirectory: process.cwd(),
      sessionId: `session-${Date.now()}`,
    };

    const currentMessages = [...messages];

    const systemPrompt = await assembleSystemPrompt({
      modelId: this.adapter.id,
      workingDirectory: ctx.workingDirectory,
    });
    // Replace existing system prompt if present, otherwise prepend
    if (currentMessages[0]?.role === "system") {
      currentMessages[0] = { role: "system", content: systemPrompt };
    } else {
      currentMessages.unshift({ role: "system", content: systemPrompt });
    }

    let iteration = 0;
    let emptyResponseCount = 0;

    while (iteration < this.config.maxLoops && !budget.exhausted && !this.interrupted) {
      if (this._paused) break;

      yield { type: "step-start", iteration };

      let content = "";
      const toolCalls: ToolCall[] = [];
      let finishReason = "stop";
      let usage: TokenUsage | undefined;
      let reasoningContent = "";

      const chatOptions: ChatOptions = {
        tools: this.toolRegistry.toToolDefinitions(),
      };

      if (this.config.thinkingEffort) {
        chatOptions.thinking = { type: "enabled" };
        chatOptions.reasoningEffort = this.config.thinkingEffort;
      }

      const forceStreaming = ["deepseek", "kimi", "minimax", "zhipu"].includes(this.adapter.provider);
      if (this.config.streaming || forceStreaming) {
        try {
          for await (const chunk of this.adapter.stream(currentMessages, chatOptions, this.abortController.signal)) {
            if (chunk.type === "text-delta") {
              content += chunk.text;
              yield { type: "text-delta", text: chunk.text, iteration };
            } else if (chunk.type === "reasoning-delta") {
              reasoningContent += chunk.text;
              yield { type: "reasoning-delta", text: chunk.text, iteration };
            } else if (chunk.type === "tool-call") {
              toolCalls.push(chunk.toolCall);
              yield {
                type: "tool-call",
                toolName: chunk.toolCall.name,
                toolCallId: chunk.toolCall.id,
                toolInput: chunk.toolCall.input,
                iteration,
              };
            } else if (chunk.type === "finish") {
              finishReason = chunk.finishReason;
              usage = chunk.usage;
            }

            if (this._paused) break;
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            this._paused = true;
          } else {
            throw err;
          }
        }
      } else {
        const response = await this.adapter.chat(currentMessages, chatOptions, this.abortController.signal);
        content = response.content;
        reasoningContent = response.reasoningContent ?? "";
        toolCalls.push(...response.toolCalls);
        finishReason = response.finishReason;
        usage = response.usage;
        if (reasoningContent) {
          yield { type: "reasoning-delta", text: reasoningContent, iteration };
        }
        if (content) {
          yield { type: "text-delta", text: content, iteration };
        }
        for (const tc of response.toolCalls) {
          yield {
            type: "tool-call",
            toolName: tc.name,
            toolCallId: tc.id,
            toolInput: tc.input,
            iteration,
          };
        }
      }

      // If paused mid-stream, save partial state and exit
      if (this._paused) {
        if (content) {
          currentMessages.push({ role: "assistant", content, reasoningContent });
        }
        yield { type: "step-finish", iteration };
        yield { type: "finish", finishReason: "paused", usage };
        yield { type: "messages", messages: currentMessages };
        return;
      }

      // Check if we should stop or continue with tool execution
      // Only stop early if there's no content AND no tool calls
      if (finishReason !== "tool-calls" && toolCalls.length === 0) {
        if (!content && !reasoningContent && toolCalls.length === 0) {
          emptyResponseCount++;
          if (emptyResponseCount <= 1) {
            currentMessages.push(
              { role: "assistant", content: "" },
              {
                role: "user",
                content: "You gave an empty response. Please provide a helpful answer.",
              },
            );
            yield { type: "step-finish", iteration };
            iteration++;
            continue;
          }
        }

        currentMessages.push({
          role: "assistant",
          content,
          reasoningContent,
        });

        if (this.autoExtractor && content) {
          this.autoExtractor
            .extract(currentMessages)
            .then((facts) => {
              if (facts.length > 0) this.autoExtractor?.storeFacts(facts);
            })
            .catch(() => {});
        }

        yield {
          type: "finish",
          finishReason: "completed",
          usage,
        };
        yield { type: "step-finish", iteration };
        yield { type: "messages", messages: currentMessages };
        return;
      }

      // We have tool calls to execute - push assistant message with tool calls
      currentMessages.push({
        role: "assistant",
        content,
        toolCalls,
        reasoningContent,
      });

      const execMode = shouldParallelize(toolCalls, this.toolRegistry);

      let results: ToolResult[];
      if (execMode === "parallel") {
        results = await Promise.all(
          toolCalls.map((tc) => this.executeTool(tc.id, tc.name, tc.input, ctx)),
        );
      } else {
        results = [];
        for (const tc of toolCalls) {
          const result = await this.executeTool(tc.id, tc.name, tc.input, ctx);
          results.push(result);
        }
      }

      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const result = results[i];

        yield { type: "tool-result", toolResult: result, toolCallId: tc.id, iteration };

        currentMessages.push({
          role: "tool",
          content: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
          toolCallId: tc.id,
        });

        if (result.contentParts?.length) {
          currentMessages.push({
            role: "user",
            content: result.contentParts,
          });
        }

        budget.consume(tc.name);
      }

      yield { type: "step-finish", iteration };
      iteration++;
    }

    if (this._paused) {
      yield { type: "finish", finishReason: "paused" };
    } else if (this.interrupted) {
      yield { type: "finish", finishReason: "interrupted" };
    } else {
      yield { type: "finish", finishReason: "max-loops" };
    }

    // Yield final messages state so caller can update their message history
    yield { type: "messages", messages: currentMessages };
  }

  private async executeTool(
    id: string,
    name: string,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    let auditId: number | undefined;
    if (this.agentfs) {
      auditId = this.agentfs.trail.start(name, input);
    }
    try {
      const result = await this.toolRegistry.execute(name, input, ctx, this.permissionMode);
      if (this.agentfs && auditId !== undefined) {
        if (result.isError) {
          this.agentfs.trail.error(auditId, result.content);
        } else {
          this.agentfs.trail.success(auditId, result.content);
        }
      }
      return { ...result, toolCallId: id };
    } catch (err) {
      if (this.agentfs && auditId !== undefined) {
        this.agentfs.trail.error(auditId, String(err));
      }
      throw err;
    }
  }
}
