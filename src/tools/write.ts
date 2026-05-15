import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

export function createWriteTool(): Tool {
  return {
    name: "write_file",
    description: "Write content to a file on the local filesystem. Creates parent directories if needed. Overwrites existing files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
        content: { type: "string", description: "Content to write to the file" },
      },
      required: ["path", "content"],
    },
    capabilities: ["WriteFiles"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { path: rawPath, content } = input as {
        path: string;
        content?: string;
      };

      if (content === undefined) {
        return {
          toolCallId: "",
          content: "Missing required parameter: content",
          isError: true,
        };
      }

      const filePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workingDirectory, rawPath);

      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");

        return {
          toolCallId: "",
          content: `Wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}`,
          isError: false,
          title: `Write ${path.basename(filePath)}`,
        };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Write error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
