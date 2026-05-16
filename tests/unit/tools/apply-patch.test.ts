import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApplyPatchTool } from "@/tools/apply-patch.js";
import type { ToolContext } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function makeContext(workDir: string): ToolContext {
  return {
    workingDirectory: workDir,
    sessionId: "test-session",
  };
}

describe("apply_patch tool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-patch-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("has correct name and capabilities", () => {
    const tool = createApplyPatchTool();
    expect(tool.name).toBe("apply_patch");
    expect(tool.capabilities).toContain("WriteFiles");
  });

  it("adds a new file", async () => {
    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Add File: hello.txt
Hello, World!
Second line
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 added");

    const content = await fs.readFile(path.join(tmpDir, "hello.txt"), "utf-8");
    expect(content).toBe("Hello, World!\nSecond line\n");
  });

  it("updates an existing file", async () => {
    await fs.writeFile(path.join(tmpDir, "test.txt"), "line 1\nold line\nline 3\n", "utf-8");

    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Update File: test.txt
@@ line 1 @@
-old line
+new line
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 modified");

    const content = await fs.readFile(path.join(tmpDir, "test.txt"), "utf-8");
    expect(content).toBe("line 1\nnew line\nline 3\n");
  });

  it("deletes a file", async () => {
    await fs.writeFile(path.join(tmpDir, "delete-me.txt"), "content\n", "utf-8");

    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Delete File: delete-me.txt
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 deleted");

    await expect(fs.access(path.join(tmpDir, "delete-me.txt"))).rejects.toThrow();
  });

  it("moves a file", async () => {
    await fs.writeFile(
      path.join(tmpDir, "original.txt"),
      "line 1\nsome content\nline 3\n",
      "utf-8",
    );

    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Update File: original.txt
*** Move to: moved.txt
@@ line 1 @@
-some content
+new content
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);

    // Original should be gone
    await expect(fs.access(path.join(tmpDir, "original.txt"))).rejects.toThrow();

    // Moved file should exist with new content
    const content = await fs.readFile(path.join(tmpDir, "moved.txt"), "utf-8");
    expect(content).toBe("line 1\nnew content\nline 3\n");
  });

  it("creates parent directories for new files", async () => {
    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Add File: deeply/nested/dir/file.txt
nested content
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);

    const content = await fs.readFile(
      path.join(tmpDir, "deeply", "nested", "dir", "file.txt"),
      "utf-8",
    );
    expect(content).toBe("nested content\n");
  });

  it("handles atomic multi-file patch", async () => {
    await fs.writeFile(path.join(tmpDir, "existing.txt"), "header\nold content\nfooter\n", "utf-8");
    await fs.writeFile(path.join(tmpDir, "to-delete.txt"), "bye\n", "utf-8");

    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Add File: added.txt
added content
*** Update File: existing.txt
@@ header @@
-old content
+new content
*** Delete File: to-delete.txt
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);
    expect(result.content).toContain("1 added");
    expect(result.content).toContain("1 modified");
    expect(result.content).toContain("1 deleted");

    // Verify all operations
    const added = await fs.readFile(path.join(tmpDir, "added.txt"), "utf-8");
    expect(added).toBe("added content\n");

    const updated = await fs.readFile(path.join(tmpDir, "existing.txt"), "utf-8");
    expect(updated).toBe("header\nnew content\nfooter\n");

    await expect(fs.access(path.join(tmpDir, "to-delete.txt"))).rejects.toThrow();
  });

  it("returns error for missing patch parameter", async () => {
    const tool = createApplyPatchTool();
    const result = await tool.execute({}, makeContext(tmpDir));
    expect(result.isError).toBe(true);
    expect(result.content).toContain("patch");
  });

  it("returns error for invalid patch syntax", async () => {
    const tool = createApplyPatchTool();
    const result = await tool.execute({ patch: "not a valid patch" }, makeContext(tmpDir));
    expect(result.isError).toBe(true);
  });

  it("handles relative paths resolved against working directory", async () => {
    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Add File: relative.txt
relative content
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);

    const content = await fs.readFile(path.join(tmpDir, "relative.txt"), "utf-8");
    expect(content).toBe("relative content\n");
  });

  it("moves file without changing content", async () => {
    await fs.writeFile(path.join(tmpDir, "source.txt"), "unchanged\n", "utf-8");

    const tool = createApplyPatchTool();
    const patch = `*** Begin Patch
*** Update File: source.txt
*** Move to: dest.txt
@@ unchanged @@
*** End Patch`;

    const result = await tool.execute({ patch }, makeContext(tmpDir));
    expect(result.isError).toBe(false);

    await expect(fs.access(path.join(tmpDir, "source.txt"))).rejects.toThrow();
    const content = await fs.readFile(path.join(tmpDir, "dest.txt"), "utf-8");
    expect(content).toBe("unchanged\n");
  });
});
