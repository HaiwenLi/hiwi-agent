import { parsePatch } from "@/tools/patch/parser.js";
import { describe, expect, it } from "vitest";

describe("parsePatch", () => {
  it("parses an Add File hunk", () => {
    const patch = `*** Begin Patch
*** Add File: hello.txt
Hello, World!
Second line
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({
      type: "add",
      path: "hello.txt",
      lines: ["Hello, World!", "Second line"],
    });
  });

  it("parses a Delete File hunk", () => {
    const patch = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({
      type: "delete",
      path: "old.txt",
    });
  });

  it("parses an Update File hunk with context and replacements", () => {
    const patch = `*** Begin Patch
*** Update File: src/main.ts
@@ line 1 @@
-existing line
+new line
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].type).toBe("update");
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.path).toBe("src/main.ts");
    expect(update.chunks).toHaveLength(1);
    expect(update.chunks[0]).toEqual({
      context: ["line 1"],
      oldLines: ["existing line"],
      newLines: ["new line"],
    });
  });

  it("parses an Update File hunk with moveTo", () => {
    const patch = `*** Begin Patch
*** Update File: src/old.ts
*** Move to: src/new.ts
@@ @@
-old content
+new content
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.type).toBe("update");
    expect(update.moveTo).toBe("src/new.ts");
    expect(update.chunks).toHaveLength(1);
  });

  it("handles CRLF line endings by normalizing to LF", () => {
    const patch = "*** Begin Patch\r\n*** Add File: test.txt\r\nHello\r\n*** End Patch\r\n";
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toEqual({
      type: "add",
      path: "test.txt",
      lines: ["Hello"],
    });
  });

  it("parses multiple hunks in a single patch", () => {
    const patch = `*** Begin Patch
*** Add File: a.txt
content a
*** Delete File: b.txt
*** Update File: c.txt
@@ @@
-old
+new
*** End Patch`;
    const hunks = parsePatch(patch);
    expect(hunks).toHaveLength(3);
    expect(hunks[0].type).toBe("add");
    expect(hunks[1].type).toBe("delete");
    expect(hunks[2].type).toBe("update");
  });

  it("parses context with multiple lines in @@ block", () => {
    const patch = `*** Begin Patch
*** Update File: foo.ts
@@ line 1
line 2
line 3 @@
-old
+new
*** End Patch`;
    const hunks = parsePatch(patch);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.chunks[0].context).toEqual(["line 1", "line 2", "line 3"]);
  });

  it("parses pure insertion (no old lines)", () => {
    const patch = `*** Begin Patch
*** Update File: foo.ts
@@ context @@
+inserted line 1
+inserted line 2
*** End Patch`;
    const hunks = parsePatch(patch);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.chunks[0].oldLines).toEqual([]);
    expect(update.chunks[0].newLines).toEqual(["inserted line 1", "inserted line 2"]);
  });

  it("parses pure deletion (no new lines)", () => {
    const patch = `*** Begin Patch
*** Update File: foo.ts
@@ context @@
-removed line
*** End Patch`;
    const hunks = parsePatch(patch);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.chunks[0].oldLines).toEqual(["removed line"]);
    expect(update.chunks[0].newLines).toEqual([]);
  });

  it("throws on empty patch text", () => {
    expect(() => parsePatch("")).toThrow();
  });

  it("throws when no Begin Patch marker", () => {
    expect(() => parsePatch("some random text")).toThrow();
  });

  it("throws when patch has no hunks", () => {
    expect(() => parsePatch("*** Begin Patch\n*** End Patch")).toThrow();
  });

  it("handles empty context in @@ @@", () => {
    const patch = `*** Begin Patch
*** Update File: foo.ts
@@ @@
-old
+new
*** End Patch`;
    const hunks = parsePatch(patch);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.chunks[0].context).toEqual([]);
  });

  it("handles multiple chunks in one update hunk", () => {
    const patch = `*** Begin Patch
*** Update File: foo.ts
@@ ctx1 @@
-old1
+new1
@@ ctx2 @@
-old2
+new2
*** End Patch`;
    const hunks = parsePatch(patch);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.chunks).toHaveLength(2);
    expect(update.chunks[0].context).toEqual(["ctx1"]);
    expect(update.chunks[1].context).toEqual(["ctx2"]);
  });

  it("handles context lines (space-prefixed) between old and new", () => {
    const patch = `*** Begin Patch
*** Update File: foo.ts
@@ context @@
-old line
 context line
+new line
*** End Patch`;
    const hunks = parsePatch(patch);
    const update = hunks[0] as import("@/tools/patch/types.js").UpdateFileHunk;
    expect(update.chunks[0].oldLines).toEqual(["old line", " context line"]);
    expect(update.chunks[0].newLines).toEqual([" context line", "new line"]);
  });
});
