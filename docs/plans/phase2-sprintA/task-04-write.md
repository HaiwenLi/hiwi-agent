### Task 04: write_file Tool

**Files:**
- Create: `src/tools/write.ts`
- Test: `tests/unit/tools/write.test.ts`

**Context:** Writes content to files. Creates parent directories if needed. Handles BOM preservation on overwrite.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/write.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWriteTool } from "@/tools/write.js";
import type { Tool, ToolContext } from "@/types.js";

describe("write_file tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-write-"));
    tool = createWriteTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("write_file");
    expect(tool.capabilities).toContain("WriteFiles");
  });

  it("creates a new file", async () => {
    const filePath = path.join(tempDir, "new.txt");
    const result = await tool.execute(
      { path: filePath, content: "hello world" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe("hello world");
  });

  it("overwrites an existing file", async () => {
    const filePath = path.join(tempDir, "existing.txt");
    await fs.writeFile(filePath, "old content");
    const result = await tool.execute(
      { path: filePath, content: "new content" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe("new content");
  });

  it("creates parent directories if missing", async () => {
    const filePath = path.join(tempDir, "sub", "dir", "file.txt");
    const result = await tool.execute(
      { path: filePath, content: "nested" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const written = await fs.readFile(filePath, "utf-8");
    expect(written).toBe("nested");
  });

  it("handles relative paths against workingDirectory", async () => {
    const result = await tool.execute(
      { path: "relative.txt", content: "rel" },
      ctx,
    );
    expect(result.isError).toBe(false);
    const written = await fs.readFile(
      path.join(tempDir, "relative.txt"),
      "utf-8",
    );
    expect(written).toBe("rel");
  });

  it("returns error when content is missing", async () => {
    const result = await tool.execute(
      { path: path.join(tempDir, "fail.txt") },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("content");
  });

  it("returns title with file path", async () => {
    const filePath = path.join(tempDir, "titled.txt");
    const result = await tool.execute(
      { path: filePath, content: "t" },
      ctx,
    );
    expect(result.title).toContain("titled.txt");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/write.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createWriteTool**

Create `src/tools/write.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/write.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/write.ts tests/unit/tools/write.test.ts
git commit -m "feat: add write_file tool with directory creation"
```
