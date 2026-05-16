import { applyHunk } from "@/tools/patch/apply.js";
import type { AddFileHunk, DeleteFileHunk, UpdateFileHunk } from "@/tools/patch/types.js";
import { describe, expect, it } from "vitest";

describe("applyHunk", () => {
  it("returns joined lines for add hunk", () => {
    const hunk: AddFileHunk = {
      type: "add",
      path: "hello.txt",
      lines: ["Hello, World!", "Second line"],
    };
    const result = applyHunk(hunk, "");
    expect(result).toBe("Hello, World!\nSecond line\n");
  });

  it("returns single line with newline for single-line add", () => {
    const hunk: AddFileHunk = {
      type: "add",
      path: "a.txt",
      lines: ["only line"],
    };
    expect(applyHunk(hunk, "")).toBe("only line\n");
  });

  it("returns empty string for delete hunk", () => {
    const hunk: DeleteFileHunk = {
      type: "delete",
      path: "old.txt",
    };
    expect(applyHunk(hunk, "some content")).toBe("");
  });

  it("replaces old lines with new lines in update hunk", () => {
    const content = "line 1\nold line\nline 3\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: ["line 1"],
          oldLines: ["old line"],
          newLines: ["new line"],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("line 1\nnew line\nline 3\n");
  });

  it("handles pure insertion (no old lines)", () => {
    const content = "line 1\nline 2\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: ["line 1"],
          oldLines: [],
          newLines: ["inserted"],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("line 1\ninserted\nline 2\n");
  });

  it("handles pure deletion (no new lines)", () => {
    const content = "line 1\ntarget\nline 3\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: ["line 1"],
          oldLines: ["target"],
          newLines: [],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("line 1\nline 3\n");
  });

  it("handles multiple chunks applied in correct order", () => {
    const content = "aaa\nbbb\nccc\nddd\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: ["aaa"],
          oldLines: ["bbb"],
          newLines: ["BBB"],
        },
        {
          context: ["ccc"],
          oldLines: ["ddd"],
          newLines: ["DDD"],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("aaa\nBBB\nccc\nDDD\n");
  });

  it("handles update with context lines in oldLines", () => {
    const content = "aaa\nbbb\nccc\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: ["aaa"],
          oldLines: ["bbb", " ccc"],
          newLines: [" ccc", "BBB"],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("aaa\n ccc\nBBB\n");
  });

  it("throws when context line not found for update", () => {
    const content = "aaa\nbbb\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: ["nonexistent"],
          oldLines: ["bbb"],
          newLines: ["BBB"],
        },
      ],
    };
    expect(() => applyHunk(hunk, content)).toThrow();
  });

  it("handles insertion at beginning of file (empty context)", () => {
    const content = "existing\n";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: [],
          oldLines: [],
          newLines: ["new first line"],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("new first line\nexisting\n");
  });

  it("handles empty file with insertion", () => {
    const content = "";
    const hunk: UpdateFileHunk = {
      type: "update",
      path: "test.txt",
      chunks: [
        {
          context: [],
          oldLines: [],
          newLines: ["first line", "second line"],
        },
      ],
    };
    const result = applyHunk(hunk, content);
    expect(result).toBe("first line\nsecond line\n");
  });
});
