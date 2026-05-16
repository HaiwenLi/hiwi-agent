import { buildCatalog } from "@/adapters/model-catalog.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import { saveModelSelection } from "@/core/config.js";
import { describe, expect, it } from "vitest";

const TEST_CONFIG = {
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4-6",
  providers: {
    anthropic: { apiKey: "sk-test" },
    openai: { apiKey: "sk-test" },
  },
  agent: {
    maxLoops: 50,
    maxOutputTokensPerTurn: 4096,
    budgetTotal: 50,
    refundableTools: [],
    streaming: true,
    interruptible: true,
  },
};

describe("model picker integration", () => {
  it("catalog resolves model to correct provider", () => {
    const registry = new ProviderRegistry(TEST_CONFIG);

    registry.setModelWithProvider("claude-opus-4-7");
    expect(registry.getActiveProvider()).toBe("anthropic");

    registry.setModelWithProvider("MiniMax-M2.5");
    expect(registry.getActiveProvider()).toBe("minimax");
  });

  it("getAvailableModels returns entries with id field", () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const models = registry.getAvailableModels();
    expect(models.length).toBeGreaterThan(5);
    for (const model of models) {
      expect(model).toHaveProperty("id");
      expect(typeof model.id).toBe("string");
    }
  });

  it("catalog includes all known providers", () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const catalog = registry.getModelCatalog();

    expect(catalog.anthropic).toBeDefined();
    expect(catalog.minimax).toBeDefined();
    expect(catalog.zhipu).toBeDefined();
    expect(catalog.ollama).toBeDefined();
  });

  it("buildCatalog returns models from adapter maps", () => {
    const catalog = buildCatalog();

    // anthropic models
    const anthropicIds = catalog.anthropic.map((m) => m.id);
    expect(anthropicIds).toContain("claude-sonnet-4-6");
    expect(anthropicIds).toContain("claude-opus-4-7");
    expect(anthropicIds).toContain("claude-haiku-4-5");

    // minimax models
    const minimaxIds = catalog.minimax.map((m) => m.id);
    expect(minimaxIds).toContain("MiniMax-M2.7");
  });

  it("saveModelSelection writes and is loadable", async () => {
    const tmpDir = `${process.env.TMPDIR ?? "/tmp"}/agent-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fs = await import("node:fs/promises");

    try {
      await saveModelSelection(tmpDir, "anthropic", "claude-opus-4-7");

      const content = await fs.readFile(`${tmpDir}/.agent/config.json`, "utf-8");
      const data = JSON.parse(content);

      expect(data.activeProvider).toBe("anthropic");
      expect(data.activeModel).toBe("claude-opus-4-7");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
