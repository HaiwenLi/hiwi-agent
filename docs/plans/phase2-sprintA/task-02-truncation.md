### Task 02: Output Truncation Service

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
