### Task 09: edit_file Tool

**Files:**
- Create: `src/tools/edit.ts`
- Test: `tests/unit/tools/edit.test.ts`

**Context:** Edits files by replacing `oldString` with `newString`. Tries 9 matching strategies in order (strict → fuzzy). Supports `replaceAll` for renaming. Reads file, applies first successful match, writes back.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/edit.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditTool } from "@/tools/edit.js";
import type { Tool, ToolContext } from "@/types.js";

describe("edit_file tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-edit-"));
    tool = createEditTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("edit_file");
    expect(tool.capabilities).toContain("WriteFiles");
  });

  it("replaces exact match in file", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "hello world\nsecond line");
    const result = await tool.execute(
      { path: filePath, oldString: "hello world", newString: "goodbye world" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const updated = await fs.readFile(filePath, "utf-8");
    expect(updated).toBe("goodbye world\nsecond line");
  });

  it("returns error when oldString not found", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "hello world");
    const result = await tool.execute(
      { path: filePath, oldString: "nonexistent", newString: "replacement" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("returns error when oldString matches multiple times (without replaceAll)", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "foo bar foo baz foo");
    const result = await tool.execute(
      { path: filePath, oldString: "foo", newString: "qux" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("multiple");
  });

  it("replaces all occurrences with replaceAll", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "foo bar foo baz foo");
    const result = await tool.execute(
      { path: filePath, oldString: "foo", newString: "qux", replaceAll: true },
      ctx,
    );
    expect(result.isError).toBe(false);
    const updated = await fs.readFile(filePath, "utf-8");
    expect(updated).toBe("qux bar qux baz qux");
  });

  it("falls back to line-trimmed matching", async () => {
    const filePath = path.join(tempDir, "code.ts");
    await fs.writeFile(filePath, "function hello() {\n  console.log('hi');\n}");
    const result = await tool.execute(
      { path: filePath, oldString: "console.log('hi');", newString: "console.log('hello');" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const updated = await fs.readFile(filePath, "utf-8");
    expect(updated).toContain("console.log('hello')");
  });

  it("handles relative paths", async () => {
    const filePath = path.join(tempDir, "rel.txt");
    await fs.writeFile(filePath, "old content");
    const result = await tool.execute(
      { path: "rel.txt", oldString: "old content", newString: "new content" },
      ctx,
    );
    expect(result.isError).toBe(false);
  });

  it("returns error for non-existent file", async () => {
    const result = await tool.execute(
      { path: path.join(tempDir, "nope.txt"), oldString: "x", newString: "y" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("returns title with file path", async () => {
    const filePath = path.join(tempDir, "titled.txt");
    await fs.writeFile(filePath, "find me");
    const result = await tool.execute(
      { path: filePath, oldString: "find me", newString: "found" },
      ctx,
    );
    expect(result.title).toContain("titled.txt");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/edit.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createEditTool**

Create `src/tools/edit.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { type MatchResult, replaceMatch } from "./edit/strategy.js";
import { simpleReplacer } from "./edit/simple.js";
import { lineTrimmedReplacer } from "./edit/line-trimmed.js";
import { blockAnchorReplacer } from "./edit/block-anchor.js";
import { whitespaceNormReplacer } from "./edit/whitespace-norm.js";
import { lineEndingNormReplacer } from "./edit/line-ending-norm.js";
import { escapeNormReplacer } from "./edit/escape-norm.js";
import { fuzzyBlockReplacer } from "./edit/fuzzy-block.js";
import { multiFuzzyReplacer } from "./edit/multi-fuzzy.js";

type ReplacerFn = (content: string, oldString: string, newString: string) => MatchResult | null;

const STRATEGIES: ReplacerFn[] = [
  simpleReplacer,
  lineTrimmedReplacer,
  lineEndingNormReplacer,
  whitespaceNormReplacer,
  escapeNormReplacer,
  blockAnchorReplacer,
  fuzzyBlockReplacer,
  multiFuzzyReplacer,
];

export function createEditTool(): Tool {
  return {
    name: "edit_file",
    description: "Edit a file by replacing oldString with newString. Tries multiple matching strategies from exact to fuzzy. Use replaceAll to replace all occurrences.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
        oldString: { type: "string", description: "Text to find in the file" },
        newString: { type: "string", description: "Replacement text" },
        replaceAll: { type: "boolean", description: "Replace all occurrences (default false)" },
      },
      required: ["path", "oldString", "newString"],
    },
    capabilities: ["WriteFiles"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { path: rawPath, oldString, newString, replaceAll } = input as {
        path: string;
        oldString: string;
        newString: string;
        replaceAll?: boolean;
      };

      const filePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workingDirectory, rawPath);

      try {
        const content = await fs.readFile(filePath, "utf-8");

        if (replaceAll) {
          return await executeReplaceAll(filePath, content, oldString, newString);
        }

        return await executeSingle(filePath, content, oldString, newString);
      } catch (error) {
        return {
          toolCallId: "",
          content: `File not found: ${filePath}`,
          isError: true,
        };
      }
    },
  };
}

async function executeSingle(
  filePath: string,
  content: string,
  oldString: string,
  newString: string,
): Promise<ToolResult> {
  // Check for multiple exact matches first
  const exactCount = countOccurrences(content, oldString);
  if (exactCount > 1) {
    return {
      toolCallId: "",
      content: `oldString found ${exactCount} times in ${filePath}. Use replaceAll: true to replace all occurrences, or provide more context to make the match unique.`,
      isError: true,
      title: `Edit ${path.basename(filePath)}`,
    };
  }

  // Try strategies in order
  for (const strategy of STRATEGIES) {
    const match = strategy(content, oldString, newString);
    if (match) {
      const updated = replaceMatch(content, match, newString);
      await fs.writeFile(filePath, updated, "utf-8");

      return {
        toolCallId: "",
        content: `Replaced in ${filePath}`,
        isError: false,
        title: `Edit ${path.basename(filePath)}`,
      };
    }
  }

  return {
    toolCallId: "",
    content: `oldString not found in ${filePath}. The text you provided doesn't match any portion of the file. Please read the file first to see its exact content.`,
    isError: true,
    title: `Edit ${path.basename(filePath)}`,
  };
}

async function executeReplaceAll(
  filePath: string,
  content: string,
  oldString: string,
  newString: string,
): Promise<ToolResult> {
  const count = countOccurrences(content, oldString);
  if (count === 0) {
    return {
      toolCallId: "",
      content: `oldString not found in ${filePath}`,
      isError: true,
      title: `Edit ${path.basename(filePath)}`,
    };
  }

  const updated = content.split(oldString).join(newString);
  await fs.writeFile(filePath, updated, "utf-8");

  return {
    toolCallId: "",
    content: `Replaced ${count} occurrences in ${filePath}`,
    isError: false,
    title: `Edit ${path.basename(filePath)} (${count} replacements)`,
    metadata: { replacementCount: count },
  };
}

function countOccurrences(content: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/edit.test.ts`
Expected: PASS

**Step 5: Run full suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/tools/edit.ts tests/unit/tools/edit.test.ts
git commit -m "feat: add edit_file tool with 9-strategy fallback chain"
```
