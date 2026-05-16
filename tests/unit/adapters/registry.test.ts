import { MockAdapter } from "@/adapters/mock.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import type { AgentConfig } from "@/types.js";
import { beforeEach, describe, expect, it } from "vitest";

const TEST_CONFIG: AgentConfig = {
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4-6",
  providers: {
    anthropic: { apiKey: "sk-test" },
    openai: { apiKey: "sk-openai" },
    ollama: { baseUrl: "http://localhost:11434" },
  },
  agent: {
    maxLoops: 50,
    maxOutputTokensPerTurn: 4096,
    budgetTotal: 50,
    refundableTools: ["read_file"],
    streaming: true,
    interruptible: true,
  },
};

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry(TEST_CONFIG);
  });

  it("registers a custom adapter", () => {
    const mock = new MockAdapter([], { id: "test-model", provider: "test" });
    registry.registerAdapter("test", mock);
    registry.setProvider("test");
    expect(registry.getActiveAdapter()).toBe(mock);
  });

  it("switches active provider with setProvider", () => {
    const mock1 = new MockAdapter([], { provider: "anthropic" });
    const mock2 = new MockAdapter([], { provider: "openai" });
    registry.registerAdapter("anthropic", mock1);
    registry.registerAdapter("openai", mock2);

    registry.setProvider("openai");
    expect(registry.getActiveAdapter().provider).toBe("openai");
  });

  it("switches active model with setModel", () => {
    const mock = new MockAdapter([], { id: "model-a", provider: "anthropic" });
    registry.registerAdapter("anthropic", mock);

    registry.setModel("model-b");
    expect(registry.getActiveModel()).toBe("model-b");
  });

  it("lists registered models", () => {
    const mock = new MockAdapter([], { id: "test-model", provider: "test" });
    registry.registerAdapter("test", mock);
    const models = registry.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("test-model");
  });

  it("throws when no adapter registered for active provider", () => {
    expect(() => registry.getActiveAdapter()).toThrow(/no adapter/i);
  });

  it("creates adapters from config entries (with env vars resolved)", () => {
    process.env.TEST_ANTHROPIC_KEY = "sk-resolved";
    const config: AgentConfig = {
      ...TEST_CONFIG,
      providers: {
        anthropic: { apiKey: "env:TEST_ANTHROPIC_KEY" },
      },
    };
    const reg = new ProviderRegistry(config);
    expect(() => reg.createAdapter("anthropic")).not.toThrow();
    Reflect.deleteProperty(process.env, "TEST_ANTHROPIC_KEY");
  });

  it("returns the active provider and model names", () => {
    expect(registry.getActiveProvider()).toBe("anthropic");
    expect(registry.getActiveModel()).toBe("claude-sonnet-4-6");
  });

  it("getModelCatalog returns catalog grouped by provider", () => {
    const catalog = registry.getModelCatalog();
    expect(catalog.anthropic).toBeDefined();
    expect(Array.isArray(catalog.anthropic)).toBe(true);
  });

  it("getAvailableModels returns flat list of all models", () => {
    const models = registry.getAvailableModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty("id");
  });

  it("setModelWithProvider resolves provider from catalog", () => {
    const mockAnthropic = new MockAdapter([], { id: "claude-opus-4-7", provider: "anthropic" });
    registry.registerAdapter("anthropic", mockAnthropic);

    registry.setModelWithProvider("claude-opus-4-7");
    expect(registry.getActiveModel()).toBe("claude-opus-4-7");
    expect(registry.getActiveProvider()).toBe("anthropic");
  });

  it("setModelWithProvider throws for unknown model", () => {
    expect(() => registry.setModelWithProvider("nonexistent-model-xyz")).toThrow(
      /unknown model/i,
    );
  });

  it("setProvider rejects unknown providers", () => {
    expect(() => registry.setProvider("nonexistent-provider-xyz")).toThrow(
      /unknown provider/i,
    );
  });
});
