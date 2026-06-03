import { describe, expect, it } from "vitest";
import { buildNormalizedUsage, enrichUsage } from "@/adapters/adapter-utils.js";

describe("buildNormalizedUsage", () => {
  it("handles Anthropic-style usage (input excludes cache)", () => {
    const result = buildNormalizedUsage("anthropic", {
      input_tokens: 5000,
      output_tokens: 1000,
      cache_read_input_tokens: 3000,
      cache_creation_input_tokens: 2000,
    });
    expect(result.inputTokens).toBe(5000);
    expect(result.outputTokens).toBe(1000);
    expect(result.cacheReadTokens).toBe(3000);
    expect(result.cacheWriteTokens).toBe(2000);
    expect(result.totalTokens).toBe(11000);
  });

  it("handles OpenAI-style usage (prompt includes cache, subtracts them)", () => {
    const result = buildNormalizedUsage("openai", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 6000 },
    });
    expect(result.inputTokens).toBe(4000); // 10000 - 6000
    expect(result.outputTokens).toBe(2000);
    expect(result.cacheReadTokens).toBe(6000);
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(12000);
  });

  it("handles DeepSeek-style usage (prompt includes cache, separate hit/miss fields)", () => {
    const result = buildNormalizedUsage("deepseek", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_cache_hit_tokens: 5000,
      prompt_cache_miss_tokens: 3000,
    });
    expect(result.inputTokens).toBe(2000); // 10000 - 5000 - 3000
    expect(result.outputTokens).toBe(2000);
    expect(result.cacheReadTokens).toBe(5000);
    expect(result.cacheWriteTokens).toBe(3000);
    expect(result.totalTokens).toBe(12000);
  });

  it("handles Kimi-style usage (prompt includes cache, cached_tokens field)", () => {
    const result = buildNormalizedUsage("kimi", {
      prompt_tokens: 8000,
      completion_tokens: 1500,
      cached_tokens: 4000,
    });
    expect(result.inputTokens).toBe(4000); // 8000 - 4000
    expect(result.outputTokens).toBe(1500);
    expect(result.cacheReadTokens).toBe(4000);
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(9500);
  });

  it("handles Zhipu-style usage (prompt includes cache, nested cached_tokens)", () => {
    const result = buildNormalizedUsage("zhipu", {
      prompt_tokens: 12000,
      completion_tokens: 3000,
      prompt_tokens_details: { cached_tokens: 7000 },
    });
    expect(result.inputTokens).toBe(5000); // 12000 - 7000
    expect(result.outputTokens).toBe(3000);
    expect(result.cacheReadTokens).toBe(7000);
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(15000);
  });

  it("handles MiniMax-style usage (prompt includes cache, hit/miss fields)", () => {
    const result = buildNormalizedUsage("minimax", {
      prompt_tokens: 9000,
      completion_tokens: 2000,
      prompt_cache_hit_tokens: 4000,
      prompt_cache_miss_tokens: 2000,
    });
    expect(result.inputTokens).toBe(3000); // 9000 - 4000 - 2000
    expect(result.outputTokens).toBe(2000);
    expect(result.cacheReadTokens).toBe(4000);
    expect(result.cacheWriteTokens).toBe(2000);
    expect(result.totalTokens).toBe(11000);
  });

  it("handles Ollama-style usage (no cache)", () => {
    const result = buildNormalizedUsage("ollama", {
      prompt_eval_count: 6000,
      eval_count: 1500,
    });
    expect(result.inputTokens).toBe(6000);
    expect(result.outputTokens).toBe(1500);
    expect(result.cacheReadTokens).toBeUndefined();
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(7500);
  });

  it("handles usage with no cache data gracefully", () => {
    const result = buildNormalizedUsage("openai", {
      prompt_tokens: 5000,
      completion_tokens: 1000,
    });
    expect(result.inputTokens).toBe(5000);
    expect(result.outputTokens).toBe(1000);
    expect(result.cacheReadTokens).toBeUndefined();
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(6000);
  });

  it("clamps inputTokens to >= 0 (prevents negative from cache subtraction)", () => {
    const result = buildNormalizedUsage("deepseek", {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_cache_hit_tokens: 200, // more than prompt
    });
    expect(result.inputTokens).toBe(0); // clamped
    expect(result.totalTokens).toBe(250);
  });
});

describe("enrichUsage", () => {
  it("adds contextPercent, modelName, provider, totalTokens", () => {
    const base = buildNormalizedUsage("openai", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 6000 },
    });
    const result = enrichUsage(base, 128000, "gpt-4o", "openai", "high");
    expect(result.contextWindow).toBe(128000);
    expect(result.contextPercent).toBeCloseTo(3.1, 1); // 4000/128000 * 100 → rounded to 1dp
    expect(result.modelName).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.thinkingEffort).toBe("high");
  });

  it("returns null contextPercent when contextWindow is 0", () => {
    const base = buildNormalizedUsage("ollama", {
      prompt_eval_count: 100,
      eval_count: 50,
    });
    const result = enrichUsage(base, 0, "qwen3.6", "ollama");
    expect(result.contextPercent).toBeNull();
  });
});
