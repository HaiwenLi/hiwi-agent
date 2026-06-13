/**
 * patch-apply-business.test.ts — Patch application system edge-case tests (~12 tests).
 *
 * Tests parsePatch, applyHunk, and createApplyPatchTool with real temp files,
 * covering special characters, CRLF, long lines, whitespace strategies, multi-hunk,
 * error paths, and move operations.
 */
import { applyHunk } from "@/tools/patch/apply.js";
import { parsePatch } from "@/tools/patch/parser.js";
import { createApplyPatchTool } from "@/tools/apply-patch.js";
import type { Hunk } from "@/tools/patch/types.js";
import type { ToolContext } from "@/types.js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("patch apply business", () => {
  let tempDir: string;
  let ctx: ToolContext;
  let patchTool: ReturnType<typeof createApplyPatchTool>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-patch-"));
    ctx = { workingDirectory: tempDir, sessionId: "test" };
    patchTool = createApplyPatchTool();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeFile(name: string, content: string) {
    const filePath = path.join(tempDir, name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }

  async function readFile(name: string): Promise<string> {
    return fs.readFile(path.join(tempDir, name), "utf-8");
  }

  async function fileExists(name: string): Promise<boolean> {
    try {
      await fs.access(path.join(tempDir, name));
      return true;
    } catch {
      return false;
    }
  }

  async function applyPatch(patchText: string) {
    return patchTool.execute({ patch: patchText }, ctx);
  }

  // ─── 1. Special characters in context lines ─────────────────────

  it("special characters in context lines", async () => {
    await writeFile("special.txt", "header\nprice: $10.00 [sale]\nfooter\n");

    const patch = `*** Begin Patch
*** Update File: special.txt
@@ price: $10.00 [sale] @@
-footer
+modified footer
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    const content = await readFile("special.txt");
    expect(content).toBe("header\nprice: $10.00 [sale]\nmodified footer\n");
  });

  // ─── 2. CRLF line endings ──────────────────────────────────────

  it("CRLF line endings normalized by parser and handled by applyHunk", async () => {
    // File on disk has CRLF line endings
    await writeFile("crlf.txt", "line1\r\nline2\r\nline3\r\n");

    // Patch text itself has CRLF — parser normalizes to LF
    const patch = "*** Begin Patch\r\n*** Update File: crlf.txt\r\n@@ line1 @@\r\n-line2\r\n+replaced\r\n*** End Patch\r\n";

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    // The file was written with CRLF, read back — \r chars on line ends.
    // applyHunk splits by \n so lines end with \r.
    // seekSequence strategy 3 (full trim) should match "line2\r" against "line2".
    const content = await readFile("crlf.txt");
    expect(content).toContain("line1");
    expect(content).toContain("replaced");
    expect(content).toContain("line3");
    expect(content).not.toContain("line2");
  });

  // ─── 3. Empty file patch (add) ─────────────────────────────────

  it("empty file patch (add) creates file with content", async () => {
    const patch = `*** Begin Patch
*** Add File: fresh.txt
hello world
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 added");

    const content = await readFile("fresh.txt");
    expect(content).toBe("hello world\n");
  });

  // ─── 4. Multiple non-adjacent hunks ────────────────────────────

  it("multiple non-adjacent hunks applied correctly", async () => {
    // 20-line file: "line01" through "line20"
    const lines = Array.from({ length: 20 }, (_, i) => `line${String(i + 1).padStart(2, "0")}`);
    await writeFile("multi.txt", lines.join("\n") + "\n");

    const patch = `*** Begin Patch
*** Update File: multi.txt
@@ line03 @@
-line04
+MODIFIED_04
@@ line15 @@
-line16
+MODIFIED_16
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    const content = await readFile("multi.txt");
    const updatedLines = content.split("\n");
    // line04 → MODIFIED_04 (index 3)
    expect(updatedLines[3]).toBe("MODIFIED_04");
    // line16 → MODIFIED_16 (index 15)
    expect(updatedLines[15]).toBe("MODIFIED_16");
    // Unchanged lines remain intact
    expect(updatedLines[0]).toBe("line01");
    expect(updatedLines[9]).toBe("line10");
    expect(updatedLines[19]).toBe("line20");
  });

  // ─── 5. Context mismatch → graceful error ──────────────────────

  it("context mismatch throws graceful error", () => {
    const content = "aaa\nbbb\nccc\n";

    const hunk: Hunk = {
      type: "update",
      path: "missing.txt",
      chunks: [
        {
          context: ["xxx"],  // not in file
          oldLines: ["bbb"],
          newLines: ["zzz"],
        },
      ],
    };

    expect(() => applyHunk(hunk, content)).toThrow("Could not find context");
  });

  // ─── 6. Create file in nested directory ─────────────────────────

  it("create file in deeply nested directory", async () => {
    const patch = `*** Begin Patch
*** Add File: a/b/c/deep.txt
deep content here
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    const exists = await fileExists("a/b/c/deep.txt");
    expect(exists).toBe(true);

    const content = await readFile("a/b/c/deep.txt");
    expect(content).toBe("deep content here\n");
  });

  // ─── 7. Multi-file patch (add + update + delete) ───────────────

  it("multi-file patch (add + update + delete) completes all operations", async () => {
    await writeFile("update-me.txt", "header\nold body\nfooter\n");
    await writeFile("remove-me.txt", "goodbye\n");

    const patch = `*** Begin Patch
*** Add File: brand-new.txt
freshly added
*** Update File: update-me.txt
@@ header @@
-old body
+new body
*** Delete File: remove-me.txt
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 added");
    expect(result.content).toContain("1 modified");
    expect(result.content).toContain("1 deleted");

    // Verify added file
    const added = await readFile("brand-new.txt");
    expect(added).toBe("freshly added\n");

    // Verify updated file
    const updated = await readFile("update-me.txt");
    expect(updated).toBe("header\nnew body\nfooter\n");

    // Verify deleted file is gone
    const exists = await fileExists("remove-me.txt");
    expect(exists).toBe(false);
  });

  // ─── 8. Long lines (10K+) ──────────────────────────────────────

  it("long lines (10K+) handled correctly", async () => {
    const longLine = "x".repeat(10000);
    await writeFile("long.txt", `before\n${longLine}\nafter\n`);

    const patch = `*** Begin Patch
*** Update File: long.txt
@@ before @@
-${longLine}
+replaced
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    const content = await readFile("long.txt");
    expect(content).toBe("before\nreplaced\nafter\n");
  });

  // ─── 9. Whitespace differences handled by seekSequence ──────────

  it("whitespace differences handled by seekSequence trailing trim", async () => {
    // File has trailing spaces; patch context does not
    await writeFile("whitespace.txt", "header  \ncontent  \nfooter  \n");

    const patch = `*** Begin Patch
*** Update File: whitespace.txt
@@ header @@
-content
+replaced content
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    const content = await readFile("whitespace.txt");
    // Old line "content  " matched via strategy 2 (trim trailing), replaced
    expect(content).toContain("replaced content");
    // Context line "header  " matched via strategy 2 as well
    expect(content).toContain("header");
  });

  // ─── 10. Empty patch → error ───────────────────────────────────

  it("empty patch text throws error", () => {
    expect(() => parsePatch("")).toThrow("Empty patch text");
  });

  it("patch with no hunks throws error", () => {
    expect(() => parsePatch("*** Begin Patch\n*** End Patch")).toThrow("Patch contains no hunks");
  });

  // ─── 11. Update with moveTo renames file ───────────────────────

  it("update with moveTo renames file and applies changes", async () => {
    await writeFile("old.txt", "line1\noriginal\nline3\n");

    const patch = `*** Begin Patch
*** Update File: old.txt
*** Move to: new.txt
@@ line1 @@
-original
+updated
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);

    // Old file should be gone
    expect(await fileExists("old.txt")).toBe(false);

    // New file should have updated content
    const content = await readFile("new.txt");
    expect(content).toBe("line1\nupdated\nline3\n");
  });

  // ─── 12. Delete file removes it ────────────────────────────────

  it("delete file removes it from disk", async () => {
    await writeFile("doomed.txt", "soon gone\n");
    expect(await fileExists("doomed.txt")).toBe(true);

    const patch = `*** Begin Patch
*** Delete File: doomed.txt
*** End Patch`;

    const result = await applyPatch(patch);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 deleted");

    expect(await fileExists("doomed.txt")).toBe(false);
  });
});
