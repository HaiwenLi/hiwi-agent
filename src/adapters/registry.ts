import type { ModelAdapter, AgentConfig, ModelInfo, ProviderConfig } from "../types.js";
import { AnthropicAdapter } from "./anthropic.js";
import { OpenAICompatAdapter } from "./openai-compat.js";
import { OllamaAdapter } from "./ollama.js";

export class ProviderRegistry {
  private adapters = new Map<string, ModelAdapter>();
  private activeProvider: string;
  private activeModel: string;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.activeProvider = config.activeProvider;
    this.activeModel = config.activeModel;
  }

  registerAdapter(name: string, adapter: ModelAdapter): void {
    this.adapters.set(name, adapter);
  }

  getActiveAdapter(): ModelAdapter {
    const adapter = this.adapters.get(this.activeProvider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${this.activeProvider}`);
    }
    return adapter;
  }

  setProvider(name: string): void {
    this.activeProvider = name;
  }

  setModel(modelId: string): void {
    this.activeModel = modelId;
  }

  getActiveProvider(): string {
    return this.activeProvider;
  }

  getActiveModel(): string {
    return this.activeModel;
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
