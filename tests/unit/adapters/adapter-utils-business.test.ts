import {
  buildNormalizedUsage,
  createThinkContext,
  endsWithPartialTag,
  extractText,
  processThinkStream,
  stripThinkTags,
} from "@/adapters/adapter-utils.js";
import { describe, expect, it } from "vitest";
import type { ContentPart } from "@/types.js";

// ─── extractText ──────────────────────────────────────────────

describe("extractText", () => {
  it("returns string content as-is", () => {
    expect(extractText("hello world")).toBe("hello world");
  });

  it("joins text parts from ContentPart[]", () => {
    const parts: ContentPart[] = [
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ];
    expect(extractText(parts)).toBe("hello\nworld");
  });

  it("filters out image_url parts", () => {
    const parts: ContentPart[] = [
      { type: "text", text: "see image" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      { type: "text", text: "below" },
    ];
    expect(extractText(parts)).toBe("see image\nbelow");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });
});

// ─── buildNormalizedUsage ─────────────────────────────────────

describe("buildNormalizedUsage", () => {
  it("anthropic: basic tokens", () => {
    const usage = buildNormalizedUsage("anthropic", {
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.totalTokens).toBe(150);
    expect(usage.cacheReadTokens).toBeUndefined();
    expect(usage.cacheWriteTokens).toBeUndefined();
  });

  it("anthropic: with cache tokens", () => {
    const usage = buildNormalizedUsage("anthropic", {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 10,
    });
    expect(usage.inputTokens).toBe(100);
    expect(usage.cacheReadTokens).toBe(20);
    expect(usage.cacheWriteTokens).toBe(10);
    expect(usage.totalTokens).toBe(180);
  });

  it("anthropic: missing cache fields omitted", () => {
    const usage = buildNormalizedUsage("anthropic", {
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(usage.cacheReadTokens).toBeUndefined();
    expect(usage.cacheWriteTokens).toBeUndefined();
  });

  it("ollama: prompt_eval_count and eval_count", () => {
    const usage = buildNormalizedUsage("ollama", {
      prompt_eval_count: 200,
      eval_count: 80,
    });
    expect(usage.inputTokens).toBe(200);
    expect(usage.outputTokens).toBe(80);
    expect(usage.totalTokens).toBe(280);
  });

  it("ollama: missing fields default to 0", () => {
    const usage = buildNormalizedUsage("ollama", {});
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
  });

  it("openai: basic prompt/completion tokens", () => {
    const usage = buildNormalizedUsage("openai", {
      prompt_tokens: 300,
      completion_tokens: 100,
    });
    expect(usage.inputTokens).toBe(300);
    expect(usage.outputTokens).toBe(100);
    expect(usage.totalTokens).toBe(400);
  });

  it("openai: cached_tokens subtracted from input", () => {
    const usage = buildNormalizedUsage("openai", {
      prompt_tokens: 300,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 50 },
    });
    expect(usage.inputTokens).toBe(250);
    expect(usage.cacheReadTokens).toBe(50);
    expect(usage.totalTokens).toBe(400);
  });

  it("deepseek: prompt_cache_hit_tokens as cacheRead", () => {
    const usage = buildNormalizedUsage("deepseek", {
      prompt_tokens: 300,
      completion_tokens: 100,
      prompt_cache_hit_tokens: 40,
    });
    expect(usage.inputTokens).toBe(260);
    expect(usage.cacheReadTokens).toBe(40);
  });

  it("deepseek: prompt_cache_miss_tokens as cacheWrite", () => {
    const usage = buildNormalizedUsage("deepseek", {
      prompt_tokens: 300,
      completion_tokens: 100,
      prompt_cache_miss_tokens: 30,
    });
    expect(usage.cacheWriteTokens).toBe(30);
    expect(usage.inputTokens).toBe(270);
  });

  it("all formats: totalTokens sums inputTokens + outputTokens + cache", () => {
    const usage = buildNormalizedUsage("openai", {
      prompt_tokens: 200,
      completion_tokens: 50,
      prompt_tokens_details: { cached_tokens: 30 },
    });
    // inputTokens = 200 - 30 = 170; totalTokens = 170 + 50 + 30 = 250
    expect(usage.inputTokens).toBe(170);
    expect(usage.totalTokens).toBe(250);
  });
});

// ─── stripThinkTags ────────────────────────────────────────────

describe("stripThinkTags", () => {
  it("extracts single think block", () => {
    const { thinkContent, cleanContent } = stripThinkTags(
      "Let me think" + "<think" + ">this is reasoning</think" + ">Then the answer is 42",
    );
    expect(thinkContent).toContain("this is reasoning");
    expect(cleanContent).toContain("Let me think");
    expect(cleanContent).toContain("the answer is 42");
  });

  it("concatenates multiple think blocks", () => {
    const { thinkContent, cleanContent } = stripThinkTags(
      "A" + "<think" + ">first</think" + ">B" + "<think" + ">second</think" + ">C",
    );
    expect(thinkContent).toContain("first");
    expect(thinkContent).toContain("second");
    expect(cleanContent).toContain("A");
    expect(cleanContent).toContain("B");
    expect(cleanContent).toContain("C");
  });

  it("no think blocks: cleanContent equals original", () => {
    const original = "Just plain text, nothing else.";
    const { thinkContent, cleanContent } = stripThinkTags(original);
    expect(thinkContent).toBe("");
    expect(cleanContent).toBe(original);
  });
});

// ─── endsWithPartialTag ───────────────────────────────────────

describe("endsWithPartialTag", () => {
  it("returns true for partial suffix", () => {
    expect(endsWithPartialTag("some text<thi", "<think")).toBe(true);
  });

  it("returns false for no match", () => {
    expect(endsWithPartialTag("some text", "<think")).toBe(false);
  });

  it("returns true for single char partial", () => {
    expect(endsWithPartialTag("a<", "<think")).toBe(true);
  });
});

// ─── processThinkStream ───────────────────────────────────────

describe("processThinkStream", () => {
  it("no tags: all content yields as text-delta", () => {
    const ctx = createThinkContext();
    const results = [...processThinkStream("hello world", ctx)];
    expect(results).toEqual([{ type: "text-delta", text: "hello world" }]);
  });

  it("complete think pair yields reasoning then text", () => {
    const ctx = createThinkContext();
    const input = "before<think>reasoning here</think>after";
    const results = [...processThinkStream(input, ctx)];
    expect(results).toEqual([
      { type: "text-delta", text: "before" },
      { type: "reasoning-delta", text: "reasoning here" },
      { type: "text-delta", text: "after" },
    ]);
  });

  it("multiple think tag pairs", () => {
    const ctx = createThinkContext();
    const input = "A<think>R1</think>B<think>R2</think>C";
    const results = [...processThinkStream(input, ctx)];
    expect(results).toEqual([
      { type: "text-delta", text: "A" },
      { type: "reasoning-delta", text: "R1" },
      { type: "text-delta", text: "B" },
      { type: "reasoning-delta", text: "R2" },
      { type: "text-delta", text: "C" },
    ]);
  });

  it("partial open tag at buffer boundary is held", () => {
    const ctx = createThinkContext();
    // First chunk ends with partial tag
    const r1 = [...processThinkStream("hello<thi", ctx)];
    expect(r1).toEqual([]);
    // Second chunk completes the tag and provides content
    const r2 = [...processThinkStream("nk>reasoning</think>rest", ctx)];
    expect(r2).toEqual([
      { type: "text-delta", text: "hello" },
      { type: "reasoning-delta", text: "reasoning" },
      { type: "text-delta", text: "rest" },
    ]);
  });

  it("empty think block emits no reasoning", () => {
    const ctx = createThinkContext();
    const results = [...processThinkStream("before<think></think>after", ctx)];
    expect(results).toEqual([
      { type: "text-delta", text: "before" },
      { type: "text-delta", text: "after" },
    ]);
  });

  it("state persists across calls", () => {
    const ctx = createThinkContext();
    // Open think tag
    const r1 = [...processThinkStream('<think>part1', ctx)];
    expect(r1).toEqual([{ type: "reasoning-delta", text: "part1" }]);
    // Continue reasoning, then close
    const results = [...processThinkStream(" part2</think>done", ctx)];
    expect(results).toEqual([
      { type: "reasoning-delta", text: " part2" },
      { type: "text-delta", text: "done" },
    ]);
  });

  it("text before, think, text after", () => {
    const ctx = createThinkContext();
    const results = [...processThinkStream("hello<think>world</think>goodbye", ctx)];
    expect(results).toEqual([
      { type: "text-delta", text: "hello" },
      { type: "reasoning-delta", text: "world" },
      { type: "text-delta", text: "goodbye" },
    ]);
  });

  it("only think content, no text", () => {
    const ctx = createThinkContext();
    const results = [...processThinkStream("<think>just reasoning</think>", ctx)];
    expect(results).toEqual([{ type: "reasoning-delta", text: "just reasoning" }]);
  });
});
