import type { MemoryManager } from "../memory/manager.js";
import type { Tool, ToolContext, ToolResult } from "../types.js";

export function createMemorySearchTool(memoryManager: MemoryManager): Tool {
  return {
    name: "memory_search",
    description:
      "Search memories by query. Returns matching memories from both local file store and Mem0 semantic search.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        type: {
          type: "string",
          description: "Filter by memory type (user, project, knowledge, feedback)",
        },
        limit: { type: "number", description: "Maximum results (default 10)" },
      },
      required: ["query"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const { query, type, limit } = input as {
        query: string;
        type?: string;
        limit?: number;
      };

      try {
        const result = await memoryManager.recall(query, { type, limit });
        if (result.isErr()) {
          return {
            toolCallId: "",
            content: `Memory search failed: ${result.error.message}`,
            isError: true,
          };
        }

        if (result.value.length === 0) {
          return { toolCallId: "", content: "No memories found.", isError: false };
        }

        const formatted = result.value
          .map((m) => `[${m.name}] (${m.type}, score: ${m.score.toFixed(2)})\n${m.content}`)
          .join("\n\n");

        return { toolCallId: "", content: formatted, isError: false };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Memory search error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}

export function createMemoryAddTool(memoryManager: MemoryManager): Tool {
  return {
    name: "memory_add",
    description:
      "Add a new memory to persistent storage. The memory will be indexed for future recall.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Memory name (unique identifier)" },
        content: { type: "string", description: "Memory content to store" },
        type: {
          type: "string",
          description: "Memory type: user, project, knowledge, or feedback",
        },
      },
      required: ["name", "content"],
    },
    capabilities: ["StateUpdate"],

    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const { name, content, type } = input as {
        name: string;
        content: string;
        type?: string;
      };

      try {
        const result = await memoryManager.remember(name, type ?? "knowledge", name, content);
        if (result.isErr()) {
          return {
            toolCallId: "",
            content: `Failed to save memory: ${result.error.message}`,
            isError: true,
          };
        }

        return { toolCallId: "", content: `Saved memory: ${name}`, isError: false };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Memory add error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}

export function createMemoryGetContextTool(memoryManager: MemoryManager): Tool {
  return {
    name: "memory_get_context",
    description: "Get the full memory context including the MEMORY.md index and all entries.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    capabilities: ["ReadOnly"],

    async execute(_input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      try {
        const context = await memoryManager.getSystemContext();
        return { toolCallId: "", content: context, isError: false };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Failed to get memory context: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}

export function createMemoryForgetTool(memoryManager: MemoryManager): Tool {
  return {
    name: "memory_forget",
    description: "Delete a memory by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the memory to delete" },
      },
      required: ["name"],
    },
    capabilities: ["StateUpdate"],

    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const { name } = input as { name: string };

      try {
        const result = await memoryManager.forget(name);
        if (result.isErr()) {
          return {
            toolCallId: "",
            content: `Failed to forget memory: ${result.error.message}`,
            isError: true,
          };
        }

        return { toolCallId: "", content: `Forgot memory: ${name}`, isError: false };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Memory forget error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
