import {
  ANTHROPIC_PROMPT,
  DEFAULT_PROMPT,
  GPT_PROMPT,
  selectBasePrompt,
} from "@/core/prompt/prompts.js";
import { describe, expect, it } from "vitest";

describe("provider prompts", () => {
  it("anthropic prompt contains coding instructions", () => {
    expect(ANTHROPIC_PROMPT.length).toBeGreaterThan(100);
    expect(ANTHROPIC_PROMPT).toContain("tool");
  });

  it("gpt prompt contains coding instructions", () => {
    expect(GPT_PROMPT.length).toBeGreaterThan(100);
    expect(GPT_PROMPT).toContain("tool");
  });

  it("default prompt contains coding instructions", () => {
    expect(DEFAULT_PROMPT.length).toBeGreaterThan(100);
    expect(DEFAULT_PROMPT).toContain("tool");
  });
});

describe("selectBasePrompt", () => {
  it("selects anthropic prompt for claude models", () => {
    expect(selectBasePrompt("claude-sonnet-4-6")).toBe(ANTHROPIC_PROMPT);
    expect(selectBasePrompt("claude-opus-4-7")).toBe(ANTHROPIC_PROMPT);
  });

  it("selects gpt prompt for openai models", () => {
    expect(selectBasePrompt("gpt-4o")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("o3-mini")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("o1-pro")).toBe(GPT_PROMPT);
  });

  it("selects default prompt for unknown models", () => {
    expect(selectBasePrompt("deepseek-v4-flash")).toBe(DEFAULT_PROMPT);
    expect(selectBasePrompt("glm-4-plus")).toBe(DEFAULT_PROMPT);
    expect(selectBasePrompt("llama-3")).toBe(DEFAULT_PROMPT);
  });

  it("selects correct prompt by variant name (for config override)", () => {
    expect(selectBasePrompt("anthropic")).toBe(ANTHROPIC_PROMPT);
    expect(selectBasePrompt("gpt")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("default")).toBe(DEFAULT_PROMPT);
  });
});
