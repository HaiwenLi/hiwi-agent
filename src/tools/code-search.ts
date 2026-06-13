import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

interface SearchMatch {
  filePath: string;
  line: number;
  symbolName: string;
  symbolType: string;
  content: string;
}

// Language-specific regex patterns for symbol detection
const PATTERNS: Record<string, Record<string, RegExp>> = {
  ".ts": {
    function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    class: /(?:export\s+)?class\s+(\w+)/g,
    interface: /(?:export\s+)?interface\s+(\w+)/g,
    type: /(?:export\s+)?type\s+(\w+)/g,
    variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    method: /(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(/g,
  },
  ".tsx": {
    function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    class: /(?:export\s+)?class\s+(\w+)/g,
    interface: /(?:export\s+)?interface\s+(\w+)/g,
    type: /(?:export\s+)?type\s+(\w+)/g,
    variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
  },
  ".js": {
    function: /(?:async\s+)?function\s+(\w+)/g,
    class: /class\s+(\w+)/g,
    variable: /(?:const|let|var)\s+(\w+)/g,
    method: /(\w+)\s*\(/g,
  },
  ".py": {
    function: /def\s+(\w+)/g,
    class: /class\s+(\w+)/g,
  },
  ".go": {
    function: /func\s+(?:\([^)]*\)\s+)?(\w+)/g,
    type: /type\s+(\w+)/g,
  },
  ".rs": {
    function: /fn\s+(\w+)/g,
    struct: /struct\s+(\w+)/g,
    trait: /trait\s+(\w+)/g,
    impl: /impl\s+(\w+)/g,
  },
};

const DEFAULT_PATTERNS: Record<string, RegExp> = {
  function: /(?:function|def|fn|func)\s+(\w+)/gi,
  class: /(?:class|struct|interface|trait)\s+(\w+)/gi,
  variable: /(?:const|let|var)\s+(\w+)/gi,
};

async function findFiles(dir: string, pattern: string): Promise<string[]> {
  const extensions = pattern.startsWith("*.") ? [pattern.slice(1)] : [".ts", ".tsx", ".js"];
  const results: string[] = [];

  async function walk(currentDir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext) || extensions.includes("*")) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dir);
  return results;
}

export function createCodeSearchTool(): Tool {
  return {
    name: "code_search",
    description:
      "Search for code symbols (functions, classes, interfaces, types, variables) by name. Uses language-aware pattern matching for TypeScript, JavaScript, Python, Go, and Rust.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Symbol name or pattern to search for (case-insensitive substring match)",
        },
        symbolType: {
          type: "string",
          enum: [
            "function",
            "class",
            "interface",
            "type",
            "variable",
            "method",
            "struct",
            "trait",
            "any",
          ],
          description: "Filter by symbol type (default: any)",
        },
        filePattern: {
          type: "string",
          description: "File extension filter (e.g. '*.ts', '*.py'). Defaults to TS/JS.",
        },
        directory: {
          type: "string",
          description: "Directory to search (default: working directory)",
        },
        maxResults: {
          type: "number",
          description: "Maximum results to return (default 20)",
        },
      },
      required: ["query"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const {
        query,
        symbolType = "any",
        filePattern = "*.ts",
        directory,
        maxResults = 20,
      } = input as {
        query: string;
        symbolType?: string;
        filePattern?: string;
        directory?: string;
        maxResults?: number;
      };

      const searchDir = directory ?? ctx.workingDirectory;

      try {
        const files = await findFiles(searchDir, filePattern);
        if (files.length === 0) {
          return {
            
            content: `No files found matching pattern: ${filePattern}`,
            isError: false,
          };
        }

        const queryLower = query.toLowerCase();
        const matches: SearchMatch[] = [];

        for (const filePath of files) {
          if (matches.length >= maxResults * 2) break;

          const ext = path.extname(filePath);
          const patternsForExt = PATTERNS[ext] ?? DEFAULT_PATTERNS;

          const symbolTypes = symbolType === "any" ? Object.keys(patternsForExt) : [symbolType];

          let content: string;
          try {
            content = await fs.readFile(filePath, "utf-8");
          } catch {
            continue;
          }

          const lines = content.split("\n");

          for (const st of symbolTypes) {
            const regex = patternsForExt[st] ?? PATTERNS[".ts"][st];
            if (!regex) continue;

            // Reset regex state
            regex.lastIndex = 0;

            let match = regex.exec(content);
            while (match !== null) {
              const name = match[1];
              if (name?.toLowerCase().includes(queryLower)) {
                const lineIndex = content.slice(0, match.index).split("\n").length - 1;
                matches.push({
                  filePath: path.relative(searchDir, filePath),
                  line: lineIndex + 1,
                  symbolName: name,
                  symbolType: st,
                  content: lines[lineIndex]?.trim() ?? "",
                });

                if (matches.length >= maxResults) break;
              }
              match = regex.exec(content);
            }

            if (matches.length >= maxResults) break;
          }
        }

        if (matches.length === 0) {
          return {
            
            content: `No symbols matching "${query}" found.`,
            isError: false,
          };
        }

        const formatted = matches
          .slice(0, maxResults)
          .map((m) => `${m.filePath}:${m.line} [${m.symbolType}] ${m.symbolName}\n  ${m.content}`)
          .join("\n\n");

        return {
          
          content: formatted,
          isError: false,
          metadata: { matchCount: matches.length },
        };
      } catch (error) {
        return {
          
          content: `Code search error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
