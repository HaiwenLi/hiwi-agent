import type { ProviderRegistry } from "./registry.js";

export interface ConnectionTestResult {
  provider: string;
  model: string;
  connected: boolean;
  latencyMs: number;
  error?: string;
  modelInfo?: {
    id: string;
    contextWindow?: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
  };
}

export async function testConnection(
  registry: ProviderRegistry,
  providerName?: string,
): Promise<ConnectionTestResult> {
  const provider = providerName ?? registry.getActiveProvider();

  let adapter;
  try {
    adapter = registry.getAdapter(provider);
  } catch (err) {
    return {
      provider,
      model: "",
      connected: false,
      latencyMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const start = Date.now();
  try {
    const response = await adapter.chat([{ role: "user", content: "Reply with OK" }]);
    const latencyMs = Date.now() - start;

    return {
      provider: adapter.provider,
      model: adapter.id,
      connected: true,
      latencyMs,
      modelInfo: {
        id: adapter.id,
        contextWindow: adapter.capabilities.contextWindow,
        supportsTools: adapter.capabilities.tools,
        supportsVision: adapter.capabilities.vision,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      provider: adapter.provider,
      model: adapter.id,
      connected: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
