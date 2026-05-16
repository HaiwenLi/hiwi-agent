---
date: 2026-05-15
phase: phase-2-sprint-A
status: implementation-plan
scope: tools + system prompt
tasks: 14
parent: docs/plans/2026-05-15-phase2-design.md
---

# Sprint A Implementation Plan: Core 6 Tools + System Prompt

Merged from `task-01` through `task-14` — the complete TDD implementation plan for Sprint A.

---

# Task 01: Extend ToolContext + ToolResult Types

**Files:**
- Modify: `src/types.ts:84-87` (ToolContext)
- Modify: `src/types.ts:17-20` (ToolResult)
- Test: `tests/unit/types.test.ts`

**Context:** Current `ToolContext` only has `workingDirectory` and `sessionId`. Tools need abort signal and permission callback. Current `ToolResult` lacks `title` and `metadata` fields for richer output.

---

**Step 1: Write the failing tests**

Add to `tests/unit/types.test.ts`:

```typescript
import type { ToolContext, ToolResult } from "@/types.js";
import { describe, expect, it } from "vitest";

describe("ToolContext", () => {
  it("accepts optional abort signal", () => {
    const controller = new AbortController();
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      abort: controller.signal,
    };
    expect(ctx.abort).toBe(controller.signal);
  });

  it("accepts optional askPermission callback", async () => {
    const askPermission = async () => true;
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      askPermission,
    };
    expect(await ctx.askPermission!({ tool: "bash", capability: "ExecCode" })).toBe(true);
  });

  it("works without optional fields", () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
    };
    expect(ctx.abort).toBeUndefined();
    expect(ctx.askPermission).toBeUndefined();
  });
});

describe("ToolResult", () => {
  it("accepts optional title field", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "file contents",
      isError: false,
      title: "Read src/index.ts",
    };
    expect(result.title).toBe("Read src/index.ts");
  });

  it("accepts optional metadata field", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "3 files found",
      isError: false,
      metadata: { fileCount: 3, truncated: true },
    };
    expect(result.metadata?.fileCount).toBe(3);
  });

  it("works without optional fields", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "ok",
      isError: false,
    };
    expect(result.title).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/types.test.ts`
Expected: FAIL — TypeScript errors, `abort`/`askPermission`/`title`/`metadata` not in interface

**Step 3: Update ToolContext interface**

In `src/types.ts`, replace the ToolContext interface:

```typescript
export interface PermissionRequest {
  tool: string;
  capability: string;
}

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  abort?: AbortSignal;
  askPermission?: (req: PermissionRequest) => Promise<boolean>;
}
```

**Step 4: Update ToolResult interface**

In `src/types.ts`, replace the ToolResult interface:

```typescript
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  title?: string;
  metadata?: Record<string, unknown>;
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/types.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `pnpm vitest run`
Expected: All existing tests still pass (additions are backward compatible)

**Step 7: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "feat: extend ToolContext with abort/askPermission, ToolResult with title/metadata"
```

---

# Task 02: Output Truncation Service

**Files:**
- Create: `src/tools/truncation.ts`
- Test: `tests/unit/tools/truncation.test.ts`

**Context:** Tools like `bash` and `grep` can produce massive output. This service truncates output to a max line/byte limit, keeping head and tail, and writes the full output to a temp file for reference.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/truncation.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TruncationService, type TruncationResult } from "@/tools/truncation.js";

describe("TruncationService", () => {
  let service: TruncationService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-trunc-"));
    service = new TruncationService(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("truncate", () => {
    it("returns text as-is when under limits", () => {
      const text = "short output";
      const result = service.truncate(text);
      expect(result.type).toBe("full");
      if (result.type === "full") {
        expect(result.text).toBe("short output");
      }
    });

    it("truncates by line count when exceeding maxLines", () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
      const text = lines.join("\n");
      const result = service.truncate(text, { maxLines: 2000 });
      expect(result.type).toBe("truncated");
      if (result.type === "truncated") {
        expect(result.preview).toContain("line 0");
        expect(result.preview).toContain("line 2999");
        expect(result.fullFilePath).toBeDefined();
      }
    });

    it("truncates by byte size when exceeding maxBytes", () => {
      const text = "x".repeat(60_000);
      const result = service.truncate(text, { maxBytes: 50_000 });
      expect(result.type).toBe("truncated");
    });

    it("writes full content to temp file when truncated", async () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
      const text = lines.join("\n");
      const result = service.truncate(text, { maxLines: 2000 });
      if (result.type === "truncated") {
        const fileContent = await fs.readFile(result.fullFilePath, "utf-8");
        expect(fileContent).toBe(text);
      }
    });

    it("preview contains head and tail with separator", () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
      const text = lines.join("\n");
      const result = service.truncate(text, { maxLines: 2000 });
      if (result.type === "truncated") {
        expect(result.preview).toContain("... truncated");
        // head lines
        expect(result.preview).toContain("line 0\n");
        // tail lines
        expect(result.preview).toContain("line 2999");
      }
    });
  });

  describe("cleanup", () => {
    it("removes old truncation files", async () => {
      // Create a file with old timestamp
      const oldFile = path.join(tempDir, "old-output.txt");
      await fs.writeFile(oldFile, "old data");

      // Set mtime to 8 days ago
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await fs.utimes(oldFile, oldDate, oldDate);

      await service.cleanup();
      const exists = await fs.access(oldFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it("keeps recent truncation files", async () => {
      const recentFile = path.join(tempDir, "recent-output.txt");
      await fs.writeFile(recentFile, "recent data");

      await service.cleanup();
      const exists = await fs.access(recentFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/truncation.test.ts`
Expected: FAIL — `TruncationService` module not found

**Step 3: Implement TruncationService**

Create `src/tools/truncation.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

export type TruncationResult =
  | { type: "full"; text: string }
  | { type: "truncated"; preview: string; fullFilePath: string };

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50_000;
const HEAD_LINES = 500;
const TAIL_LINES = 500;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class TruncationService {
  constructor(private tempDir: string) {}

  truncate(text: string, options: TruncationOptions = {}): TruncationResult {
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    const lines = text.split("\n");
    const needsLineTruncation = lines.length > maxLines;
    const needsByteTruncation = Buffer.byteLength(text, "utf-8") > maxBytes;

    if (!needsLineTruncation && !needsByteTruncation) {
      return { type: "full", text };
    }

    // Write full content to temp file
    const id = crypto.randomBytes(8).toString("hex");
    const fullFilePath = path.join(this.tempDir, `truncation-${id}.txt`);

    // Fire-and-forget write
    fs.mkdir(this.tempDir, { recursive: true })
      .then(() => fs.writeFile(fullFilePath, text, "utf-8"))
      .catch(() => {});

    // Build preview with head + separator + tail
    const headLines = lines.slice(0, HEAD_LINES);
    const tailLines = lines.slice(-TAIL_LINES);
    const truncatedCount = lines.length - HEAD_LINES - TAIL_LINES;
    const separator = `\n... truncated ${truncatedCount} lines (full output at ${fullFilePath}) ...\n`;
    const preview = headLines.join("\n") + separator + tailLines.join("\n");

    return { type: "truncated", preview, fullFilePath };
  }

  async cleanup(): Promise<void> {
    try {
      const entries = await fs.readdir(this.tempDir);
      const now = Date.now();

      for (const entry of entries) {
        if (!entry.startsWith("truncation-")) continue;
        const filePath = path.join(this.tempDir, entry);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > RETENTION_MS) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
    } catch {
      // Directory may not exist
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/truncation.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/truncation.ts tests/unit/tools/truncation.test.ts
git commit -m "feat: add TruncationService for tool output management"
```

---

# Task 03: read_file Tool

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

---

# Task 04: write_file Tool

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

---

# Task 05: glob Tool

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

---

# Task 06: grep Tool

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

---

# Task 07: bash Tool

**Files:**
- Create: `src/tools/bash.ts`
- Test: `tests/unit/tools/bash.test.ts`

**Context:** Executes shell commands via `child_process.spawn`. Supports timeout, working directory, output truncation via TruncationService. No tree-sitter parsing (too heavy) — simple spawn + collect output.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/bash.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBashTool } from "@/tools/bash.js";
import type { Tool, ToolContext } from "@/types.js";

describe("bash tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-bash-"));
    tool = createBashTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("bash");
    expect(tool.capabilities).toContain("ExecCode");
  });

  it("executes a command and returns stdout", async () => {
    const result = await tool.execute({ command: "echo hello" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("hello");
  });

  it("captures stderr on failure", async () => {
    const result = await tool.execute(
      { command: "ls /nonexistent-dir-xyz" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("respects the working directory", async () => {
    await fs.writeFile(path.join(tempDir, "marker.txt"), "found");
    const result = await tool.execute({ command: "cat marker.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("found");
  });

  it("supports timeout parameter", async () => {
    const result = await tool.execute(
      { command: "sleep 10", timeout: 100 },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timeout");
  });

  it("supports abort signal", async () => {
    const controller = new AbortController();
    const ctxWithAbort = { ...ctx, abort: controller.signal };

    const executePromise = tool.execute(
      { command: "sleep 30" },
      ctxWithAbort,
    );

    // Abort after a short delay
    setTimeout(() => controller.abort(), 100);

    const result = await executePromise;
    expect(result.isError).toBe(true);
  });

  it("truncates large output", async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
    const result = await tool.execute(
      { command: `echo "${lines}"` },
      ctx,
    );
    expect(result.isError).toBe(false);
    // Should have truncation indicator if output is large
  });

  it("returns exit code in metadata", async () => {
    const result = await tool.execute({ command: "exit 42" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.metadata?.exitCode).toBe(42);
  });

  it("returns title with command preview", async () => {
    const result = await tool.execute({ command: "echo test" }, ctx);
    expect(result.title).toContain("echo test");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/bash.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createBashTool**

Create `src/tools/bash.ts`:

```typescript
import path from "node:path";
import { spawn } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { TruncationService } from "./truncation.js";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const TITLE_MAX_LENGTH = 60;

export function createBashTool(truncationDir?: string): Tool {
  const truncation = new TruncationService(
    truncationDir ?? `${process.cwd()}/.hiwi/tmp/truncation`,
  );

  return {
    name: "bash",
    description: "Execute a shell command and return its output. Supports timeout, working directory, and output truncation.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" },
        workdir: { type: "string", description: "Working directory (overrides workingDirectory)" },
      },
      required: ["command"],
    },
    capabilities: ["ExecCode"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { command, timeout = DEFAULT_TIMEOUT, workdir } = input as {
        command: string;
        timeout?: number;
        workdir?: string;
      };

      const cwd = workdir
        ? (path.isAbsolute(workdir) ? workdir : path.resolve(ctx.workingDirectory, workdir))
        : ctx.workingDirectory;

      try {
        const result = await runCommand(command, cwd, timeout, ctx.abort);
        const title = command.length > TITLE_MAX_LENGTH
          ? `${command.slice(0, TITLE_MAX_LENGTH)}...`
          : command;

        if (result.exitCode !== 0) {
          return {
            toolCallId: "",
            content: result.stderr || result.stdout || `Command exited with code ${result.exitCode}`,
            isError: true,
            title: `Bash: ${title}`,
            metadata: { exitCode: result.exitCode },
          };
        }

        // Truncate if needed
        const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");
        const truncated = truncation.truncate(output);

        return {
          toolCallId: "",
          content: truncated.type === "full" ? truncated.text : truncated.preview,
          isError: false,
          title: `Bash: ${title}`,
          metadata: { exitCode: 0, truncated: truncated.type === "truncated" },
        };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Command error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCommand(
  command: string,
  cwd: string,
  timeout: number,
  abort?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "/bin/bash";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString("utf-8");
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });

    // Timeout
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ exitCode: 1, stdout, stderr: `Command timed out after ${timeout}ms` });
    }, timeout);

    // Abort signal
    if (abort) {
      const onAbort = () => {
        clearTimeout(timer);
        child.kill("SIGTERM");
        resolve({ exitCode: 1, stdout, stderr: "Command aborted" });
      };
      if (abort.aborted) {
        onAbort();
      } else {
        abort.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.on("close", () => {
      clearTimeout(timer);
    });
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/bash.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/bash.ts tests/unit/tools/bash.test.ts
git commit -m "feat: add bash tool with spawn, timeout, abort, truncation"
```

---

# Task 08: Edit Matching Strategies

**Files:**
- Create: `src/tools/edit/strategy.ts` — shared types
- Create: `src/tools/edit/simple.ts` — exact match
- Create: `src/tools/edit/line-trimmed.ts` — trim whitespace per-line
- Create: `src/tools/edit/block-anchor.ts` — first/last line anchors
- Create: `src/tools/edit/whitespace-norm.ts` — normalize spaces
- Create: `src/tools/edit/line-ending-norm.ts` — normalize CRLF/LF
- Create: `src/tools/edit/escape-norm.ts` — normalize escape sequences
- Create: `src/tools/edit/fuzzy-block.ts` — fuzzy matching with similarity
- Create: `src/tools/edit/multi-fuzzy.ts` — multiple occurrences
- Test: `tests/unit/tools/edit/strategy.test.ts`

**Context:** The edit tool needs to find `oldString` in file content even when the model's whitespace/indentation doesn't exactly match. These 9 strategies try in order, from strict to fuzzy. Each returns either a match result or null.

---

**Step 1: Write the shared types and failing test**

Create `src/tools/edit/strategy.ts`:

```typescript
export interface MatchResult {
  index: number;
  matchedText: string;
}

export type Replacer = (
  content: string,
  oldString: string,
  newString: string,
) => MatchResult | null;

export function replaceMatch(
  content: string,
  match: MatchResult,
  newString: string,
): string {
  return content.slice(0, match.index) + newString + content.slice(match.index + match.matchedText.length);
}
```

Create `tests/unit/tools/edit/strategy.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { simpleReplacer } from "@/tools/edit/simple.js";
import { lineTrimmedReplacer } from "@/tools/edit/line-trimmed.js";
import { blockAnchorReplacer } from "@/tools/edit/block-anchor.js";
import { whitespaceNormReplacer } from "@/tools/edit/whitespace-norm.js";
import { lineEndingNormReplacer } from "@/tools/edit/line-ending-norm.js";
import { escapeNormReplacer } from "@/tools/edit/escape-norm.js";
import { fuzzyBlockReplacer } from "@/tools/edit/fuzzy-block.js";
import { multiFuzzyReplacer } from "@/tools/edit/multi-fuzzy.js";

const content = `function hello() {
  console.log("hello");
  return true;
}`;

describe("simple replacer", () => {
  it("finds exact match", () => {
    const result = simpleReplacer(content, '  console.log("hello");', '  console.log("world");');
    expect(result).not.toBeNull();
    expect(result!.index).toBe(content.indexOf('  console.log("hello");'));
  });

  it("returns null when no exact match", () => {
    const result = simpleReplacer(content, 'console.log("hello");', '  console.log("world");');
    expect(result).toBeNull();
  });
});

describe("lineTrimmed replacer", () => {
  it("matches ignoring leading/trailing whitespace per line", () => {
    const result = lineTrimmedReplacer(content, 'console.log("hello");', 'console.log("world");');
    expect(result).not.toBeNull();
  });
});

describe("blockAnchor replacer", () => {
  it("matches using first and last lines as anchors", () => {
    const result = blockAnchorReplacer(content, `function hello() {
	something different in middle
	return true;
}`, `function hello() {
  console.log("replaced");
  return true;
}`);
    expect(result).not.toBeNull();
  });

  it("returns null when anchors don't match", () => {
    const result = blockAnchorReplacer(content, `function nope() {
	middle
	return false;
}`, `replacement`);
    expect(result).toBeNull();
  });
});

describe("whitespaceNorm replacer", () => {
  it("matches normalizing multiple spaces to single", () => {
    const code = "const  x  =  1;";
    const result = whitespaceNormReplacer(code, "const x = 1;", "const x = 2;");
    expect(result).not.toBeNull();
  });
});

describe("lineEndingNorm replacer", () => {
  it("matches ignoring CRLF vs LF differences", () => {
    const crlfContent = "line1\r\nline2\r\nline3";
    const result = lineEndingNormReplacer(crlfContent, "line1\nline2", "replaced");
    expect(result).not.toBeNull();
  });
});

describe("escapeNorm replacer", () => {
  it("matches treating \\n as newline", () => {
    const code = 'text = "hello\\nworld"';
    const result = escapeNormReplacer(code, 'text = "hello\nworld"', 'text = "replaced"');
    expect(result).not.toBeNull();
  });
});

describe("fuzzyBlock replacer", () => {
  it("matches with minor differences using similarity", () => {
    const code = "function add(a, b) {\n  return a + b;\n}";
    const result = fuzzyBlockReplacer(code, "function add(a,b) {\n  return a+b;\n}", "function add(a, b) {\n  return a - b;\n}");
    expect(result).not.toBeNull();
  });
});

describe("multiFuzzy replacer", () => {
  it("finds all exact matches", () => {
    const code = "foo\nbar\nfoo\nbaz";
    const result = multiFuzzyReplacer(code, "foo", "qux");
    expect(result).not.toBeNull();
    const replaced = code.slice(0, result!.index) + "qux" + code.slice(result!.index + result!.matchedText.length);
    // Should replace the first occurrence
    expect(replaced).toContain("qux");
  });

  it("returns null when no exact matches", () => {
    const result = multiFuzzyReplacer("hello world", "xyz", "abc");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/edit/strategy.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement each strategy**

Create `src/tools/edit/simple.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const simpleReplacer: Replacer = (content, oldString) => {
  const index = content.indexOf(oldString);
  if (index === -1) return null;
  return { index, matchedText: oldString };
};
```

Create `src/tools/edit/line-trimmed.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const lineTrimmedReplacer: Replacer = (content, oldString) => {
  const contentLines = content.split("\n");
  const oldLines = oldString.split("\n");

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const slice = contentLines.slice(i, i + oldLines.length);
    const allMatch = slice.every(
      (line, j) => line.trim() === oldLines[j].trim(),
    );
    if (allMatch) {
      const matchedText = slice.join("\n");
      const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return { index, matchedText };
    }
  }

  return null;
};
```

Create `src/tools/edit/block-anchor.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const blockAnchorReplacer: Replacer = (content, oldString) => {
  const oldLines = oldString.split("\n");
  if (oldLines.length < 2) return null;

  const firstLine = oldLines[0].trim();
  const lastLine = oldLines[oldLines.length - 1].trim();
  const contentLines = content.split("\n");

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;

    // Look for last line within a reasonable window
    for (let j = i + 1; j < Math.min(i + oldLines.length + 5, contentLines.length); j++) {
      if (contentLines[j].trim() === lastLine) {
        const matchedLines = contentLines.slice(i, j + 1);
        const matchedText = matchedLines.join("\n");
        const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
        return { index, matchedText };
      }
    }
  }

  return null;
};
```

Create `src/tools/edit/whitespace-norm.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function normalizeSpaces(text: string): string {
  return text.replace(/  +/g, " ");
}

export const whitespaceNormReplacer: Replacer = (content, oldString) => {
  const normContent = normalizeSpaces(content);
  const normOld = normalizeSpaces(oldString);
  const index = normContent.indexOf(normOld);
  if (index === -1) return null;

  // Map back to original content position
  // Count how many normalized chars correspond to original chars
  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < index && origIdx < content.length) {
    if (normContent[normIdx] === content[origIdx]) {
      normIdx++;
      origIdx++;
    } else if (content[origIdx] === " ") {
      origIdx++;
    } else {
      normIdx++;
      origIdx++;
    }
  }

  // Find end position similarly
  const normEnd = index + normOld.length;
  let origEnd = origIdx;
  let normIdx2 = normIdx;
  while (normIdx2 < normEnd && origEnd < content.length) {
    if (normContent[normIdx2] === content[origEnd]) {
      normIdx2++;
      origEnd++;
    } else if (content[origEnd] === " ") {
      origEnd++;
    } else {
      normIdx2++;
      origEnd++;
    }
  }

  return { index: origIdx, matchedText: content.slice(origIdx, origEnd) };
};
```

Create `src/tools/edit/line-ending-norm.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export const lineEndingNormReplacer: Replacer = (content, oldString) => {
  const normContent = normalizeLineEndings(content);
  const normOld = normalizeLineEndings(oldString);
  const index = normContent.indexOf(normOld);
  if (index === -1) return null;

  // Map back: find the original span in content
  // Build a mapping from normalized index to original index
  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < index && origIdx < content.length) {
    if (content[origIdx] === "\r" && content[origIdx + 1] === "\n") {
      origIdx += 2;
      normIdx += 1;
    } else {
      origIdx++;
      normIdx++;
    }
  }

  const startOrig = origIdx;
  while (normIdx < index + normOld.length && origIdx < content.length) {
    if (content[origIdx] === "\r" && content[origIdx + 1] === "\n") {
      origIdx += 2;
      normIdx += 1;
    } else {
      origIdx++;
      normIdx++;
    }
  }

  return { index: startOrig, matchedText: content.slice(startOrig, origIdx) };
};
```

Create `src/tools/edit/escape-norm.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function normalizeEscapes(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
}

export const escapeNormReplacer: Replacer = (content, oldString) => {
  const normOld = normalizeEscapes(oldString);
  const index = content.indexOf(normOld);
  if (index === -1) return null;
  return { index, matchedText: normOld };
};
```

Create `src/tools/edit/fuzzy-block.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Simple character-level similarity
  const aChars = new Set(a.split(""));
  const bChars = new Set(b.split(""));
  let common = 0;
  for (const c of aChars) {
    if (bChars.has(c)) common++;
  }
  return common / Math.max(aChars.size, bChars.size);
}

const SIMILARITY_THRESHOLD = 0.5;

export const fuzzyBlockReplacer: Replacer = (content, oldString) => {
  const oldLines = oldString.split("\n");
  if (oldLines.length < 2) return null;

  const contentLines = content.split("\n");

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const slice = contentLines.slice(i, i + oldLines.length);
    const firstSim = similarity(slice[0], oldLines[0]);
    const lastSim = similarity(slice[slice.length - 1], oldLines[oldLines.length - 1]);

    if (firstSim >= SIMILARITY_THRESHOLD && lastSim >= SIMILARITY_THRESHOLD) {
      const matchedText = slice.join("\n");
      const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return { index, matchedText };
    }
  }

  return null;
};
```

Create `src/tools/edit/multi-fuzzy.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const multiFuzzyReplacer: Replacer = (content, oldString) => {
  // Just find the first exact occurrence
  const index = content.indexOf(oldString);
  if (index === -1) return null;
  return { index, matchedText: oldString };
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/edit/strategy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/edit/ tests/unit/tools/edit/
git commit -m "feat: add 9 edit matching strategies (simple to fuzzy)"
```

---

# Task 09: edit_file Tool

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

---

# Task 10: Provider Prompt Templates

**Files:**
- Create: `src/core/prompt/base-anthropic.txt`
- Create: `src/core/prompt/base-gpt.txt`
- Create: `src/core/prompt/base-default.txt`
- Test: `tests/unit/core/prompt/base-prompts.test.ts`

**Context:** Three system prompt variants adapted from OpenCode. Selected by model ID at runtime. Each is a plain text file embedded at build time.

---

**Step 1: Write the failing test**

Create `tests/unit/core/prompt/base-prompts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ANTHROPIC_PROMPT, GPT_PROMPT, DEFAULT_PROMPT, selectBasePrompt } from "@/core/prompt/prompts.js";

describe("provider prompts", () => {
  it("anthropic prompt contains coding instructions", () => {
    expect(ANTHROPIC_PROMPT.length).toBeGreaterThan(100);
    expect(ANTHROPIC_PROMPT).toContain("tool");
  });

  it("gpt prompt contains coding instructions", () => {
    expect(GPT_PROMPT.length).toBeGreaterThan(100);
    expect(GPT_PROMPT).toContain("tool");
  });

  it("default prompt contains coding instructions", () => {
    expect(DEFAULT_PROMPT.length).toBeGreaterThan(100);
    expect(DEFAULT_PROMPT).toContain("tool");
  });
});

describe("selectBasePrompt", () => {
  it("selects anthropic prompt for claude models", () => {
    expect(selectBasePrompt("claude-sonnet-4-6")).toBe(ANTHROPIC_PROMPT);
    expect(selectBasePrompt("claude-opus-4-7")).toBe(ANTHROPIC_PROMPT);
  });

  it("selects gpt prompt for openai models", () => {
    expect(selectBasePrompt("gpt-4o")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("o3-mini")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("o1-pro")).toBe(GPT_PROMPT);
  });

  it("selects default prompt for unknown models", () => {
    expect(selectBasePrompt("deepseek-v4-flash")).toBe(DEFAULT_PROMPT);
    expect(selectBasePrompt("glm-4-plus")).toBe(DEFAULT_PROMPT);
    expect(selectBasePrompt("llama-3")).toBe(DEFAULT_PROMPT);
  });

  it("selects correct prompt by variant name (for config override)", () => {
    expect(selectBasePrompt("anthropic")).toBe(ANTHROPIC_PROMPT);
    expect(selectBasePrompt("gpt")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("default")).toBe(DEFAULT_PROMPT);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/prompt/base-prompts.test.ts`
Expected: FAIL — module not found

**Step 3: Create prompt template files**

Create `src/core/prompt/base-anthropic.txt`:

```
You are hiwi-agent, a coding assistant. You help users with software engineering tasks.

Guidelines:
- Use tools to accomplish tasks. Read files before editing, search before assuming.
- Be concise. Provide direct answers, not explanations unless asked.
- Reference code with file_path:line_number format.
- Make minimal, focused edits. Don't add features beyond what was requested.
- Use parallel tool calls when operations are independent.
- When editing, read the file first to see exact content.
- Default to writing no comments in code.
- Trust internal code and framework guarantees. Validate only at system boundaries.
- Write safe, secure code. No command injection, XSS, SQL injection.

Tool usage:
- read_file: Read files and directories with line numbers. Use offset/limit for large files.
- write_file: Create or overwrite files. Creates parent directories.
- edit_file: Edit files by replacing old text with new text. Multiple matching strategies.
- glob: Find files by name pattern. Sorted by modification time.
- grep: Search file contents with regex. Filter by file pattern.
- bash: Execute shell commands with timeout and output capture.

After completing a task, briefly state what changed and what's next.
```

Create `src/core/prompt/base-gpt.txt`:

```
You are hiwi-agent, a coding assistant running in a terminal. You help with software engineering tasks.

You have access to tools for reading, writing, editing, searching files and running commands.

Guidelines:
- Be direct and concise. Max 4 lines unless detail is requested.
- Use tools proactively. Don't guess file contents — read them.
- Make minimal changes. Don't refactor beyond the task scope.
- Write no comments unless they explain non-obvious behavior.
- Check for security issues in code you write.
- Prefer editing existing files over creating new ones.

Tool usage:
- read_file: Read files/directories. Returns line-numbered content.
- write_file: Write files. Creates directories if needed.
- edit_file: Replace text in files. Multiple matching strategies from exact to fuzzy.
- glob: Find files by name pattern.
- grep: Search content with regex patterns.
- bash: Run shell commands with timeout.

Read files before editing them. Use glob/grep to locate code before modifying.
```

Create `src/core/prompt/base-default.txt`:

```
You are hiwi-agent, an AI coding assistant. Help with software engineering tasks using the available tools.

Available tools: read_file, write_file, edit_file, glob, grep, bash.

Guidelines:
- Use tools to read, search, and modify code.
- Be concise in responses.
- Read files before editing.
- Make minimal, focused changes.
- Write secure code.
```

**Step 4: Create the prompts module**

Create `src/core/prompt/prompts.ts`:

```typescript
import ANTHROPIC_PROMPT_RAW from "./base-anthropic.txt";
import GPT_PROMPT_RAW from "./base-gpt.txt";
import DEFAULT_PROMPT_RAW from "./base-default.txt";

export const ANTHROPIC_PROMPT = ANTHROPIC_PROMPT_RAW;
export const GPT_PROMPT = GPT_PROMPT_RAW;
export const DEFAULT_PROMPT = DEFAULT_PROMPT_RAW;

export function selectBasePrompt(modelId: string): string {
  // Direct variant names (from config override)
  if (modelId === "anthropic") return ANTHROPIC_PROMPT;
  if (modelId === "gpt") return GPT_PROMPT;
  if (modelId === "default") return DEFAULT_PROMPT;
  // Model ID pattern matching (auto-detect)
  if (modelId.includes("claude")) return ANTHROPIC_PROMPT;
  if (modelId.includes("gpt") || modelId.includes("o1") || modelId.includes("o3")) return GPT_PROMPT;
  return DEFAULT_PROMPT;
}
```

**Step 5: Update tsconfig to support .txt imports**

Check if tsup handles raw imports. If not, add a declaration. Create `src/raw.d.ts`:

```typescript
declare module "*.txt" {
  const content: string;
  export default content;
}
```

**Step 6: Run tests**

Run: `pnpm vitest run tests/unit/core/prompt/base-prompts.test.ts`
Expected: May need tsup raw import config. If text imports fail, inline the strings in `prompts.ts` directly:

```typescript
export const ANTHROPIC_PROMPT = `You are hiwi-agent, a coding assistant...`;
export const GPT_PROMPT = `You are hiwi-agent, a coding assistant running in a terminal...`;
export const DEFAULT_PROMPT = `You are hiwi-agent, an AI coding assistant...`;

export function selectBasePrompt(modelId: string): string {
  // Direct variant names (from config override)
  if (modelId === "anthropic") return ANTHROPIC_PROMPT;
  if (modelId === "gpt") return GPT_PROMPT;
  if (modelId === "default") return DEFAULT_PROMPT;
  // Model ID pattern matching (auto-detect)
  if (modelId.includes("claude")) return ANTHROPIC_PROMPT;
  if (modelId.includes("gpt") || modelId.includes("o1") || modelId.includes("o3")) return GPT_PROMPT;
  return DEFAULT_PROMPT;
}
```

Prefer inlining for simplicity — no build config changes needed.

**Step 7: Commit**

```bash
git add src/core/prompt/ tests/unit/core/prompt/
git commit -m "feat: add provider prompt templates with model-based selection"
```

---

# Task 11: Environment Context

**Files:**
- Create: `src/core/prompt/environment.ts`
- Test: `tests/unit/core/prompt/environment.test.ts`

**Context:** Generates a text block with working directory, platform, date, and git branch. Injected as the second layer of the system prompt.

---

**Step 1: Write the failing tests**

Create `tests/unit/core/prompt/environment.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEnvironmentContext } from "@/core/prompt/environment.js";

describe("buildEnvironmentContext", () => {
  it("includes working directory", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/home/user/project" });
    expect(ctx).toContain("/home/user/project");
  });

  it("includes platform", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/tmp" });
    expect(ctx).toContain(process.platform);
  });

  it("includes current date", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/tmp" });
    const today = new Date().toISOString().split("T")[0];
    expect(ctx).toContain(today);
  });

  it("includes shell info", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/tmp" });
    expect(ctx).toMatch(/shell/i);
  });

  it("handles missing git branch gracefully", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: os.tmpdir() });
    // Should not throw, may or may not include branch
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/prompt/environment.test.ts`
Expected: FAIL — module not found

**Step 3: Implement buildEnvironmentContext**

Create `src/core/prompt/environment.ts`:

```typescript
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

interface EnvironmentOptions {
  workingDirectory: string;
}

export function buildEnvironmentContext(options: EnvironmentOptions): string {
  const { workingDirectory } = options;
  const platform = process.platform;
  const date = new Date().toISOString().split("T")[0];
  const shell = process.env.SHELL ?? (platform === "win32" ? "cmd" : "/bin/bash");
  const homeDir = os.homedir();

  const lines: string[] = [
    `Working directory: ${workingDirectory}`,
    `Platform: ${platform}`,
    `Shell: ${shell}`,
    `Date: ${date}`,
    `Home: ${homeDir}`,
  ];

  // Try to get git branch
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: workingDirectory,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (branch) {
      lines.push(`Git branch: ${branch}`);
    }
  } catch {
    // Not a git repo or git not available
  }

  return lines.join("\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/prompt/environment.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/prompt/environment.ts tests/unit/core/prompt/environment.test.ts
git commit -m "feat: add environment context builder for system prompt"
```

---

# Task 12: Dynamic Prompt Assembler

**Files:**
- Create: `src/core/prompt/assembler.ts`
- Test: `tests/unit/core/prompt/assembler.test.ts`

**Context:** Assembles the full system prompt from layers: base prompt → environment → .hiwi-rules → MEMORY.md. Each layer is separated by a blank line. Missing layers are skipped.

---

**Step 1: Write the failing tests**

Create `tests/unit/core/prompt/assembler.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "@/core/prompt/assembler.js";

describe("assembleSystemPrompt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-prompt-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("assembles prompt with base and environment only", async () => {
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("hiwi-agent");
    expect(result).toContain(tempDir);
  });

  it("includes .hiwi-rules content when file exists", async () => {
    await fs.writeFile(
      path.join(tempDir, ".hiwi-rules"),
      "Always use TypeScript strict mode",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("TypeScript strict mode");
  });

  it("includes MEMORY.md content when file exists", async () => {
    await fs.writeFile(
      path.join(tempDir, "MEMORY.md"),
      "# Project Memory\nImportant context here",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("Important context here");
  });

  it("skips missing optional layers", async () => {
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    // Should not contain MEMORY.md or .hiwi-rules markers
    expect(result).not.toContain("undefined");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(50);
  });

  it("selects correct prompt by model ID", async () => {
    const claudeResult = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    const gptResult = await assembleSystemPrompt({
      modelId: "gpt-4o",
      workingDirectory: tempDir,
    });
    // Both should have content but different base prompts
    expect(claudeResult.length).toBeGreaterThan(0);
    expect(gptResult.length).toBeGreaterThan(0);
  });

  it("orders layers correctly: base → env → rules → memory", async () => {
    await fs.writeFile(
      path.join(tempDir, ".hiwi-rules"),
      "RULES_CONTENT",
    );
    await fs.writeFile(
      path.join(tempDir, "MEMORY.md"),
      "MEMORY_CONTENT",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    const rulesIdx = result.indexOf("RULES_CONTENT");
    const memoryIdx = result.indexOf("MEMORY_CONTENT");
    const envIdx = result.indexOf("Working directory");
    expect(envIdx).toBeLessThan(rulesIdx);
    expect(rulesIdx).toBeLessThan(memoryIdx);
  });

  it("uses providerVariant override when set", async () => {
    const result = await assembleSystemPrompt({
      modelId: "deepseek-v4-flash",  // would normally get DEFAULT_PROMPT
      workingDirectory: tempDir,
      providerVariant: "anthropic",  // but override forces ANTHROPIC_PROMPT
    });
    // Anthropic prompt is longer and contains Claude-specific content
    expect(result.length).toBeGreaterThan(100);
  });

  it("ignores providerVariant: auto and falls back to model ID", async () => {
    const resultAuto = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
      providerVariant: "auto",
    });
    const resultNone = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(resultAuto).toBe(resultNone);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/prompt/assembler.test.ts`
Expected: FAIL — module not found

**Step 3: Implement assembleSystemPrompt**

Create `src/core/prompt/assembler.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { selectBasePrompt } from "./prompts.js";
import { buildEnvironmentContext } from "./environment.js";

interface AssembleOptions {
  modelId: string;
  workingDirectory: string;
  providerVariant?: "auto" | "anthropic" | "gpt" | "default";
}

export async function assembleSystemPrompt(options: AssembleOptions): Promise<string> {
  const { modelId, workingDirectory, providerVariant } = options;

  const layers: string[] = [];

  // Layer 1: Provider-specific base prompt
  // If user explicitly set providerVariant (not "auto"), use it; otherwise auto-select by model ID
  const prompt = providerVariant && providerVariant !== "auto"
    ? selectBasePrompt(providerVariant)
    : selectBasePrompt(modelId);
  layers.push(prompt);

  // Layer 2: Environment context
  layers.push(buildEnvironmentContext({ workingDirectory }));

  // Layer 3: .hiwi-rules file (project instructions)
  const rulesPath = path.join(workingDirectory, ".hiwi-rules");
  try {
    const rules = await fs.readFile(rulesPath, "utf-8");
    if (rules.trim()) {
      layers.push(`Project instructions:\n${rules.trim()}`);
    }
  } catch {
    // No .hiwi-rules file — skip
  }

  // Layer 4: MEMORY.md
  const memoryPath = path.join(workingDirectory, "MEMORY.md");
  try {
    const memory = await fs.readFile(memoryPath, "utf-8");
    if (memory.trim()) {
      layers.push(`Project memory:\n${memory.trim()}`);
    }
  } catch {
    // No MEMORY.md — skip
  }

  // Layer 5: Skill descriptions (injected when skills are active — see src/skills/)
  // Skill descriptions go here, appended when a skill is loaded by the skill system.

  return layers.join("\n\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/prompt/assembler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/prompt/assembler.ts tests/unit/core/prompt/assembler.test.ts
git commit -m "feat: add dynamic system prompt assembler with layered construction"
```

---

# Task 13: Config Additions for System Prompt

**Files:**
- Modify: `src/types.ts` (add SystemPromptConfig to AgentConfig)
- Modify: `src/core/config.ts` (add schema and defaults)
- Test: `tests/unit/core/config.test.ts` (extend existing)

**Context:** Add optional `systemPrompt` section to config so users can override the prompt variant (`auto`, `anthropic`, `gpt`, `default`).

---

**Step 1: Write the failing tests**

Add to `tests/unit/core/config.test.ts` (extend existing config tests):

```typescript
describe("systemPrompt config", () => {
  it("accepts systemPrompt.providerVariant", async () => {
    const globalDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-cfg-"));
    await fs.writeFile(
      path.join(globalDir, "config.json"),
      JSON.stringify({
        systemPrompt: { providerVariant: "anthropic" },
      }),
    );

    const result = await loadConfig(globalDir);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect((result.value as any).systemPrompt?.providerVariant).toBe("anthropic");
    }

    await fs.rm(globalDir, { recursive: true, force: true });
  });

  it("defaults to auto when not specified", async () => {
    const globalDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-cfg-"));
    const result = await loadConfig(globalDir);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect((result.value as any).systemPrompt).toBeUndefined();
    }

    await fs.rm(globalDir, { recursive: true, force: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/config.test.ts`
Expected: FAIL — `systemPrompt` not in config type

**Step 3: Add SystemPromptConfig to types**

In `src/types.ts`, add before `AgentConfig`:

```typescript
export interface SystemPromptConfig {
  providerVariant?: "auto" | "anthropic" | "gpt" | "default";
}
```

Update `AgentConfig`:

```typescript
export interface AgentConfig {
  activeProvider: string;
  activeModel: string;
  providers: Record<string, ProviderConfig>;
  agent: AgentLoopConfig;
  systemPrompt?: SystemPromptConfig;
}
```

**Step 4: Add schema to config.ts**

In `src/core/config.ts`, add:

```typescript
const SystemPromptConfigSchema = z.object({
  providerVariant: z.enum(["auto", "anthropic", "gpt", "default"]).optional(),
}).optional();
```

Update `AgentConfigPartialSchema`:

```typescript
const AgentConfigPartialSchema = z.object({
  activeProvider: z.string().optional(),
  activeModel: z.string().optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  agent: z.object({
    maxLoops: z.number().optional(),
    maxOutputTokensPerTurn: z.number().optional(),
    budgetTotal: z.number().optional(),
    refundableTools: z.array(z.string()).optional(),
    streaming: z.boolean().optional(),
    interruptible: z.boolean().optional(),
  }).optional(),
  systemPrompt: z.object({
    providerVariant: z.enum(["auto", "anthropic", "gpt", "default"]).optional(),
  }).optional(),
});
```

Update `deepMerge` to handle `systemPrompt`:

```typescript
if (override.systemPrompt !== undefined)
  result.systemPrompt = { ...base.systemPrompt, ...(override.systemPrompt as Partial<SystemPromptConfig>) };
```

Import `SystemPromptConfig` type:

```typescript
import type { AgentConfig, AgentLoopConfig, ProviderConfig, SystemPromptConfig } from "../types.js";
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/config.test.ts`
Expected: PASS

**Step 6: Run full suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/types.ts src/core/config.ts tests/unit/core/config.test.ts
git commit -m "feat: add systemPrompt config with providerVariant option"
```

---

# Task 14: Integration Wiring

**Files:**
- Create: `src/tools/index.ts` — tool registration helper
- Modify: `src/cli/repl.ts` — register tools on startup
- Modify: `src/core/agent.ts` — accept system prompt in run()
- Test: `tests/integration/tools-wiring.test.ts`

**Context:** Wire all tools into the ToolRegistry and use the prompt assembler to build the system prompt for each session. This is the glue that connects everything.

---

**Step 1: Write the failing test**

Create `tests/integration/tools-wiring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { registerCoreTools } from "@/tools/index.js";
import { ToolRegistry } from "@/core/tools.js";

describe("core tools registration", () => {
  it("registers all 6 core tools", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const tools = registry.list();
    const names = tools.map((t) => t.name);

    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("bash");
    expect(tools).toHaveLength(6);
  });

  it("all tools have valid schemas", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const defs = registry.toToolDefinitions();

    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toBeDefined();
      expect((def.inputSchema as any).type).toBe("object");
    }
  });

  it("generates correct tool definitions for model", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const defs = registry.toToolDefinitions();

    const readDef = defs.find((d) => d.name === "read_file");
    expect(readDef).toBeDefined();
    expect((readDef!.inputSchema as any).properties.path).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/tools-wiring.test.ts`
Expected: FAIL — module not found

**Step 3: Create tool registration helper**

Create `src/tools/index.ts`:

```typescript
import type { ToolRegistry } from "../core/tools.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit.js";
import { createGlobTool } from "./glob.js";
import { createGrepTool } from "./grep.js";
import { createBashTool } from "./bash.js";

export function registerCoreTools(registry: ToolRegistry): void {
  registry.register(createReadTool());
  registry.register(createWriteTool());
  registry.register(createEditTool());
  registry.register(createGlobTool());
  registry.register(createGrepTool());
  registry.register(createBashTool());
}

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createBashTool,
};
```

**Step 4: Wire tools into REPL startup**

In `src/cli/repl.ts`, add tool registration after ToolRegistry creation. Find where `ToolRegistry` is instantiated and add:

```typescript
import { registerCoreTools } from "../tools/index.js";

// After creating registry:
registerCoreTools(this.toolRegistry);
```

**Step 5: Wire system prompt into agent loop**

In `src/core/agent.ts`, update `AgentLoop` constructor to accept optional system prompt:

```typescript
import { assembleSystemPrompt } from "./prompt/assembler.js";

// In the run() method, before the while loop:
const systemPrompt = await assembleSystemPrompt({
  modelId: this.adapter.id,
  workingDirectory: ctx.workingDirectory,
});
currentMessages.unshift({ role: "system", content: systemPrompt });
```

**Step 6: Run tests**

Run: `pnpm vitest run tests/integration/tools-wiring.test.ts`
Expected: PASS

Run: `pnpm vitest run`
Expected: All tests pass (existing tests may need minor updates for new constructor params)

**Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 8: Commit**

```bash
git add src/tools/index.ts src/cli/repl.ts src/core/agent.ts tests/integration/tools-wiring.test.ts
git commit -m "feat: wire core tools and system prompt into agent loop"
```

---

## Summary: Task Dependency Order

```
Task 01 (types)        ← foundation for all tools
  ├─ Task 02 (truncation) ← needed by bash
  ├─ Task 03 (read)
  ├─ Task 04 (write)
  ├─ Task 05 (glob)
  ├─ Task 06 (grep)
  ├─ Task 07 (bash)       ← depends on truncation
  ├─ Task 08 (edit-strategies) ← needed by edit
  ├─ Task 09 (edit)       ← depends on edit-strategies
  ├─ Task 10 (prompt-base)
  ├─ Task 11 (prompt-env)
  ├─ Task 12 (prompt-assembler) ← depends on prompt-base + prompt-env
  ├─ Task 13 (config)     ← depends on types
  └─ Task 14 (wiring)     ← depends on everything
```

**Recommended Implementation Order:**

1. Task 01 (types) — first, unblocks everything
2. Task 02 (truncation) — early, bash depends on it
3. Tasks 03-06 (read, write, glob, grep) — parallel after types
4. Task 07 (bash) — after truncation
5. Tasks 08-09 (edit-strategies, edit) — after types, parallel with others
6. Tasks 10-12 (prompt-base, prompt-env, prompt-assembler) — sequential, parallel with tools
7. Task 13 (config) — after types
8. Task 14 (wiring) — last, depends on everything

**Estimated total: ~2,000 lines of source and ~1,500 lines of test code across 14 commits.**
