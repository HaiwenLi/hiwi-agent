import type { ModelEntry, ProviderConfig } from "../types.js";
import { ANTHROPIC_MODELS } from "./anthropic.js";
import { DEEPSEEK_MODELS } from "./deepseek.js";
import { KIMI_MODELS } from "./kimi.js";
import { MINIMAX_MODELS } from "./minimax.js";
import { OLLAMA_MODELS } from "./ollama.js";
import { OPENAI_COMPAT_MODELS } from "./openai-compat.js";
import { OPENAI_MODELS } from "./openai.js";
import { ZHIPU_MODELS } from "./zhipu.js";

export interface ProviderModelCatalog {
  [provider: string]: ModelEntry[];
}

const STATIC_DEFAULTS: ProviderModelCatalog = {
  deepseek: Object.keys(DEEPSEEK_MODELS).map((id) => ({ id })),
  openai: Object.keys(OPENAI_MODELS).map((id) => ({ id })),
  anthropic: Object.keys(ANTHROPIC_MODELS).map((id) => ({ id })),
  kimi: Object.keys(KIMI_MODELS).map((id) => ({ id })),
  minimax: Object.keys(MINIMAX_MODELS).map((id) => ({ id })),
  zhipu: Object.keys(ZHIPU_MODELS).map((id) => ({ id })),
  ollama: Object.keys(OLLAMA_MODELS).map((id) => ({ id })),
};

// OpenAI-compat models grouped under their real providers
for (const [id] of Object.entries(OPENAI_COMPAT_MODELS)) {
  const provider = modelProvider(id);
  STATIC_DEFAULTS[provider] = [...(STATIC_DEFAULTS[provider] ?? []), { id }];
}

function modelProvider(modelId: string): string {
  if (modelId.startsWith("kimi")) return "kimi";
  if (modelId.startsWith("abab")) return "abab";
  return modelId;
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
