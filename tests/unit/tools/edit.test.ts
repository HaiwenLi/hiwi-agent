import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEditTool } from "@/tools/edit-tool.js";
import type { Tool, ToolContext } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
    const result = await tool.execute({ path: filePath, oldString: "foo", newString: "qux" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("times");
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
