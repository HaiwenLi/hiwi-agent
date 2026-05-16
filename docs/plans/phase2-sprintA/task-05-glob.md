### Task 05: glob Tool

**Files:**
- Create: `src/tools/glob.ts`
- Test: `tests/unit/tools/glob.test.ts`

**Context:** Fast file pattern matching using Node.js fs recursive walk. Returns files sorted by modification time, limited to 100 results.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/glob.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGlobTool } from "@/tools/glob.js";
import type { Tool, ToolContext } from "@/types.js";

describe("glob tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-glob-"));
    tool = createGlobTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("glob");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("finds files matching a glob pattern", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "a");
    await fs.writeFile(path.join(tempDir, "b.ts"), "b");
    await fs.writeFile(path.join(tempDir, "c.js"), "c");

    const result = await tool.execute({ pattern: "**/*.ts" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("a.ts");
    expect(result.content).toContain("b.ts");
    expect(result.content).not.toContain("c.js");
  });

  it("finds files in nested directories", async () => {
    const subDir = path.join(tempDir, "src", "components");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, "App.tsx"), "app");
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "idx");

    const result = await tool.execute({ pattern: "**/*.tsx" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("App.tsx");
  });

  it("limits results to 100 files", async () => {
    for (let i = 0; i < 120; i++) {
      await fs.writeFile(path.join(tempDir, `file-${i}.txt`), `${i}`);
    }

    const result = await tool.execute({ pattern: "**/*.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.metadata?.truncated).toBe(true);
    expect(result.metadata?.totalShown).toBe(100);
  });

  it("scopes search to a specific path", async () => {
    const subA = path.join(tempDir, "a");
    const subB = path.join(tempDir, "b");
    await fs.mkdir(subA, { recursive: true });
    await fs.mkdir(subB, { recursive: true });
    await fs.writeFile(path.join(subA, "x.txt"), "x");
    await fs.writeFile(path.join(subB, "y.txt"), "y");

    const result = await tool.execute({ pattern: "*.txt", path: "a" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("x.txt");
    expect(result.content).not.toContain("y.txt");
  });

  it("returns empty result for no matches", async () => {
    const result = await tool.execute({ pattern: "*.xyz" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("0 files");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/glob.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createGlobTool**

Create `src/tools/glob.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_RESULTS = 100;

async function walk(dir: string, pattern: RegExp, results: string[], limit: number): Promise<void> {
  if (results.length >= limit) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= limit) return;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip common ignored directories
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      await walk(fullPath, pattern, results, limit);
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
}

function globToRegex(pattern: string): RegExp {
  // Convert glob to regex: ** -> .*, * -> [^/]*, ? -> [^/]
  let regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`);
}

function patternMatches(pattern: string, filePath: string, basePath: string): boolean {
  const relative = path.relative(basePath, filePath);
  const parts = pattern.split("/");
  const relParts = relative.split(/[/\\]/);

  // Simple pattern: just filename (e.g., "*.ts")
  if (parts.length === 1) {
    const regex = globToRegex(parts[0]);
    return regex.test(path.basename(filePath));
  }

  // Pattern with path (e.g., "**/*.ts" or "src/**/*.ts")
  if (pattern.startsWith("**/")) {
    const suffix = pattern.slice(3); // e.g., "*.ts"
    const regex = globToRegex(suffix);
    return regex.test(path.basename(filePath));
  }

  // Exact relative path pattern
  const regex = globToRegex(pattern);
  return regex.test(relative.replace(/\\/g, "/"));
}

export function createGlobTool(): Tool {
  return {
    name: "glob",
    description: "Fast file pattern matching. Returns file paths sorted by modification time. Use to find files by name patterns like **/*.ts or src/**/*.tsx.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: 'Glob pattern (e.g., "**/*.ts", "src/**/*.tsx")' },
        path: { type: "string", description: "Directory to search in (defaults to workingDirectory)" },
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
        await walk(basePath, /.*/, results, MAX_RESULTS + 20); // Over-fetch for sorting

        // Filter by pattern
        const matched = results.filter((f) => patternMatches(pattern, f, basePath));

        // Sort by mtime (newest first)
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

        const content = lines.length > 0
          ? lines.join("\n")
          : `No files matching "${pattern}" found in ${basePath}`;

        return {
          toolCallId: "",
          content: truncated ? `${content}\n... (${withMtime.length} total, showing first ${MAX_RESULTS})` : content,
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
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/glob.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/glob.ts tests/unit/tools/glob.test.ts
git commit -m "feat: add glob tool with pattern matching and mtime sorting"
```
