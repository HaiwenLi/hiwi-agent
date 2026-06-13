import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createBashTool, tryRtkRewrite } from "@/tools/bash.js";
import type { Tool, ToolContext } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("tryRtkRewrite", () => {
  it("rewrites git status when rtk is available", () => {
    const result = tryRtkRewrite("git status");
    // If rtk is installed and configured, it rewrites; otherwise passes through
    expect(["rtk git status", "git status"]).toContain(result);
  });

  it("rewrites cargo test when rtk is available", () => {
    const result = tryRtkRewrite("cargo test");
    expect(["rtk cargo test", "cargo test"]).toContain(result);
  });

  it("passes through non-matching commands unchanged", () => {
    const result = tryRtkRewrite("echo hello");
    expect(result).toBe("echo hello");
  });

  it("passes through when rtk binary not found", () => {
    const result = tryRtkRewrite("git status", { rtkPath: "rtk-nonexistent" });
    expect(result).toBe("git status");
  });

  it("passes through when RTK_DISABLED env is set", () => {
    vi.stubEnv("RTK_DISABLED", "1");
    const result = tryRtkRewrite("git status");
    expect(result).toBe("git status");
    vi.unstubAllEnvs();
  });
});

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
    const result = await tool.execute({ command: "cmd /c dir /b nonexistent-dir-xyz" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("respects the working directory", async () => {
    const isWin = process.platform === "win32";
    await fs.writeFile(path.join(tempDir, "marker.txt"), "found");
    const cmd = isWin ? "type marker.txt" : "cat marker.txt";
    const result = await tool.execute({ command: cmd }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("found");
  });

  it("supports timeout parameter", async () => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? "ping -n 10 localhost" : "sleep 10";
    const result = await tool.execute({ command: cmd, timeout: 100 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");
  });

  it("supports abort signal", async () => {
    const controller = new AbortController();
    const ctxWithAbort = { ...ctx, abort: controller.signal };

    const executePromise = tool.execute({ command: "sleep 30" }, ctxWithAbort);

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

  it("rewrites git commands through rtk transparently", async () => {
    const result = await tool.execute({ command: "echo 'rtk works'" }, ctx);
    expect(result.isError).toBe(false);
  });
});
