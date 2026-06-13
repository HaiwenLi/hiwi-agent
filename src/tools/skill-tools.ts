import type { ProviderRegistry } from "../adapters/registry.js";
import type { ToolRegistry } from "../core/tools.js";
import { SkillExecutor } from "../skills/executor.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { Tool, ToolContext, ToolResult } from "../types.js";

export function createSkillExecuteTool(
  skillRegistry: SkillRegistry,
  toolRegistry: ToolRegistry,
  providerRegistry: ProviderRegistry,
): Tool {
  return {
    name: "skill_execute",
    description:
      "Execute a named skill by its trigger (e.g. /paper-search). Skills provide specialized capabilities and domain knowledge.",
    inputSchema: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "Skill trigger to execute (e.g. /paper-search, /code-review)",
        },
        input: { type: "string", description: "Input or instructions for the skill" },
      },
      required: ["skill"],
    },
    capabilities: ["StateUpdate"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { skill: skillTrigger, input: skillInput } = input as {
        skill: string;
        input?: string;
      };

      try {
        const skillObj = skillRegistry.getByTrigger(skillTrigger);
        if (!skillObj) {
          return {
            
            content: `Skill not found: ${skillTrigger}. Available: ${skillRegistry.getTriggers().join(", ")}`,
            isError: true,
          };
        }

        const executor = new SkillExecutor(toolRegistry, {}, skillRegistry);
        const adapter = providerRegistry.getActiveAdapter();

        const result = await executor.execute(skillObj, skillInput || "", {
          adapter,
          permissionMode: "auto",
          loopConfig: {
            maxLoops: 50,
            maxOutputTokensPerTurn: 4096,
            budgetTotal: 50,
            refundableTools: [],
            streaming: false,
            interruptible: false,
          },
          context: ctx,
        });

        if (result.isErr()) {
          return {
            
            content: `Skill execution failed: ${result.error.message}`,
            isError: true,
          };
        }

        const texts: string[] = [];
        for (const e of result.value.events) {
          if (e.type === "text-delta" && e.text) {
            texts.push(e.text);
          }
        }
        const output = texts.join("") || "Skill completed with no output.";

        return { content: output, isError: false };
      } catch (error) {
        return {
          
          content: `Skill execute error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}

export function createSkillListTool(skillRegistry: SkillRegistry): Tool {
  return {
    name: "skill_list",
    description: "List all available skills with their triggers and descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Filter by skill type: domain, workflow, or meta",
        },
      },
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const { type } = (input as { type?: string }) ?? {};

      try {
        const skills = skillRegistry.list({
          type: type as "domain" | "workflow" | "meta" | undefined,
        });

        if (skills.length === 0) {
          return { content: "No skills loaded.", isError: false };
        }

        const formatted = skills
          .map((s) => `${s.trigger} [${s.type}] — ${s.description}`)
          .join("\n");

        return { content: formatted, isError: false };
      } catch (error) {
        return {
          
          content: `Skill list error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
