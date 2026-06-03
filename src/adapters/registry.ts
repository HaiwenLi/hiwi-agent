import type {
  AgentConfig,
  ModelAdapter,
  ModelCapabilities,
  ModelEntry,
  ModelInfo,
  ProviderConfig,
} from "../types.js";
import { AnthropicAdapter, ANTHROPIC_MODELS } from "./anthropic.js";
import { DeepSeekAdapter, DEEPSEEK_MODELS } from "./deepseek.js";
import { KimiAdapter, KIMI_MODELS } from "./kimi.js";
import { MiniMaxAdapter, MINIMAX_MODELS } from "./minimax.js";
import { type ProviderModelCatalog, buildCatalog } from "./model-catalog.js";
import { OllamaAdapter, OLLAMA_MODELS } from "./ollama.js";
import { OpenAIAdapter, OPENAI_MODELS } from "./openai.js";
import { OpenAICompatAdapter, OPENAI_COMPAT_MODELS } from "./openai-compat.js";
import { ZhipuAdapter, ZHIPU_MODELS } from "./zhipu.js";

const ALL_CAPABILITIES: Record<string, ModelCapabilities> = {
  ...DEEPSEEK_MODELS,
  ...OPENAI_MODELS,
  ...ANTHROPIC_MODELS,
  ...KIMI_MODELS,
  ...MINIMAX_MODELS,
  ...OLLAMA_MODELS,
  ...OPENAI_COMPAT_MODELS,
  ...ZHIPU_MODELS,
};

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
    if (!this.adapters.has(name)) {
      throw new Error(`No adapter registered for provider: ${name}. Use /test to initialize the provider first.`);
    }
    this.activeProvider = name;
  }

  /**
   * Try to get or create an adapter for a provider.
   * Returns the adapter if available, or null if creation fails (e.g. missing API key).
   */
  ensureAdapter(name: string): ModelAdapter | null {
    if (this.adapters.has(name)) {
      return this.adapters.get(name)!;
    }
    if (!this.config.providers[name] && !this.modelCatalog[name]) {
      return null;
    }
    try {
      const adapter = this.createAdapter(name);
      this.registerAdapter(name, adapter);
      return adapter;
    } catch {
      return null;
    }
  }

  setModel(modelId: string): void {
    this.activeModel = modelId;
    for (const [, adapter] of this.adapters) {
      adapter.setModel?.(modelId);
    }
  }

  updateProviderConfig(providerName: string, config: ProviderConfig): void {
    this.config.providers[providerName] = config;
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
    const seen = new Set<string>();
    const result: ModelInfo[] = [];

    for (const [provider, models] of Object.entries(this.modelCatalog)) {
      for (const model of models) {
        seen.add(model.id);
        result.push({
          id: model.id,
          provider,
          capabilities: ALL_CAPABILITIES[model.id] ?? {
            tools: true,
            vision: false,
            maxTokens: 16384,
            contextWindow: 128_000,
          },
        });
      }
    }

    for (const [provider, adapter] of this.adapters.entries()) {
      if (!seen.has(adapter.id)) {
        const providerModels = this.modelCatalog[provider];
        const belongsToProvider =
          providerModels?.some((m) => m.id === adapter.id) ?? false;
        if (!belongsToProvider && providerModels?.length) continue;
        seen.add(adapter.id);
        result.push({
          id: adapter.id,
          provider: adapter.provider,
          capabilities: adapter.capabilities,
        });
      }
    }

    return result;
  }

  createAdapter(providerName: string): ModelAdapter {
    const providerConfig: ProviderConfig = this.config.providers[providerName] ?? {};
    const apiKey = providerConfig.apiKey;
    const baseUrl = providerConfig.baseUrl;

    switch (providerName) {
      case "deepseek":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new DeepSeekAdapter({ apiKey, baseUrl, model: this.activeModel });

      case "openai":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new OpenAIAdapter({ apiKey, baseUrl, model: this.activeModel });

      case "anthropic":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new AnthropicAdapter({ apiKey, model: this.activeModel });

      case "ollama":
        return new OllamaAdapter({ baseUrl, model: this.activeModel });

      case "kimi":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new KimiAdapter({ apiKey, baseUrl, model: this.activeModel });

      case "zhipu":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new ZhipuAdapter({ apiKey, baseUrl, model: this.activeModel });

      case "minimax":
      case "minimaxi":
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
