import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "@/core/prompt/assembler.js";

describe("assembleSystemPrompt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-prompt-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("assembles prompt with base and environment only", async () => {
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("hiwi-agent");
    expect(result).toContain(tempDir);
  });

  it("includes .hiwi-rules content when file exists", async () => {
    await fs.writeFile(
      path.join(tempDir, ".hiwi-rules"),
      "Always use TypeScript strict mode",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("TypeScript strict mode");
  });

  it("includes MEMORY.md content when file exists", async () => {
    await fs.writeFile(
      path.join(tempDir, "MEMORY.md"),
      "# Project Memory\nImportant context here",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("Important context here");
  });

  it("skips missing optional layers", async () => {
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).not.toContain("undefined");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(50);
  });

  it("selects correct prompt by model ID", async () => {
    const claudeResult = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    const gptResult = await assembleSystemPrompt({
      modelId: "gpt-4o",
      workingDirectory: tempDir,
    });
    expect(claudeResult.length).toBeGreaterThan(0);
    expect(gptResult.length).toBeGreaterThan(0);
  });

  it("orders layers correctly: base -> env -> rules -> memory", async () => {
    await fs.writeFile(
      path.join(tempDir, ".hiwi-rules"),
      "RULES_CONTENT",
    );
    await fs.writeFile(
      path.join(tempDir, "MEMORY.md"),
      "MEMORY_CONTENT",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    const rulesIdx = result.indexOf("RULES_CONTENT");
    const memoryIdx = result.indexOf("MEMORY_CONTENT");
    const envIdx = result.indexOf("Working directory");
    expect(envIdx).toBeLessThan(rulesIdx);
    expect(rulesIdx).toBeLessThan(memoryIdx);
  });

  it("uses providerVariant override when set", async () => {
    const result = await assembleSystemPrompt({
      modelId: "deepseek-v4-flash",
      workingDirectory: tempDir,
      providerVariant: "anthropic",
    });
    expect(result.length).toBeGreaterThan(100);
  });

  it("ignores providerVariant: auto and falls back to model ID", async () => {
    const resultAuto = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
      providerVariant: "auto",
    });
    const resultNone = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(resultAuto).toBe(resultNone);
  });
});
