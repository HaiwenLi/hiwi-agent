import type { ModelEntry, ProviderConfig } from "../types.js";
import { ANTHROPIC_MODELS } from "./anthropic.js";
import { MINIMAX_MODELS } from "./minimax.js";
import { OLLAMA_MODELS } from "./ollama.js";
import { OPENAI_COMPAT_MODELS } from "./openai-compat.js";
import { ZHIPU_MODELS } from "./zhipu.js";

export interface ProviderModelCatalog {
  [provider: string]: ModelEntry[];
}

const STATIC_DEFAULTS: ProviderModelCatalog = {
  anthropic: Object.keys(ANTHROPIC_MODELS).map((id) => ({ id })),
  minimax: Object.keys(MINIMAX_MODELS).map((id) => ({ id })),
  zhipu: Object.keys(ZHIPU_MODELS).map((id) => ({ id })),
  ollama: Object.keys(OLLAMA_MODELS).map((id) => ({ id })),
};

// OpenAI-compat models use model ID as provider key (e.g., "gpt-4o" is its own provider)
for (const [id] of Object.entries(OPENAI_COMPAT_MODELS)) {
  STATIC_DEFAULTS[id] = [{ id }];
}

export function buildCatalog(
  configProviders?: Record<string, ProviderConfig>,
): ProviderModelCatalog {
  const catalog: ProviderModelCatalog = {};

  for (const [provider, models] of Object.entries(STATIC_DEFAULTS)) {
    catalog[provider] = [...models];
  }

  if (configProviders) {
    for (const [provider, providerConfig] of Object.entries(configProviders)) {
      if (providerConfig.models && providerConfig.models.length > 0) {
        catalog[provider] = providerConfig.models.map((id) => ({ id }));
      }
    }
  }

  return catalog;
}
