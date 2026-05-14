import type {
  AgentLoopConfig,
  AgentLoopEvent,
  Message,
  ModelAdapter,
  PermissionMode,
  ToolContext,
  ToolResult,
} from "../types.js";
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

  constructor(
    private adapter: ModelAdapter,
    private toolRegistry: ToolRegistry,
    private permissionMode: PermissionMode,
    private config: AgentLoopConfig,
    private context?: ToolContext,
  ) {}

  interrupt(): void {
    this.interrupted = true;
  }

  async *run(messages: Message[]): AsyncGenerator<AgentLoopEvent> {
    const budget = new IterationBudget(this.config.budgetTotal, this.config.refundableTools);
    const ctx: ToolContext = this.context ?? {
      workingDirectory: process.cwd(),
      sessionId: `session-${Date.now()}`,
    };

    const currentMessages = [...messages];
    let iteration = 0;
    let emptyResponseCount = 0;

    while (iteration < this.config.maxLoops && !budget.exhausted && !this.interrupted) {
      yield { type: "step-start", iteration };

      const response = await this.adapter.chat(currentMessages);
      emptyResponseCount = 0;

      if (response.content) {
        yield { type: "text-delta", text: response.content, iteration };
      }

      if (response.finishReason !== "tool-calls" || response.toolCalls.length === 0) {
        if (!response.content && response.toolCalls.length === 0) {
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

        yield {
          type: "finish",
          finishReason: "completed",
          usage: response.usage,
        };
        yield { type: "step-finish", iteration };
        return;
      }

      currentMessages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      const execMode = shouldParallelize(response.toolCalls, this.toolRegistry);

      let results: ToolResult[];
      if (execMode === "parallel") {
        results = await Promise.all(
          response.toolCalls.map((tc) => this.executeTool(tc.id, tc.name, tc.input, ctx)),
        );
      } else {
        results = [];
        for (const tc of response.toolCalls) {
          const result = await this.executeTool(tc.id, tc.name, tc.input, ctx);
          results.push(result);
        }
      }

      for (let i = 0; i < response.toolCalls.length; i++) {
        const tc = response.toolCalls[i];
        const result = results[i];

        yield {
          type: "tool-call",
          toolName: tc.name,
          toolCallId: tc.id,
          toolInput: tc.input,
          iteration,
        };
        yield { type: "tool-result", toolResult: result, toolCallId: tc.id, iteration };

        currentMessages.push({
          role: "tool",
          content: result.content,
          toolCallId: tc.id,
        });

        budget.consume(tc.name);
      }

      yield { type: "step-finish", iteration };
      iteration++;
    }

    if (this.interrupted) {
      yield { type: "finish", finishReason: "interrupted" };
    } else {
      yield { type: "finish", finishReason: "max-loops" };
    }
  }

  private async executeTool(
    id: string,
    name: string,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const result = await this.toolRegistry.execute(name, input, ctx, this.permissionMode);
    return { ...result, toolCallId: id };
  }
}
