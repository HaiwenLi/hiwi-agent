import { buildCatalog, type ProviderModelCatalog } from "./model-catalog.js";
import type { AgentConfig, ModelAdapter, ModelEntry, ModelInfo, ProviderConfig } from "../types.js";
import { AnthropicAdapter } from "./anthropic.js";
import { MiniMaxAdapter } from "./minimax.js";
import { OllamaAdapter } from "./ollama.js";
import { OpenAICompatAdapter } from "./openai-compat.js";
import { ZhipuAdapter } from "./zhipu.js";

export class ProviderRegistry {
  private adapters = new Map<string, ModelAdapter>();
  private activeProvider: string;
  private activeModel: string;
  private config: AgentConfig;
  private modelCatalog: ProviderModelCatalog;

  constructor(config: AgentConfig) {
    this.config = config;
    this.activeProvider = config.activeProvider;
    this.activeModel = config.activeModel;
    this.modelCatalog = buildCatalog(config.providers);
  }

  registerAdapter(name: string, adapter: ModelAdapter): void {
    this.adapters.set(name, adapter);
  }

  getAdapter(name: string): ModelAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${name}`);
    }
    return adapter;
  }

  getActiveAdapter(): ModelAdapter {
    return this.getAdapter(this.activeProvider);
  }

  setProvider(name: string): void {
    if (!this.modelCatalog[name] && !this.adapters.has(name)) {
      throw new Error(`Unknown provider: ${name}`);
    }
    this.activeProvider = name;
  }

  setModel(modelId: string): void {
    this.activeModel = modelId;
  }

  setModelWithProvider(modelId: string): void {
    for (const [provider, models] of Object.entries(this.modelCatalog)) {
      if (models.some((m) => m.id === modelId)) {
        this.activeModel = modelId;
        this.activeProvider = provider;
        return;
      }
    }
    throw new Error(`Unknown model: ${modelId}`);
  }

  getActiveProvider(): string {
    return this.activeProvider;
  }

  getActiveModel(): string {
    return this.activeModel;
  }

  getModelCatalog(): ProviderModelCatalog {
    return this.modelCatalog;
  }

  getAvailableModels(): ModelEntry[] {
    return Object.values(this.modelCatalog).flat();
  }

  listModels(): ModelInfo[] {
    return Array.from(this.adapters.entries()).map(([, adapter]) => ({
      id: adapter.id,
      provider: adapter.provider,
      capabilities: adapter.capabilities,
    }));
  }

  createAdapter(providerName: string): ModelAdapter {
    const providerConfig: ProviderConfig = this.config.providers[providerName] ?? {};
    const apiKey = providerConfig.apiKey;
    const baseUrl = providerConfig.baseUrl;

    switch (providerName) {
      case "anthropic":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new AnthropicAdapter({ apiKey, model: this.activeModel });

      case "ollama":
        return new OllamaAdapter({ baseUrl, model: this.activeModel });

      case "zhipu":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new ZhipuAdapter({ apiKey, baseUrl, model: this.activeModel });

      case "minimax":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new MiniMaxAdapter({
          apiKey,
          groupId: process.env.MINIMAX_GROUP_ID,
          baseUrl,
          model: this.activeModel,
        });

      default: {
        if (!apiKey && providerName !== "ollama") {
          throw new Error(`No API key for provider: ${providerName}`);
        }
        return new OpenAICompatAdapter({
          provider: providerName,
          apiKey,
          baseUrl,
          model: this.activeModel,
        });
      }
    }
  }
}
