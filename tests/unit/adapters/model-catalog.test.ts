import type { ModelEntry } from "@/types.js";
import { buildCatalog } from "@/adapters/model-catalog.js";
import { describe, expect, it } from "vitest";

describe("ModelEntry", () => {
  it("accepts a minimal model entry with id", () => {
    const entry: ModelEntry = { id: "gpt-4o" };
    expect(entry.id).toBe("gpt-4o");
  });

  it("accepts a full model entry with optional fields", () => {
    const entry: ModelEntry = {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      tier: "standard",
      tags: ["anthropic", "fast"],
    };
    expect(entry.label).toBe("Claude Sonnet 4.6");
    expect(entry.tier).toBe("standard");
    expect(entry.tags).toEqual(["anthropic", "fast"]);
  });
});

describe("buildCatalog", () => {
  it("returns providers with their models", () => {
    const catalog = buildCatalog();

    expect(catalog.deepseek).toBeDefined();
    expect(catalog.deepseek.some((m) => m.id === "deepseek-v4-pro")).toBe(true);

    expect(catalog.openai).toBeDefined();
    expect(catalog.openai.some((m) => m.id === "gpt-4o")).toBe(true);

    expect(catalog.anthropic).toBeDefined();
    expect(catalog.anthropic.some((m) => m.id === "claude-sonnet-4-6")).toBe(true);
    expect(catalog.anthropic.some((m) => m.id === "claude-opus-4-7")).toBe(true);

    expect(catalog.minimax).toBeDefined();
    expect(catalog.minimax.some((m) => m.id === "MiniMax-M2.7")).toBe(true);

    expect(catalog.zhipu).toBeDefined();
    expect(catalog.zhipu.some((m) => m.id === "glm-4.7")).toBe(true);

    expect(catalog.ollama).toBeDefined();
    expect(catalog.ollama.some((m) => m.id === "qwen3.6")).toBe(true);
  });

  it("merges config overrides into catalog (adds custom models)", () => {
    const catalog = buildCatalog({
      anthropic: { models: ["custom-model"] },
    });

    expect(catalog.anthropic.some((m) => m.id === "custom-model")).toBe(true);
  });

  it("uses config model list for unknown providers", () => {
    const catalog = buildCatalog({
      custom: { models: ["my-model-a", "my-model-b"] },
    });

    expect(catalog.custom).toHaveLength(2);
    expect(catalog.custom[0].id).toBe("my-model-a");
    expect(catalog.custom[1].id).toBe("my-model-b");
  });
});
