import { AgentLoop } from "../core/agent.js";
import type { ToolRegistry } from "../core/tools.js";
import type {
  AgentLoopConfig,
  AgentLoopEvent,
  ModelAdapter,
  PermissionMode,
  Tool,
  ToolContext,
  ToolResult,
} from "../types.js";

export interface SubagentDeps {
  adapter: () => ModelAdapter;
  toolRegistry: ToolRegistry;
  permissionMode: () => PermissionMode;
  loopConfig: AgentLoopConfig;
}

const SUBAGENT_SYSTEM_PROMPT = `You are a sub-agent executing a delegated task. Work independently and return a clear, concise result.
Do not ask clarifying questions — make reasonable assumptions and proceed.
When done, provide your final answer directly.`;

export function createSubagentTool(deps: SubagentDeps): Tool {
  return {
    name: "Agent",
    description:
      "Launch a sub-agent to handle a complex, multi-step task autonomously. The sub-agent runs in an isolated loop with its own tool set and returns a single result.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "The task for the sub-agent to perform. Be specific about what you want it to do.",
        },
        description: {
          type: "string",
          description: "Short description of the task (3-5 words).",
        },
        allowedTools: {
          type: "array",
          items: { type: "string" },
          description:
            "Tools the sub-agent is allowed to use. Defaults to all available tools except Agent (sub-agents cannot spawn further sub-agents).",
        },
        maxIterations: {
          type: "number",
          description: "Maximum loop iterations for the sub-agent (default: 15).",
        },
      },
      required: ["prompt", "description"],
    },
    capabilities: ["ReadOnly", "StateUpdate"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { prompt, allowedTools, maxIterations } = input as {
        prompt: string;
        description: string;
        allowedTools?: string[];
        maxIterations?: number;
      };

      const limit = maxIterations ?? 15;

      // Build filtered tool registry — never include Agent tool (no recursion)
      const childRegistry = new (deps.toolRegistry.constructor as new () => ToolRegistry)();
      const allTools = deps.toolRegistry.list();
      const allowed = allowedTools
        ? new Set(allowedTools.filter((t) => t !== "Agent"))
        : new Set(allTools.filter((t) => t.name !== "Agent").map((t) => t.name));

      for (const tool of allTools) {
        if (allowed.has(tool.name)) {
          childRegistry.register(tool);
        }
      }

      const childLoop = new AgentLoop(
        deps.adapter(),
        childRegistry,
        "auto",
        {
          maxLoops: limit,
          maxOutputTokensPerTurn: deps.loopConfig.maxOutputTokensPerTurn,
          budgetTotal: limit,
          refundableTools: deps.loopConfig.refundableTools,
          streaming: false,
          interruptible: true,
        },
        {
          workingDirectory: ctx.workingDirectory,
          sessionId: `${ctx.sessionId}-sub-${Date.now()}`,
          abort: ctx.abort,
        },
      );

      const messages = [
        { role: "system" as const, content: SUBAGENT_SYSTEM_PROMPT },
        { role: "user" as const, content: prompt },
      ];

      try {
        let finalText = "";
        const toolCalls: string[] = [];

        for await (const event of childLoop.run(messages)) {
          if (event.type === "text-delta" && event.text) {
            finalText += event.text;
          }
          if (event.type === "tool-call" && event.toolName) {
            toolCalls.push(event.toolName);
          }
          if (event.type === "error") {
            return {
              
              content: `Sub-agent error: ${event.text ?? "unknown error"}`,
              isError: true,
            };
          }
        }

        return {
          
          content: finalText || "Sub-agent completed with no output.",
          isError: false,
          metadata: {
            toolCalls: toolCalls,
            iterations: limit,
          },
        };
      } catch (error) {
        return {
          
          content: `Sub-agent failed: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
