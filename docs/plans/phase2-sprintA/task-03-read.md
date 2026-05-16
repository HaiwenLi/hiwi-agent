### Task 03: read_file Tool

**Files:**
- Create: `src/tools/read.ts`
- Test: `tests/unit/tools/read.test.ts`

**Context:** Reads files and directories. Supports pagination (offset/limit), binary detection, BOM handling. Directory listing returns entries with type indicators.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/read.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReadTool } from "@/tools/read.js";
import type { Tool, ToolContext } from "@/types.js";

describe("read_file tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-read-"));
    tool = createReadTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("read_file");
    expect(tool.capabilities).toContain("ReadOnly");
    expect(tool.inputSchema).toBeDefined();
  });

  it("reads a file and returns content with line numbers", async () => {
    const filePath = path.join(tempDir, "test.txt");
    await fs.writeFile(filePath, "hello\nworld\n");
    const result = await tool.execute({ path: filePath }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1: hello");
    expect(result.content).toContain("2: world");
  });

  it("reads a file with offset", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    await fs.writeFile(filePath, lines.join("\n"));
    const result = await tool.execute({ path: filePath, offset: 50 }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("51: line 50");
    expect(result.content).not.toContain("1: line 0");
  });

  it("reads a file with limit", async () => {
    const filePath = path.join(tempDir, "test.txt");
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    await fs.writeFile(filePath, lines.join("\n"));
    const result = await tool.execute({ path: filePath, limit: 10 }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1: line 0");
    expect(result.content).toContain("10: line 9");
    expect(result.content).not.toContain("11: line 10");
  });

  it("reads a directory and lists entries", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "a");
    await fs.mkdir(path.join(tempDir, "subdir"));
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("a.txt");
    expect(result.content).toContain("subdir/");
    expect(result.metadata?.totalEntries).toBe(2);
  });

  it("returns error for non-existent path", async () => {
    const result = await tool.execute(
      { path: path.join(tempDir, "nope.txt") },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("detects binary files", async () => {
    const filePath = path.join(tempDir, "binary.bin");
    const buf = Buffer.alloc(100);
    for (let i = 0; i < 100; i++) buf[i] = i;
    await fs.writeFile(filePath, buf);
    const result = await tool.execute({ path: filePath }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("binary");
  });

  it("handles relative paths against workingDirectory", async () => {
    const filePath = path.join(tempDir, "rel.txt");
    await fs.writeFile(filePath, "relative content");
    const result = await tool.execute({ path: "rel.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("relative content");
  });

  it("strips BOM from file content", async () => {
    const filePath = path.join(tempDir, "bom.txt");
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.concat([bom, Buffer.from("hello")]);
    await fs.writeFile(filePath, content);
    const result = await tool.execute({ path: filePath }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("hello");
    expect(result.content).not.toContain("﻿");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/read.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createReadTool**

Create `src/tools/read.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;
const BOM = 0xfeff;

function isBinary(buffer: Buffer): boolean {
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    if (byte === 0) return true;
    if (byte < 0x07 || (byte > 0x0d && byte < 0x20) /*&& byte !== 0x1b*/) {
      // Control characters except common ones (tab, newline, CR, ESC)
      // Allow ESC for ANSI sequences
    }
  }
  // Simple heuristic: if null bytes found, it's binary
  return false;
}

function stripBom(text: string): string {
  if (text.charCodeAt(0) === BOM) return text.slice(1);
  return text;
}

function formatWithLineNumbers(lines: string[], offset: number): string {
  return lines
    .map((line, i) => {
      const truncated = line.length > MAX_LINE_LENGTH
        ? line.slice(0, MAX_LINE_LENGTH) + "... (truncated)"
        : line;
      return `${i + offset + 1}: ${truncated}`;
    })
    .join("\n");
}

export function createReadTool(): Tool {
  return {
    name: "read_file",
    description: "Read a file or directory from the local filesystem. Returns file content with line numbers, or directory listing. Supports pagination via offset/limit.",
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
      const { path: rawPath, offset = 0, limit = MAX_LINES } = input as {
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

async function readFile(
  filePath: string,
  offset: number,
  limit: number,
): Promise<ToolResult> {
  const buffer = await fs.readFile(filePath);

  // Binary check on first 8KB
  if (isBinary(buffer)) {
    return {
      toolCallId: "",
      content: `Binary file detected: ${filePath} (${buffer.length} bytes)`,
      isError: true,
    };
  }

  let text = stripBom(buffer.toString("utf-8"));
  const allLines = text.split("\n");

  // Remove trailing empty line from split if file ends with newline
  if (allLines.length > 0 && allLines[allLines.length - 1] === "") {
    allLines.pop();
  }

  const sliced = allLines.slice(offset, offset + limit);
  const content = formatWithLineNumbers(sliced, offset);

  const title = allLines.length > limit
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
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/read.test.ts`
Expected: PASS

**Step 5: Run full suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/tools/read.ts tests/unit/tools/read.test.ts
git commit -m "feat: add read_file tool with pagination, binary detection, directory listing"
```
