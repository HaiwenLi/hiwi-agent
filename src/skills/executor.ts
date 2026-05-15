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
import { SkillComposer } from "./composer.js";
import type { Skill } from "./loader.js";
import { MetaExecutor } from "./meta-executor.js";
import type { SkillRegistry } from "./registry.js";

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
  private skillRegistry?: SkillRegistry;
  private skillLoader?: import("./loader.js").SkillLoader;

  constructor(
    toolRegistry: ToolRegistry,
    registryOptions?: ToolRegistryOptions,
    skillRegistry?: SkillRegistry,
    skillLoader?: import("./loader.js").SkillLoader,
  ) {
    this.toolRegistry = toolRegistry;
    this.registryOptions = registryOptions ?? {};
    this.skillRegistry = skillRegistry;
    this.skillLoader = skillLoader;
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
      if (skill.type === "workflow") {
        return this.executeWorkflow(skill, userMessage, options);
      }
      if (skill.type === "meta") {
        return this.executeMeta(skill, userMessage);
      }
      // domain skill — existing path
      return await this.executeDomain(skill, userMessage, options);
    } catch (error) {
      return err(
        new Error(
          `Skill execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  private async executeWorkflow(
    _skill: Skill,
    userMessage: string,
    options: SkillExecuteOptions,
  ): Promise<Result<SkillExecuteResult, Error>> {
    if (!this.skillRegistry) {
      return err(new Error("SkillRegistry not available for workflow execution"));
    }

    const workflows = this.skillRegistry.list({ type: "workflow" });
    const workflowDef: import("./composer.js").WorkflowDefinition = {
      steps: workflows.map((s) => ({ skill: s.trigger, input: userMessage })),
    };

    const composer = new SkillComposer(this);
    return composer.execute(workflowDef, userMessage, options);
  }

  private async executeMeta(
    skill: Skill,
    userMessage: string,
  ): Promise<Result<SkillExecuteResult, Error>> {
    if (!this.skillRegistry) {
      return err(new Error("SkillRegistry not available for meta execution"));
    }

    const meta = new MetaExecutor(this.skillRegistry);
    let action: import("./meta-executor.js").MetaAction;

    if (userMessage.includes("list")) {
      action = { type: "list-skills" };
    } else if (userMessage.includes("remove") || userMessage.includes("delete")) {
      const name = userMessage.replace(/.*?(remove|delete)\s+/i, "").trim();
      action = { type: "remove-skill", name };
    } else if (userMessage.includes("install")) {
      action = { type: "install-skill", url: userMessage };
    } else if (userMessage.includes("config") || userMessage.includes("set")) {
      const parts = userMessage.split(/\s+/);
      action = { type: "configure", key: parts[1] ?? "", value: parts.slice(2).join(" ") };
    } else {
      action = { type: "self-improve", feedback: userMessage };
    }

    const result = await meta.execute(action);
    return ok({ events: [{ type: "text-delta", text: result }] });
  }

  private async executeDomain(
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
