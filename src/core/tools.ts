import type { Tool, ToolContext, ToolDefinition, PermissionMode, ToolResult, ToolCapability } from "../types.js";

export interface ToolRegistryOptions {
  onPermission?: (toolName: string, capability: ToolCapability) => Promise<boolean>;
}

const DANGEROUS_CAPABILITIES: ToolCapability[] = ["WriteFiles", "ExecCode", "Network"];

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private permissionCache = new Set<string>();
  private options: ToolRegistryOptions;

  constructor(options: ToolRegistryOptions = {}) {
    this.options = options;
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
    permissionMode: PermissionMode,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { toolCallId: "", content: `Tool not found: ${name}`, isError: true };
    }

    const permitted = await this.checkPermission(tool, permissionMode);
    if (!permitted) {
      return { toolCallId: "", content: `Permission denied for tool: ${name}`, isError: true };
    }

    try {
      return await tool.execute(input, context);
    } catch (error) {
      return {
        toolCallId: "",
        content: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  toToolDefinitions(): ToolDefinition[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  private async checkPermission(tool: Tool, mode: PermissionMode): Promise<boolean> {
    if (mode === "yolo") return true;

    if (mode === "auto" && tool.capabilities.includes("ReadOnly")) return true;

    if (this.permissionCache.has(tool.name)) return true;

    const isDangerous = tool.capabilities.some((c) => DANGEROUS_CAPABILITIES.includes(c));
    if (!isDangerous) {
      this.permissionCache.add(tool.name);
      return true;
    }

    if (this.options.onPermission) {
      for (const cap of tool.capabilities) {
        if (DANGEROUS_CAPABILITIES.includes(cap)) {
          const approved = await this.options.onPermission(tool.name, cap);
          if (approved) {
            this.permissionCache.add(tool.name);
            return true;
          }
          return false;
        }
      }
    }

    return false;
  }
}
