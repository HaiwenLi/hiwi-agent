import type { ToolRegistry } from "../core/tools.js";
import type { AgentFS } from "../agentfs/index.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit-tool.js";
import { createGlobTool } from "./glob.js";
import { createGrepTool } from "./grep.js";
import { createBashTool } from "./bash.js";
import { createApplyPatchTool } from "./apply-patch.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createWebSearchTool } from "./web-search.js";
import { createRepoOverviewTool } from "./repo-overview.js";
import { createQuestionTool } from "./question.js";
import { createTodoTool } from "./todo.js";
import { createLspTool } from "./lsp.js";
import { createAgentFSTools } from "./agentfs-tools.js";

export function registerCoreTools(registry: ToolRegistry): void {
  registry.register(createReadTool());
  registry.register(createWriteTool());
  registry.register(createEditTool());
  registry.register(createGlobTool());
  registry.register(createGrepTool());
  registry.register(createBashTool());
}

export function registerExtraTools(registry: ToolRegistry): void {
  registry.register(createApplyPatchTool());
  registry.register(createWebFetchTool());
  registry.register(createWebSearchTool());
  registry.register(createRepoOverviewTool());
  registry.register(createQuestionTool());
  registry.register(createTodoTool());
  registry.register(createLspTool());
}

export function registerAgentFSTools(registry: ToolRegistry, agentfs: AgentFS): void {
  for (const tool of createAgentFSTools(agentfs)) {
    registry.register(tool);
  }
}

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createBashTool,
};
