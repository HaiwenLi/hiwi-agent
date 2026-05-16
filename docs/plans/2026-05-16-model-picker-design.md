# Model Picker Design

Interactive model/provider switching with Ink-based modal picker, inspired by OpenCode's `/model` and `/provider` UX.

## Problem

Current `/model` and `/provider` commands accept raw strings with no validation, no listing, and no interactive selection. Users must know exact model/provider names. OpenCode provides a rich dialog with fuzzy search and grouping — we should match that UX.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Picker approach | Ink modal overlay | Already using Ink 7 in `app.tsx`, natural fit |
| Model list source | Config-driven static lists | Simple, no API dependency, config can override |
| Persistence | Project `.agent/config.json` | Per-project default, no global scope creep |
| Provider-model binding | Auto-bind | Selecting a model auto-sets its provider |

## Architecture

### Model Catalog (`src/adapters/model-catalog.ts`)

Static model definitions per provider, overridable via config:

```typescript
interface ModelEntry {
  id: string;
  label?: string;    // display name, defaults to id
  tier?: "fast" | "standard" | "premium";
  tags?: string[];
}

interface ProviderModels {
  [provider: string]: ModelEntry[];
}
```

Source priority: `config.providers[name].models[]` overrides → adapter static defaults.

### Interactive Picker (`src/cli/model-picker.tsx`)

Ink component rendered as modal overlay:

- Groups models by provider, active provider first
- Fuzzy text filter (match on id + label)
- Arrow key navigation, Enter to select, Escape to cancel
- Current model marked with indicator
- On select: validates against catalog, updates registry, persists to config

### Provider Picker (`src/cli/provider-picker.tsx`)

Simpler variant — flat list of providers, no grouping.

### Registry Changes (`src/adapters/registry.ts`)

New methods:
- `setModelWithProvider(modelId)` — resolves provider from catalog, sets both
- `getAvailableModels()` — returns full catalog as flat list
- `getModelCatalog()` — returns catalog grouped by provider
- Validation: reject unknown models/providers

### Persistence (`src/core/config.ts`)

- `saveModelSelection(projectDir, provider, model)` — targeted merge into `.agent/config.json`
- Only writes `activeProvider` + `activeModel` fields

### App Integration (`src/cli/app.tsx`)

Add `mode` state: `"chat" | "model-picker" | "provider-picker"`. When in picker mode, `useInput` routes to picker component. On select/cancel, returns to chat mode.

## Files

### New
- `src/adapters/model-catalog.ts` — catalog builder, static defaults
- `src/cli/model-picker.tsx` — Ink modal picker component
- `src/cli/provider-picker.tsx` — Ink provider picker component

### Modified
- `src/adapters/registry.ts` — new methods + validation
- `src/cli/app.tsx` — mode state + picker routing
- `src/cli/commands.ts` — picker trigger on no-arg `/model` `/provider`
- `src/types.ts` — `ModelEntry` type
- `src/core/config.ts` — `saveModelSelection()`

## Out of Scope

- Runtime API model discovery
- Model cost/pricing metadata
- Per-session model history
- Global default persistence
