import type { ModelEntry } from "../types.js";

export function fuzzyFilter(query: string, items: string[]): string[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter((item) => item.toLowerCase().includes(lower));
}

export interface ProviderModelCatalog {
  [provider: string]: ModelEntry[];
}

export interface FlattenedModel {
  model: ModelEntry;
  provider: string;
}

export function flattenModels(catalog: ProviderModelCatalog): FlattenedModel[] {
  const result: FlattenedModel[] = [];
  for (const [provider, models] of Object.entries(catalog)) {
    for (const model of models) {
      result.push({ model, provider });
    }
  }
  return result;
}
