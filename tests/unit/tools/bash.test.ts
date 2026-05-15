import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBashTool } from "@/tools/bash.js";
import type { Tool, ToolContext } from "@/types.js";

describe("bash tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-bash-"));
    tool = createBashTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("bash");
    expect(tool.capabilities).toContain("ExecCode");
  });

  it("executes a command and returns stdout", async () => {
    const result = await tool.execute({ command: "echo hello" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("hello");
  });

  it("captures stderr on failure", async () => {
    const result = await tool.execute(
      { command: "ls /nonexistent-dir-xyz" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("respects the working directory", async () => {
    await fs.writeFile(path.join(tempDir, "marker.txt"), "found");
    const result = await tool.execute({ command: "cat marker.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("found");
  });

  it("supports timeout parameter", async () => {
    const result = await tool.execute(
      { command: "sleep 10", timeout: 100 },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");
  });

  it("supports abort signal", async () => {
    const controller = new AbortController();
    const ctxWithAbort = { ...ctx, abort: controller.signal };

    const executePromise = tool.execute(
      { command: "sleep 30" },
      ctxWithAbort,
    );

    setTimeout(() => controller.abort(), 100);

    const result = await executePromise;
    expect(result.isError).toBe(true);
  });

  it("returns exit code in metadata", async () => {
    const result = await tool.execute({ command: "exit 42" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.metadata?.exitCode).toBe(42);
  });

  it("returns title with command preview", async () => {
    const result = await tool.execute({ command: "echo test" }, ctx);
    expect(result.title).toContain("echo test");
  });
});
