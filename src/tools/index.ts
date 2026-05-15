import type { ToolRegistry } from "../core/tools.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit-tool.js";
import { createGlobTool } from "./glob.js";
import { createGrepTool } from "./grep.js";
import { createBashTool } from "./bash.js";

export function registerCoreTools(registry: ToolRegistry): void {
  registry.register(createReadTool());
  registry.register(createWriteTool());
  registry.register(createEditTool());
  registry.register(createGlobTool());
  registry.register(createGrepTool());
  registry.register(createBashTool());
}

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createBashTool,
};
