import { type Result, err, ok } from "neverthrow";
import { AgentLoop } from "../core/agent.js";
import { ToolRegistry, type ToolRegistryOptions } from "../core/tools.js";
import type {
  AgentLoopConfig,
  AgentLoopEvent,
  ModelAdapter,
  PermissionMode,
  Tool,
  ToolContext,
} from "../types.js";
import type { Skill } from "./loader.js";

export interface SkillExecuteOptions {
  adapter: ModelAdapter;
  permissionMode: PermissionMode;
  loopConfig: AgentLoopConfig;
  systemPrompt?: string;
  context?: ToolContext;
}

export interface SkillExecuteResult {
  events: AgentLoopEvent[];
}

export class SkillExecutor {
  private toolRegistry: ToolRegistry;
  private registryOptions: ToolRegistryOptions;

  constructor(toolRegistry: ToolRegistry, registryOptions?: ToolRegistryOptions) {
    this.toolRegistry = toolRegistry;
    this.registryOptions = registryOptions ?? {};
  }

  buildSystemPrompt(skill: Skill, basePrompt = ""): string {
    const header = [
      `## Active Skill: ${skill.name}`,
      `**Type:** ${skill.type}`,
      skill.tools?.length ? `**Available tools:** ${skill.tools.join(", ")}` : null,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const parts = [header, skill.prompt];
    if (basePrompt) {
      parts.unshift(basePrompt);
    }
    return parts.join("\n\n");
  }

  filterTools(skill: Skill): Tool[] {
    const allTools = this.toolRegistry.list();

    if (!skill.tools || skill.tools.length === 0) {
      return allTools;
    }

    const allowedNames = new Set(skill.tools);
    return allTools.filter((t) => allowedNames.has(t.name));
  }

  async execute(
    skill: Skill,
    userMessage: string,
    options: SkillExecuteOptions,
  ): Promise<Result<SkillExecuteResult, Error>> {
    try {
      const filteredTools = this.filterTools(skill);
      const skillToolRegistry = this.createFilteredRegistry(filteredTools);

      const systemPrompt = this.buildSystemPrompt(skill, options.systemPrompt);
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userMessage },
      ];

      const loop = new AgentLoop(
        options.adapter,
        skillToolRegistry,
        options.permissionMode,
        options.loopConfig,
        options.context,
      );

      const events: AgentLoopEvent[] = [];
      for await (const event of loop.run(messages)) {
        events.push(event);
      }

      return ok({ events });
    } catch (error) {
      return err(
        new Error(
          `Skill execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  private createFilteredRegistry(tools: Tool[]): ToolRegistry {
    const registry = new ToolRegistry(this.registryOptions);
    for (const tool of tools) {
      registry.register(tool);
    }
    return registry;
  }
}
