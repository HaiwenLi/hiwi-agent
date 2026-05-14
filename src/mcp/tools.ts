import type { ProviderRegistry } from "../adapters/registry.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SkillExecutor } from "../skills/executor.js";
import type { SkillRegistry } from "../skills/registry.js";

export interface MCPToolContext {
  memoryManager: MemoryManager;
  skillRegistry: SkillRegistry;
  providerRegistry: ProviderRegistry;
  skillExecutor: SkillExecutor;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{ content: string }>;
}

export function createMCPTools(ctx: MCPToolContext): MCPTool[] {
  return [
    {
      name: "memory_search",
      description: "Search memories by query",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
      handler: async ({ query }) => {
        const result = await ctx.memoryManager.recall(query as string);
        if (result.isOk()) {
          if (result.value.length === 0) return { content: "No memories found." };
          return {
            content: result.value.map((m) => `[${m.name}] ${m.content}`).join("\n"),
          };
        }
        return { content: `Search failed: ${result.error.message}` };
      },
    },
    {
      name: "memory_add",
      description: "Add a new memory",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Memory name" },
          content: { type: "string", description: "Memory content" },
          type: { type: "string", description: "Memory type (user/project/knowledge/feedback)" },
        },
        required: ["name", "content"],
      },
      handler: async ({ name, content, type }) => {
        const result = await ctx.memoryManager.remember(
          name as string,
          (type as string) ?? "knowledge",
          name as string,
          content as string,
        );
        if (result.isOk()) return { content: `Saved memory: ${name}` };
        return { content: `Failed: ${result.error.message}` };
      },
    },
    {
      name: "memory_get_context",
      description: "Get the full memory context (MEMORY.md index)",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const context = await ctx.memoryManager.getSystemContext();
        return { content: context };
      },
    },
    {
      name: "skill_list",
      description: "List available skills",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const skills = ctx.skillRegistry.list();
        if (skills.length === 0) return { content: "No skills loaded." };
        return {
          content: skills.map((s) => `${s.trigger} — ${s.description}`).join("\n"),
        };
      },
    },
    {
      name: "skill_execute",
      description: "Execute a named skill",
      inputSchema: {
        type: "object",
        properties: {
          skill: { type: "string", description: "Skill trigger (e.g. /paper-search)" },
          input: { type: "string", description: "Input for the skill" },
        },
        required: ["skill"],
      },
      handler: async ({ skill, input }) => {
        const skillObj = ctx.skillRegistry.getByTrigger(skill as string);
        if (!skillObj) return { content: `Skill not found: ${skill}` };

        const result = await ctx.skillExecutor.execute(skillObj, (input as string) || "", {
          adapter: null as any,
          permissionMode: "auto",
          loopConfig: {
            maxLoops: 50,
            maxOutputTokensPerTurn: 4096,
            budgetTotal: 50,
            refundableTools: [],
            streaming: false,
            interruptible: false,
          },
        });

        if (result.isOk()) {
          const texts = result.value.events
            .filter((e) => e.type === "text-delta" && e.text)
            .map((e) => e.text);
          return { content: texts.join("") || "Skill completed." };
        }
        return { content: `Skill failed: ${result.error.message}` };
      },
    },
    {
      name: "model_list",
      description: "List available models",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const models = ctx.providerRegistry.listModels();
        const provider = ctx.providerRegistry.getActiveProvider();
        const model = ctx.providerRegistry.getActiveModel();
        const lines = models.map((m) => `${m.id} (${m.provider})`);
        lines.push(`\nActive: ${model} @ ${provider}`);
        return { content: lines.join("\n") };
      },
    },
  ];
}
