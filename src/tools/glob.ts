import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_RESULTS = 100;

async function walk(dir: string, results: string[], limit: number): Promise<void> {
  if (results.length >= limit) return;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= limit) return;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      await walk(fullPath, results, limit);
    } else {
      results.push(fullPath);
    }
  }
}

function patternMatches(pattern: string, filePath: string, basePath: string): boolean {
  const relative = path.relative(basePath, filePath).replace(/\\/g, "/");

  // Simple pattern: just filename (e.g., "*.ts")
  if (!pattern.includes("/")) {
    const regex = globToRegex(pattern);
    return regex.test(path.basename(filePath));
  }

  // Pattern with path (e.g., "**/*.ts" or "src/**/*.ts")
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3);
    const regex = globToRegex(suffix);
    return regex.test(path.basename(filePath));
  }

  // Exact relative path pattern
  const regex = globToRegex(pattern);
  return regex.test(relative);
}

function globToRegex(pattern: string): RegExp {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`);
}

export function createGlobTool(): Tool {
  return {
    name: "glob",
    description:
      "Fast file pattern matching. Returns file paths sorted by modification time. Use to find files by name patterns like **/*.ts or src/**/*.tsx.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")' },
        path: {
          type: "string",
          description: "Directory to search in (defaults to workingDirectory)",
        },
      },
      required: ["pattern"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { pattern, path: searchPath } = input as {
        pattern: string;
        path?: string;
      };

      const basePath = searchPath
        ? path.resolve(ctx.workingDirectory, searchPath)
        : ctx.workingDirectory;

      try {
        const results: string[] = [];
        await walk(basePath, results, MAX_RESULTS + 20);

        const matched = results.filter((f) => patternMatches(pattern, f, basePath));

        const withMtime = await Promise.all(
          matched.slice(0, MAX_RESULTS + 20).map(async (f) => {
            try {
              const stat = await fs.stat(f);
              return { path: f, mtime: stat.mtimeMs };
            } catch {
              return { path: f, mtime: 0 };
            }
          }),
        );
        withMtime.sort((a, b) => b.mtime - a.mtime);

        const truncated = withMtime.length > MAX_RESULTS;
        const shown = withMtime.slice(0, MAX_RESULTS);
        const lines = shown.map((item) => item.path);

        const content =
          lines.length > 0 ? lines.join("\n") : `0 files matching "${pattern}" in ${basePath}`;

        return {
          toolCallId: "",
          content: truncated
            ? `${content}\n... (${withMtime.length} total, showing first ${MAX_RESULTS})`
            : content,
          isError: false,
          title: `Glob "${pattern}" (${shown.length} files)`,
          metadata: {
            totalShown: shown.length,
            totalMatched: withMtime.length,
            truncated,
          },
        };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Glob error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
