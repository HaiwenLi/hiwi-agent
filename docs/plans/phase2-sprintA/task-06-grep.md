### Task 06: grep Tool

**Files:**
- Create: `src/tools/grep.ts`
- Test: `tests/unit/tools/grep.test.ts`

**Context:** Regex content search across files. Returns matching lines with file path and line number. File filter via include parameter. Limited to 100 results.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/grep.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGrepTool } from "@/tools/grep.js";
import type { Tool, ToolContext } from "@/types.js";

describe("grep tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-grep-"));
    tool = createGrepTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("grep");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("finds matching lines across files", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "hello\nworld\nhello again");
    await fs.writeFile(path.join(tempDir, "b.ts"), "no match\nhello from b");

    const result = await tool.execute({ pattern: "hello" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("a.ts");
    expect(result.content).toContain("b.ts");
  });

  it("returns line numbers with matches", async () => {
    await fs.writeFile(path.join(tempDir, "code.ts"), "line1\nline2\nline3\n");
    const result = await tool.execute({ pattern: "line2" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toMatch(/2.*line2/);
  });

  it("filters by include pattern", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "function foo");
    await fs.writeFile(path.join(tempDir, "b.js"), "function bar");

    const result = await tool.execute({ pattern: "function", include: "*.ts" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("a.ts");
    expect(result.content).not.toContain("b.js");
  });

  it("supports regex patterns", async () => {
    await fs.writeFile(path.join(tempDir, "r.ts"), "const x = 42;\nconst y = 'hello';");
    const result = await tool.execute({ pattern: "const \\w+ = \\d+" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("const x = 42");
    expect(result.content).not.toContain("hello");
  });

  it("searches subdirectories recursively", async () => {
    const sub = path.join(tempDir, "sub");
    await fs.mkdir(sub);
    await fs.writeFile(path.join(sub, "deep.ts"), "target string");

    const result = await tool.execute({ pattern: "target" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("deep.ts");
  });

  it("limits results to 100 matches", async () => {
    // Create a file with 120 matches
    const lines = Array.from({ length: 120 }, (_, i) => `match_line_${i}`);
    await fs.writeFile(path.join(tempDir, "big.ts"), lines.join("\n"));

    const result = await tool.execute({ pattern: "match_line" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.metadata?.truncated).toBe(true);
  });

  it("returns message when no matches found", async () => {
    await fs.writeFile(path.join(tempDir, "empty.ts"), "nothing here");
    const result = await tool.execute({ pattern: "nonexistent" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("0 matches");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/grep.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createGrepTool**

Create `src/tools/grep.ts`:

```typescript
import { promises as fs } from "node:fs";
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
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
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
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`);
}

export function createGrepTool(): Tool {
  return {
    name: "grep",
    description: "Search file contents using regex. Returns matching lines with file paths and line numbers. Filter by file pattern with include parameter.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression pattern to search for" },
        include: { type: "string", description: 'File glob filter (e.g., "*.ts", "*.{js,jsx}")' },
        path: { type: "string", description: "Directory to search in (defaults to workingDirectory)" },
      },
      required: ["pattern"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { pattern, include, path: searchPath } = input as {
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
                const truncated = lines[i].length > MAX_LINE_LENGTH
                  ? lines[i].slice(0, MAX_LINE_LENGTH) + "..."
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
        const lines = matches.map(
          (m) => `${m.filePath}:${m.lineNumber}: ${m.line}`,
        );

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
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/grep.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/grep.ts tests/unit/tools/grep.test.ts
git commit -m "feat: add grep tool with regex search and file filtering"
```
