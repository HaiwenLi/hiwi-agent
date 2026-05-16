### Task 01: apply_patch Tool

**Files:**
- Create: `src/tools/patch/types.ts`
- Create: `src/tools/patch/parser.ts`
- Create: `src/tools/patch/match.ts`
- Create: `src/tools/patch/apply.ts`
- Create: `src/tools/apply-patch.ts`
- Test: `tests/unit/tools/patch/parser.test.ts`
- Test: `tests/unit/tools/patch/match.test.ts`
- Test: `tests/unit/tools/patch/apply.test.ts`
- Test: `tests/unit/tools/apply-patch.test.ts`

**Context:** Applies unified diff patches that can add, update, delete, and move files. Ported from OpenCode `apply_patch.ts` + `patch/index.ts`. The patch parser recognizes `*** Begin Patch` / `*** End Patch` markers. Pattern matching uses a 4-strategy fallback chain (exact → trim-trailing → full-trim → unicode-normalize). No new dependencies — Levenshtein-level matching is inline.

---

## Phase A: Patch Types + Parser

**Step 1: Write the failing parser tests**

Create `tests/unit/tools/patch/parser.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parsePatch } from "@/tools/patch/parser.js";

describe("parsePatch", () => {
  it("parses an add file hunk", () => {
    const patch = `*** Begin Patch
*** Add File: hello.ts
+console.log("hello");
+console.log("world");
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({
      type: "add",
      path: "hello.ts",
      lines: ['console.log("hello");', 'console.log("world");'],
    });
  });

  it("parses a delete file hunk", () => {
    const patch = `*** Begin Patch
*** Delete File: old.ts
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({ type: "delete", path: "old.ts" });
  });

  it("parses an update file hunk with context", () => {
    const patch = `*** Begin Patch
*** Update File: src/app.ts
@@ import statements @@
-import old from "old";
+import new from "new";
 import { something } from "lib";
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].type).toBe("update");
    if (hunks[0].type === "update") {
      expect(hunks[0].path).toBe("src/app.ts");
      expect(hunks[0].chunks).toHaveLength(1);
      const chunk = hunks[0].chunks[0];
      expect(chunk.context).toEqual(["import statements"]);
      expect(chunk.oldLines).toEqual(['import old from "old";']);
      expect(chunk.newLines).toEqual(['import new from "new";']);
    }
  });

  it("parses move-to directive", () => {
    const patch = `*** Begin Patch
*** Update File: old/path.ts
*** Move to: new/path.ts
@@ @@
-old content
+new content
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    if (hunks[0].type === "update") {
      expect(hunks[0].moveTo).toBe("new/path.ts");
    }
  });

  it("parses multiple hunks", () => {
    const patch = `*** Begin Patch
*** Add File: a.ts
+line a
*** Update File: b.ts
@@ @@
-old b
+new b
*** Delete File: c.ts
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(3);
    expect(hunks[0].type).toBe("add");
    expect(hunks[1].type).toBe("update");
    expect(hunks[2].type).toBe("delete");
  });

  it("handles CRLF line endings", () => {
    const patch = "*** Begin Patch\r\n*** Add File: x.ts\r\n+line\r\n*** End Patch";
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
  });

  it("throws on empty patch", () => {
    expect(() => parsePatch("")).toThrow("empty");
  });

  it("throws when no hunks found", () => {
    expect(() => parsePatch("*** Begin Patch\n*** End Patch")).toThrow("no hunks");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/patch/parser.test.ts`
Expected: FAIL — module not found

**Step 3: Implement types + parser**

Create `src/tools/patch/types.ts`:

```typescript
export interface AddFileHunk {
  type: "add";
  path: string;
  lines: string[];
}

export interface DeleteFileHunk {
  type: "delete";
  path: string;
}

export interface UpdateChunk {
  context: string[];
  oldLines: string[];
  newLines: string[];
}

export interface UpdateFileHunk {
  type: "update";
  path: string;
  moveTo?: string;
  chunks: UpdateChunk[];
}

export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;
```

Create `src/tools/patch/parser.ts`:

```typescript
import type { Hunk, UpdateChunk } from "./types.js";

export function parsePatch(patchText: string): Hunk[] {
  if (!patchText.trim()) throw new Error("Patch text is empty");

  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  const hunks: Hunk[] = [];
  let i = 0;

  // Skip to Begin Patch marker
  while (i < lines.length && !lines[i].startsWith("*** Begin Patch")) i++;
  i++; // skip Begin Patch line

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("*** End Patch")) break;

    if (line.startsWith("*** Add File: ")) {
      const path = line.slice("*** Add File: ".length);
      i++;
      const contentLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        contentLines.push(lines[i].startsWith("+") ? lines[i].slice(1) : lines[i]);
        i++;
      }
      hunks.push({ type: "add", path, lines: contentLines });
    } else if (line.startsWith("*** Delete File: ")) {
      hunks.push({ type: "delete", path: line.slice("*** Delete File: ".length) });
      i++;
    } else if (line.startsWith("*** Update File: ")) {
      const path = line.slice("*** Update File: ".length);
      i++;
      let moveTo: string | undefined;
      if (i < lines.length && lines[i].startsWith("*** Move to: ")) {
        moveTo = lines[i].slice("*** Move to: ".length);
        i++;
      }
      const chunks: UpdateChunk[] = [];
      let current: UpdateChunk | null = null;
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        const l = lines[i];
        if (l.startsWith("@@ ")) {
          if (current) chunks.push(current);
          const context = [l.slice(3, l.endsWith(" @@") ? -3 : undefined).trim()];
          current = { context, oldLines: [], newLines: [] };
        } else if (l.startsWith("+")) {
          current?.newLines.push(l.slice(1));
        } else if (l.startsWith("-")) {
          current?.oldLines.push(l.slice(1));
        } else if (l.startsWith(" ")) {
          current?.oldLines.push(l.slice(1));
          current?.newLines.push(l.slice(1));
        } else if (l === "*** End of File") {
          break;
        }
        i++;
      }
      if (current) chunks.push(current);
      hunks.push({ type: "update", path, moveTo, chunks });
    } else {
      i++;
    }
  }

  if (hunks.length === 0) throw new Error("No hunks found in patch");
  return hunks;
}
```

**Step 4: Run parser tests**

Run: `pnpm vitest run tests/unit/tools/patch/parser.test.ts`
Expected: PASS

**Step 5: Commit Phase A**

```bash
mkdir -p src/tools/patch tests/unit/tools/patch
git add src/tools/patch/types.ts src/tools/patch/parser.ts tests/unit/tools/patch/parser.test.ts
git commit -m "feat: add patch parser with add/update/delete hunk support"
```

---

## Phase B: seekSequence Matching

**Step 6: Write the failing match tests**

Create `tests/unit/tools/patch/match.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { seekSequence } from "@/tools/patch/match.js";

describe("seekSequence", () => {
  const file = ["line1", "line2", "line3", "line4", "line5"];

  it("finds exact match", () => {
    expect(seekSequence(["line2", "line3"], file)).toBe(1);
  });

  it("returns -1 when no match", () => {
    expect(seekSequence(["missing"], file)).toBe(-1);
  });

  it("matches with trailing whitespace differences", () => {
    const fileWS = ["line1  ", "line2", "line3"];
    expect(seekSequence(["line1", "line2"], fileWS)).toBe(0);
  });

  it("matches with full trim", () => {
    const fileWS = ["  line1  ", "  line2  "];
    expect(seekSequence(["line1", "line2"], fileWS)).toBe(0);
  });

  it("matches with unicode normalization", () => {
    const fileUni = ["“hello”", "world"]; // smart quotes
    expect(seekSequence(['"hello"', "world"], fileUni)).toBe(0);
  });

  it("handles empty needle", () => {
    expect(seekSequence([], file)).toBe(0);
  });

  it("handles needle longer than file", () => {
    expect(seekSequence(["a", "b", "c", "d", "e", "f"], file)).toBe(-1);
  });
});
```

**Step 7: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/patch/match.test.ts`
Expected: FAIL — module not found

**Step 8: Implement seekSequence**

Create `src/tools/patch/match.ts`:

```typescript
const SMART_QUOTES: [RegExp, string][] = [
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/–/g, "-"],
  [/—/g, "--"],
  [/…/g, "..."],
];

function normalizeUnicode(s: string): string {
  let result = s.normalize("NFC");
  for (const [re, replacement] of SMART_QUOTES) {
    result = result.replace(re, replacement);
  }
  return result;
}

function trimTrailing(s: string): string {
  return s.replace(/\s+$/, "");
}

function trimFull(s: string): string {
  return s.trim();
}

function tryMatch(
  needle: string[],
  haystack: string[],
  transform: (s: string) => string,
): number {
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (transform(needle[j]) !== transform(haystack[i + j])) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

export function seekSequence(needle: string[], haystack: string[]): number {
  if (needle.length === 0) return 0;
  if (needle.length > haystack.length) return -1;

  // Strategy 1: exact match
  let idx = tryMatch(needle, haystack, (s) => s);
  if (idx !== -1) return idx;

  // Strategy 2: trim trailing whitespace
  idx = tryMatch(needle, haystack, trimTrailing);
  if (idx !== -1) return idx;

  // Strategy 3: full trim
  idx = tryMatch(needle, haystack, trimFull);
  if (idx !== -1) return idx;

  // Strategy 4: unicode normalization
  idx = tryMatch(needle, haystack, normalizeUnicode);
  return idx;
}
```

**Step 9: Run match tests**

Run: `pnpm vitest run tests/unit/tools/patch/match.test.ts`
Expected: PASS

**Step 10: Commit Phase B**

```bash
git add src/tools/patch/match.ts tests/unit/tools/patch/match.test.ts
git commit -m "feat: add seekSequence with 4-strategy matching fallback"
```

---

## Phase C: applyReplacements

**Step 11: Write the failing apply tests**

Create `tests/unit/tools/patch/apply.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { applyHunk } from "@/tools/patch/apply.js";

describe("applyHunk", () => {
  it("adds lines to empty content", () => {
    const result = applyHunk(
      { type: "add", path: "new.ts", lines: ["line1", "line2"] },
      "",
    );
    expect(result).toBe("line1\nline2\n");
  });

  it("replaces old lines with new lines", () => {
    const result = applyHunk(
      {
        type: "update",
        path: "test.ts",
        chunks: [
          { context: ["keep"], oldLines: ["old"], newLines: ["new"] },
        ],
      },
      "keep\nold\n",
    );
    expect(result).toContain("new");
    expect(result).not.toContain("old");
    expect(result).toContain("keep");
  });

  it("handles pure insertion (no old lines)", () => {
    const result = applyHunk(
      {
        type: "update",
        path: "test.ts",
        chunks: [
          { context: ["anchor"], oldLines: [], newLines: ["inserted"] },
        ],
      },
      "anchor\nafter\n",
    );
    expect(result).toContain("inserted");
    expect(result).toContain("anchor");
  });

  it("handles deletion", () => {
    const result = applyHunk(
      {
        type: "update",
        path: "test.ts",
        chunks: [
          { context: ["keep"], oldLines: ["remove-me"], newLines: [] },
        ],
      },
      "keep\nremove-me\n",
    );
    expect(result).not.toContain("remove-me");
  });

  it("handles multiple chunks", () => {
    const content = "a\nb\nc\nd\ne\n";
    const result = applyHunk(
      {
        type: "update",
        path: "test.ts",
        chunks: [
          { context: ["a"], oldLines: ["b"], newLines: ["B"] },
          { context: ["d"], oldLines: ["e"], newLines: ["E"] },
        ],
      },
      content,
    );
    expect(result).toContain("B");
    expect(result).toContain("E");
  });
});
```

**Step 12: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/patch/apply.test.ts`
Expected: FAIL — module not found

**Step 13: Implement applyHunk**

Create `src/tools/patch/apply.ts`:

```typescript
import type { Hunk, UpdateFileHunk } from "./types.js";
import { seekSequence } from "./match.js";

interface Replacement {
  start: number;
  end: number;
  newLines: string[];
}

function computeReplacements(
  chunks: UpdateFileHunk["chunks"],
  fileLines: string[],
): Replacement[] {
  const replacements: Replacement[] = [];

  for (const chunk of chunks) {
    const needle = [...chunk.context, ...chunk.oldLines];

    if (needle.length === 0 && chunk.newLines.length > 0) {
      // Pure insertion after context
      const ctxIdx = chunk.context.length > 0
        ? seekSequence(chunk.context, fileLines)
        : 0;
      if (ctxIdx === -1) continue;
      replacements.push({
        start: ctxIdx + chunk.context.length,
        end: ctxIdx + chunk.context.length,
        newLines: chunk.newLines,
      });
    } else {
      const idx = seekSequence(needle, fileLines);
      if (idx === -1) continue;
      replacements.push({
        start: idx + chunk.context.length,
        end: idx + chunk.context.length + chunk.oldLines.length,
        newLines: chunk.newLines,
      });
    }
  }

  return replacements;
}

export function applyHunk(hunk: Hunk, content: string): string {
  if (hunk.type === "add") {
    return hunk.lines.join("\n") + "\n";
  }

  if (hunk.type === "delete") {
    return "";
  }

  // type === "update"
  const fileLines = content.split("\n");
  // Remove trailing empty line from split
  if (fileLines.length > 0 && fileLines[fileLines.length - 1] === "") {
    fileLines.pop();
  }

  const replacements = computeReplacements(hunk.chunks, fileLines);

  // Apply in reverse order to preserve indices
  replacements.sort((a, b) => b.start - a.start);
  for (const rep of replacements) {
    fileLines.splice(rep.start, rep.end - rep.start, ...rep.newLines);
  }

  return fileLines.join("\n") + "\n";
}
```

**Step 14: Run apply tests**

Run: `pnpm vitest run tests/unit/tools/patch/apply.test.ts`
Expected: PASS

**Step 15: Commit Phase C**

```bash
git add src/tools/patch/apply.ts tests/unit/tools/patch/apply.test.ts
git commit -m "feat: add applyHunk with replacement computation"
```

---

## Phase D: The Tool

**Step 16: Write the failing tool tests**

Create `tests/unit/tools/apply-patch.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApplyPatchTool } from "@/tools/apply-patch.js";
import type { Tool, ToolContext } from "@/types.js";

describe("apply_patch tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-patch-"));
    tool = createApplyPatchTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("apply_patch");
    expect(tool.capabilities).toContain("WriteFiles");
  });

  it("adds a new file", async () => {
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Add File: new.txt
+hello world
*** End Patch`,
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    const content = await fs.readFile(path.join(tempDir, "new.txt"), "utf-8");
    expect(content).toContain("hello world");
  });

  it("updates an existing file", async () => {
    await fs.writeFile(path.join(tempDir, "app.txt"), "old\ncontent\n");
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Update File: app.txt
@@ @@
-old
+new
*** End Patch`,
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    const content = await fs.readFile(path.join(tempDir, "app.txt"), "utf-8");
    expect(content).toContain("new");
    expect(content).not.toContain("old");
  });

  it("deletes a file", async () => {
    await fs.writeFile(path.join(tempDir, "gone.txt"), "bye");
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Delete File: gone.txt
*** End Patch`,
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    await expect(fs.access(path.join(tempDir, "gone.txt"))).rejects.toThrow();
  });

  it("moves a file", async () => {
    await fs.writeFile(path.join(tempDir, "old.ts"), "content");
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Update File: old.ts
*** Move to: new.ts
@@ @@
-content
+content-updated
*** End Patch`,
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    await expect(fs.access(path.join(tempDir, "old.ts"))).rejects.toThrow();
    const content = await fs.readFile(path.join(tempDir, "new.ts"), "utf-8");
    expect(content).toContain("content-updated");
  });

  it("returns summary with A/D/M counts", async () => {
    await fs.writeFile(path.join(tempDir, "edit.txt"), "old");
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Add File: added.txt
+new
*** Update File: edit.txt
@@ @@
-old
+new
*** End Patch`,
      },
      ctx,
    );
    expect(result.title).toMatch(/A.*1.*M.*1/);
  });

  it("returns error for empty patch", async () => {
    const result = await tool.execute({ patchText: "" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("empty");
  });

  it("creates parent directories for new files", async () => {
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Add File: sub/dir/deep.txt
+deep content
*** End Patch`,
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    const content = await fs.readFile(
      path.join(tempDir, "sub", "dir", "deep.txt"),
      "utf-8",
    );
    expect(content).toContain("deep content");
  });

  it("handles multi-file patch atomically", async () => {
    await fs.writeFile(path.join(tempDir, "a.txt"), "a-old");
    const result = await tool.execute(
      {
        patchText: `*** Begin Patch
*** Add File: b.txt
+b-new
*** Update File: a.txt
@@ @@
-a-old
+a-new
*** End Patch`,
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    expect(await fs.readFile(path.join(tempDir, "b.txt"), "utf-8")).toContain("b-new");
    expect(await fs.readFile(path.join(tempDir, "a.txt"), "utf-8")).toContain("a-new");
  });
});
```

**Step 17: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/apply-patch.test.ts`
Expected: FAIL — module not found

**Step 18: Implement createApplyPatchTool**

Create `src/tools/apply-patch.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { parsePatch } from "./patch/parser.js";
import { applyHunk } from "./patch/apply.js";
import type { Hunk } from "./patch/types.js";

export function createApplyPatchTool(): Tool {
  return {
    name: "apply_patch",
      description:
      "Apply a unified diff patch to add, update, delete, or move files. Supports multi-file atomic patches.",
    inputSchema: {
      type: "object",
      properties: {
        patchText: {
          type: "string",
          description: "The full patch text with *** Begin Patch / *** End Patch markers",
        },
      },
      required: ["patchText"],
    },
    capabilities: ["WriteFiles"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { patchText } = input as { patchText: string };

      let hunks: Hunk[];
      try {
        hunks = parsePatch(patchText);
      } catch (err) {
        return {
          toolCallId: "",
          content: `Patch parse error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }

      const summary = { added: 0, deleted: 0, modified: 0 };
      const details: string[] = [];

      for (const hunk of hunks) {
        const filePath = path.resolve(ctx.workingDirectory, hunk.path);

        try {
          switch (hunk.type) {
            case "add": {
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, hunk.lines.join("\n") + "\n", "utf-8");
              summary.added++;
              details.push(`A ${hunk.path}`);
              break;
            }
            case "delete": {
              await fs.unlink(filePath);
              summary.deleted++;
              details.push(`D ${hunk.path}`);
              break;
            }
            case "update": {
              const original = await fs.readFile(filePath, "utf-8");
              const updated = applyHunk(hunk, original);
              await fs.writeFile(filePath, updated, "utf-8");

              if (hunk.moveTo) {
                const newPath = path.resolve(ctx.workingDirectory, hunk.moveTo);
                await fs.mkdir(path.dirname(newPath), { recursive: true });
                await fs.rename(filePath, newPath);
              }

              summary.modified++;
              details.push(`M ${hunk.path}${hunk.moveTo ? ` → ${hunk.moveTo}` : ""}`);
              break;
            }
          }
        } catch (err) {
          return {
            toolCallId: "",
            content: `Error applying patch to ${hunk.path}: ${err instanceof Error ? err.message : String(err)}`,
            isError: true,
          };
        }
      }

      const titleParts: string[] = [];
      if (summary.added) titleParts.push(`A:${summary.added}`);
      if (summary.deleted) titleParts.push(`D:${summary.deleted}`);
      if (summary.modified) titleParts.push(`M:${summary.modified}`);

      return {
        toolCallId: "",
        content: details.join("\n"),
        isError: false,
        title: titleParts.join(" "),
        metadata: { summary, files: details },
      };
    },
  };
}
```

**Step 19: Run tool tests**

Run: `pnpm vitest run tests/unit/tools/apply-patch.test.ts`
Expected: PASS

**Step 20: Commit Phase D**

```bash
git add src/tools/apply-patch.ts tests/unit/tools/apply-patch.test.ts
git commit -m "feat: add apply_patch tool with atomic multi-file support"
```
