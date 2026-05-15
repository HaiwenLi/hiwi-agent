import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGlobTool } from "@/tools/glob.js";
import type { Tool, ToolContext } from "@/types.js";

describe("glob tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-glob-"));
    tool = createGlobTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("glob");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("finds files matching a glob pattern", async () => {
    await fs.writeFile(path.join(tempDir, "a.ts"), "a");
    await fs.writeFile(path.join(tempDir, "b.ts"), "b");
    await fs.writeFile(path.join(tempDir, "c.js"), "c");

    const result = await tool.execute({ pattern: "**/*.ts" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("a.ts");
    expect(result.content).toContain("b.ts");
    expect(result.content).not.toContain("c.js");
  });

  it("finds files in nested directories", async () => {
    const subDir = path.join(tempDir, "src", "components");
    await fs.mkdir(subDir, { recursive: true });
    await fs.writeFile(path.join(subDir, "App.tsx"), "app");
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "idx");

    const result = await tool.execute({ pattern: "**/*.tsx" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("App.tsx");
  });

  it("limits results to 100 files", async () => {
    for (let i = 0; i < 120; i++) {
      await fs.writeFile(path.join(tempDir, `file-${i}.txt`), `${i}`);
    }

    const result = await tool.execute({ pattern: "**/*.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.metadata?.truncated).toBe(true);
    expect(result.metadata?.totalShown).toBe(100);
  });

  it("scopes search to a specific path", async () => {
    const subA = path.join(tempDir, "a");
    const subB = path.join(tempDir, "b");
    await fs.mkdir(subA, { recursive: true });
    await fs.mkdir(subB, { recursive: true });
    await fs.writeFile(path.join(subA, "x.txt"), "x");
    await fs.writeFile(path.join(subB, "y.txt"), "y");

    const result = await tool.execute({ pattern: "*.txt", path: "a" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("x.txt");
    expect(result.content).not.toContain("y.txt");
  });

  it("returns empty result for no matches", async () => {
    const result = await tool.execute({ pattern: "*.xyz" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("0 files");
  });
});
