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
