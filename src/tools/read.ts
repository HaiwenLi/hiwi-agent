import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;
const BOM = 0xfeff;

function isBinary(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === BOM) return text.slice(1);
  return text;
}

function formatWithLineNumbers(lines: string[], offset: number): string {
  return lines
    .map((line, i) => {
      const truncated =
        line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}... (truncated)` : line;
      return `${i + offset + 1}: ${truncated}`;
    })
    .join("\n");
}

export function createReadTool(): Tool {
  return {
    name: "read_file",
    description:
      "Read a file or directory from the local filesystem. Returns file content with line numbers, or directory listing. Supports pagination via offset/limit.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file/directory path" },
        offset: { type: "number", description: "Line number to start reading from (0-based)" },
        limit: { type: "number", description: "Maximum number of lines to read" },
      },
      required: ["path"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const {
        path: rawPath,
        offset = 0,
        limit = MAX_LINES,
      } = input as {
        path: string;
        offset?: number;
        limit?: number;
      };

      const filePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workingDirectory, rawPath);

      try {
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          return await readDirectory(filePath);
        }

        return await readFile(filePath, offset, limit);
      } catch {
        return {
          toolCallId: "",
          content: `File not found: ${filePath}`,
          isError: true,
        };
      }
    },
  };
}

async function readFile(filePath: string, offset: number, limit: number): Promise<ToolResult> {
  const buffer = await fs.readFile(filePath);

  if (isBinary(buffer)) {
    return {
      toolCallId: "",
      content: `Binary file detected: ${filePath} (${buffer.length} bytes)`,
      isError: true,
    };
  }

  const text = stripBom(buffer.toString("utf-8"));
  const allLines = text.split("\n");

  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }

  const sliced = allLines.slice(offset, offset + limit);
  const content = formatWithLineNumbers(sliced, offset);

  const title =
    allLines.length > limit
      ? `Read ${filePath} (lines ${offset + 1}-${offset + sliced.length} of ${allLines.length})`
      : `Read ${filePath}`;

  return {
    toolCallId: "",
    content,
    isError: false,
    title,
    metadata: {
      totalLines: allLines.length,
      showedLines: sliced.length,
      offset,
    },
  };
}

async function readDirectory(dirPath: string): Promise<ToolResult> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const lines = entries.map((entry) => {
    const suffix = entry.isDirectory() ? "/" : "";
    return `  ${entry.name}${suffix}`;
  });

  const content = `Directory: ${dirPath} (${entries.length} entries)\n${lines.join("\n")}`;

  return {
    toolCallId: "",
    content,
    isError: false,
    title: `List ${dirPath}`,
    metadata: { totalEntries: entries.length },
  };
}
