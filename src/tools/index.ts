import type { ProviderRegistry } from "../adapters/registry.js";
import type { ToolRegistry } from "../core/tools.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { AgentLoopConfig, ModelAdapter, PermissionMode } from "../types.js";
import { createAcademicSearchTool } from "./academic-search.js";
import { createApplyPatchTool } from "./apply-patch.js";
import { createBashTool } from "./bash.js";
import { createCodeSearchTool } from "./code-search.js";
import { createEditTool } from "./edit-tool.js";
import { createGitTool } from "./git.js";
import { createGlobTool } from "./glob.js";
import { createGrepTool } from "./grep.js";
import { createLspTool } from "./lsp.js";
import {
  createMemoryAddTool,
  createMemoryForgetTool,
  createMemoryGetContextTool,
  createMemorySearchTool,
} from "./memory-tools.js";
import { createQuestionTool } from "./question.js";
import { createReadTool } from "./read.js";
import { createRepoOverviewTool } from "./repo-overview.js";
import { createSkillExecuteTool, createSkillListTool } from "./skill-tools.js";
import { createSubagentTool } from "./subagent.js";
import { createTaskTool } from "./task.js";
import { createTodoTool } from "./todo.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createWebSearchTool } from "./web-search.js";
import { createWriteTool } from "./write.js";

export function registerCoreTools(registry: ToolRegistry): void {
  registry.register(createReadTool());
  registry.register(createWriteTool());
  registry.register(createEditTool());
  registry.register(createGlobTool());
  registry.register(createGrepTool());
  registry.register(createBashTool());
}

export function registerExtraTools(registry: ToolRegistry): void {
  registry.register(createAcademicSearchTool());
  registry.register(createApplyPatchTool());
  registry.register(createGitTool());
  registry.register(createWebFetchTool());
  registry.register(createWebSearchTool());
  registry.register(createRepoOverviewTool());
  registry.register(createQuestionTool());
  registry.register(createTodoTool());
  registry.register(createLspTool());
}

export function registerAgentTools(
  registry: ToolRegistry,
  deps: {
    adapter: () => ModelAdapter;
    memoryManager: MemoryManager;
    skillRegistry: SkillRegistry;
    providerRegistry: ProviderRegistry;
    loopConfig: AgentLoopConfig;
    permissionMode: () => PermissionMode;
  },
): void {
  registry.register(
    createSubagentTool({
      adapter: deps.adapter,
      toolRegistry: registry,
      permissionMode: deps.permissionMode,
      loopConfig: deps.loopConfig,
    }),
  );
  registry.register(createCodeSearchTool());
  registry.register(createTaskTool());
  registry.register(createMemorySearchTool(deps.memoryManager));
  registry.register(createMemoryAddTool(deps.memoryManager));
  registry.register(createMemoryGetContextTool(deps.memoryManager));
  registry.register(createMemoryForgetTool(deps.memoryManager));
  registry.register(createSkillExecuteTool(deps.skillRegistry, registry, deps.providerRegistry));
  registry.register(createSkillListTool(deps.skillRegistry));
}

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createBashTool,
  createCodeSearchTool,
  createTaskTool,
  createMemorySearchTool,
  createMemoryAddTool,
  createMemoryGetContextTool,
  createMemoryForgetTool,
  createSkillExecuteTool,
  createSkillListTool,
  createSubagentTool,
};
