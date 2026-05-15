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
