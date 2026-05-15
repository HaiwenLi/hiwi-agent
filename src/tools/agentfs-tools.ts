import type { AgentFS } from "@/agentfs/index.js";
import type { Tool, ToolContext, ToolResult } from "@/types.js";

export function createAgentFSTools(agentfs: AgentFS): Tool[] {
  return [
    {
      name: "agentfs_read",
      description: "Read a file from the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
        },
        required: ["path"],
      },
      capabilities: ["ReadOnly"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { path } = input as { path: string };
        try {
          const content = agentfs.fs.readFile(path, "utf-8") as string;
          return { toolCallId: "", content, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },

    {
      name: "agentfs_write",
      description: "Write content to a file in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
      capabilities: ["WriteFiles"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { path, content } = input as { path: string; content: string };
        try {
          agentfs.fs.writeFile(path, content);
          return { toolCallId: "", content: `Wrote ${content.length} bytes to ${path}`, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },

    {
      name: "agentfs_ls",
      description: "List directory contents in the virtual filesystem",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the directory" },
        },
        required: ["path"],
      },
      capabilities: ["ReadOnly"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { path } = input as { path: string };
        try {
          const entries = agentfs.fs.readdir(path);
          const lines = entries.map((entry) => {
            const inode = agentfs.fs.stat(`${path === "/" ? "" : path}/${entry.name}`);
            const suffix = inode.type === "directory" ? "/" : "";
            return `  ${entry.name}${suffix}`;
          });
          const content = `Directory: ${path} (${entries.length} entries)\n${lines.join("\n")}`;
          return { toolCallId: "", content, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },

    {
      name: "agentfs_stat",
      description: "Get metadata for a virtual filesystem path",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path to the file or directory" },
        },
        required: ["path"],
      },
      capabilities: ["ReadOnly"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { path } = input as { path: string };
        try {
          const stat = agentfs.fs.stat(path);
          const typeStr = stat.type === "directory" ? "directory" : stat.type === "symlink" ? "symlink" : "file";
          const lines = [
            `  Type: ${typeStr}`,
            `  Mode: ${stat.mode.toString(8)}`,
            `  Size: ${stat.size} bytes`,
            `  Modified: ${new Date(stat.mtime).toISOString()}`,
            `  Created: ${new Date(stat.ctime).toISOString()}`,
            `  Accessed: ${new Date(stat.atime).toISOString()}`,
          ];
          const content = `Stat: ${path}\n${lines.join("\n")}`;
          return { toolCallId: "", content, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },

    {
      name: "agentfs_kv_get",
      description: "Get a value from the KV store by key",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key to look up" },
        },
        required: ["key"],
      },
      capabilities: ["ReadOnly"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { key } = input as { key: string };
        try {
          const value = agentfs.kv.get(key);
          if (value === undefined) {
            return { toolCallId: "", content: `Key not found: ${key}`, isError: true };
          }
          const content = JSON.stringify(value, null, 2);
          return { toolCallId: "", content, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },

    {
      name: "agentfs_kv_set",
      description: "Set a value in the KV store",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Key for the value" },
          value: { type: "string", description: "Value to store" },
        },
        required: ["key", "value"],
      },
      capabilities: ["WriteFiles"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { key, value } = input as { key: string; value: string };
        try {
          agentfs.kv.set(key, value);
          return { toolCallId: "", content: `Set ${key} = ${value}`, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },

    {
      name: "agentfs_kv_list",
      description: "List keys in the KV store, optionally filtered by prefix",
      inputSchema: {
        type: "object",
        properties: {
          prefix: { type: "string", description: "Optional prefix to filter keys" },
        },
        required: [],
      },
      capabilities: ["ReadOnly"],

      async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
        const { prefix } = input as { prefix?: string };
        try {
          const keys = agentfs.kv.list(prefix);
          const content = keys.length > 0
            ? keys.join("\n")
            : "No keys found";
          return { toolCallId: "", content, isError: false };
        } catch (err) {
          return { toolCallId: "", content: String(err), isError: true };
        }
      },
    },
  ];
}
