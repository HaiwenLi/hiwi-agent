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
