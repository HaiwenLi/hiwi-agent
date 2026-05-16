import { testConnection } from "@/adapters/connection-test.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import type { ModelAdapter } from "@/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockAdapter(
  id: string,
  provider: string,
  opts: {
    shouldFail?: boolean;
    latencyMs?: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
    contextWindow?: number;
  } = {},
): ModelAdapter {
  return {
    id,
    provider,
    capabilities: {
      tools: opts.supportsTools ?? true,
      vision: opts.supportsVision ?? false,
      maxTokens: 16384,
      contextWindow: opts.contextWindow ?? 200000,
    },
    chat: vi.fn(async () => {
      if (opts.shouldFail) throw new Error("Connection refused");
      await new Promise((r) => setTimeout(r, opts.latencyMs ?? 0));
      return {
        content: "OK",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 1 },
      };
    }),
    stream: async function* () {
      yield { type: "text-delta" as const, text: "OK" };
      yield {
        type: "finish" as const,
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 1 },
      };
    },
  };
}

describe("testConnection", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry({
      activeProvider: "anthropic",
      activeModel: "claude-sonnet-4-6",
      providers: {},
      agent: {
        maxLoops: 50,
        maxOutputTokensPerTurn: 4096,
        budgetTotal: 50,
        refundableTools: [],
        streaming: false,
        interruptible: false,
      },
    });
  });

  it("returns connected result on successful test", async () => {
    registry.registerAdapter(
      "anthropic",
      createMockAdapter("claude-sonnet-4-6", "anthropic", {
        supportsVision: true,
        contextWindow: 200000,
      }),
    );

    const result = await testConnection(registry);

    expect(result.connected).toBe(true);
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-4-6");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.modelInfo).toBeDefined();
    expect(result.modelInfo!.id).toBe("claude-sonnet-4-6");
    expect(result.modelInfo!.supportsVision).toBe(true);
    expect(result.modelInfo!.contextWindow).toBe(200000);
  });

  it("reports failure when adapter throws", async () => {
    registry.registerAdapter(
      "anthropic",
      createMockAdapter("claude-sonnet-4-6", "anthropic", { shouldFail: true }),
    );

    const result = await testConnection(registry);

    expect(result.connected).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Connection refused");
  });

  it("tests a specific provider when specified", async () => {
    registry.registerAdapter("anthropic", createMockAdapter("opaque-model", "anthropic"));
    registry.registerAdapter("ollama", createMockAdapter("llama3", "ollama"));

    const result = await testConnection(registry, "ollama");

    expect(result.connected).toBe(true);
    expect(result.provider).toBe("ollama");
  });

  it("reports missing adapter for unknown provider", async () => {
    registry.registerAdapter("anthropic", createMockAdapter("claude-sonnet-4-6", "anthropic"));

    const result = await testConnection(registry, "nonexistent");

    expect(result.connected).toBe(false);
    expect(result.error).toContain("No adapter registered");
  });
});
