import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_RESULTS = 100;
const MAX_LINE_LENGTH = 2000;

interface Match {
  filePath: string;
  lineNumber: number;
  line: string;
}

async function walkFiles(dir: string, includeRegex: RegExp | null): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist")
          continue;
        await walk(fullPath);
      } else if (includeRegex ? includeRegex.test(entry.name) : true) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

function globToRegex(pattern: string): RegExp {
  const regex = pattern.replace(/\./g, "\\.").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${regex}$`);
}

export function createGrepTool(): Tool {
  return {
    name: "grep",
    description:
      "Search file contents using regex. Returns matching lines with file paths and line numbers. Filter by file pattern with include parameter.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern to search for" },
        include: { type: "string", description: 'File glob filter (e.g., "*.ts", "*.{js,jsx}")' },
        path: {
          type: "string",
          description: "Directory to search in (defaults to workingDirectory)",
        },
      },
      required: ["pattern"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const {
        pattern,
        include,
        path: searchPath,
      } = input as {
        pattern: string;
        include?: string;
        path?: string;
      };

      const basePath = searchPath
        ? path.resolve(ctx.workingDirectory, searchPath)
        : ctx.workingDirectory;

      let searchRegex: RegExp;
      try {
        searchRegex = new RegExp(pattern);
      } catch {
        return {
          toolCallId: "",
          content: `Invalid regex pattern: ${pattern}`,
          isError: true,
        };
      }

      const includeRegex = include ? globToRegex(include) : null;

      try {
        const files = await walkFiles(basePath, includeRegex);
        const matches: Match[] = [];

        for (const filePath of files) {
          if (matches.length >= MAX_RESULTS) break;

          try {
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= MAX_RESULTS) break;
              if (searchRegex.test(lines[i])) {
                const truncated =
                  lines[i].length > MAX_LINE_LENGTH
                    ? `${lines[i].slice(0, MAX_LINE_LENGTH)}...`
                    : lines[i];
                matches.push({ filePath, lineNumber: i + 1, line: truncated });
              }
            }
          } catch {
            // Skip unreadable files
          }
        }

        if (matches.length === 0) {
          return {
            toolCallId: "",
            content: `0 matches for "${pattern}" in ${basePath}`,
            isError: false,
            title: `Grep "${pattern}" (0 matches)`,
            metadata: { matchCount: 0 },
          };
        }

        const truncated = matches.length >= MAX_RESULTS;
        const lines = matches.map((m) => `${m.filePath}:${m.lineNumber}: ${m.line}`);

        const content = truncated
          ? `${lines.join("\n")}\n... (showing first ${MAX_RESULTS} matches)`
          : lines.join("\n");

        return {
          toolCallId: "",
          content,
          isError: false,
          title: `Grep "${pattern}" (${matches.length} matches)`,
          metadata: {
            matchCount: matches.length,
            truncated,
          },
        };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Grep error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
