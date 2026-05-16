# Model Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Interactive model/provider switching via Ink fullscreen modal picker with fuzzy search, triggered by no-arg `/model` and `/provider` commands.

**Architecture:** Build model catalog from adapter capability map keys. Add `mode` state to App for chat/picker routing. Command handlers signal mode-switch via new `requestModeSwitch` callback on CommandContext. Pickers render as fullscreen Ink overlays with arrow-key nav, fuzzy filter, Enter/Escape. On select, validate against catalog, update registry, persist to `.agent/config.json`.

**Tech Stack:** Ink 7, React, Vitest, TypeScript

---

### Task 1: Export model capability maps from adapters

**Files:**
- Modify: `src/adapters/anthropic.ts:13`
- Modify: `src/adapters/ollama.ts:12`
- Modify: `src/adapters/openai-compat.ts:12`

**Step 1: Export the maps**

Change `const MODEL_CAPABILITIES` → `export const ANTHROPIC_MODELS` in anthropic.ts.
Change `const OLLAMA_CAPABILITIES` → `export const OLLAMA_MODELS` in ollama.ts.
Change `const PROVIDER_CAPABILITIES` → `export const OPENAI_COMPAT_MODELS` in openai-compat.ts.
Update internal references in each file to use the new name.

**Step 2: Verify existing tests still pass**

Run: `npx vitest run tests/unit/adapters/anthropic.test.ts tests/unit/adapters/openai-compat.test.ts tests/unit/adapters/ollama.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/adapters/anthropic.ts src/adapters/ollama.ts src/adapters/openai-compat.ts
git commit -m "refactor: export adapter model capability maps"
```

---

### Task 2: Add ModelEntry type

**Files:**
- Modify: `src/types.ts`

**Step 1: Write the failing test**

Create `tests/unit/adapters/model-catalog.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { ModelEntry } from "@/types.js";

describe("ModelEntry", () => {
  it("accepts a minimal model entry with id", () => {
    const entry: ModelEntry = { id: "gpt-4o" };
    expect(entry.id).toBe("gpt-4o");
  });

  it("accepts a full model entry with optional fields", () => {
    const entry: ModelEntry = {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      tier: "standard",
      tags: ["anthropic", "fast"],
    };
    expect(entry.label).toBe("Claude Sonnet 4.6");
    expect(entry.tier).toBe("standard");
    expect(entry.tags).toEqual(["anthropic", "fast"]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/model-catalog.test.ts`
Expected: FAIL (ModelEntry not exported from types)

**Step 3: Add ModelEntry to types.ts**

```typescript
export interface ModelEntry {
  id: string;
  label?: string;
  tier?: "fast" | "standard" | "premium";
  tags?: string[];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/model-catalog.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts tests/unit/adapters/model-catalog.test.ts
git commit -m "feat: add ModelEntry type to types"
```

---

### Task 3: Build model-catalog from adapter maps

**Files:**
- Create: `src/adapters/model-catalog.ts`
- Modify: `tests/unit/adapters/model-catalog.test.ts`

**Step 1: Write failing tests for buildCatalog**

Add to `tests/unit/adapters/model-catalog.test.ts`:

```typescript
import { buildCatalog } from "@/adapters/model-catalog.js";

describe("buildCatalog", () => {
  it("returns providers with their models", () => {
    const catalog = buildCatalog();

    // anthropic models
    expect(catalog.anthropic).toBeDefined();
    expect(catalog.anthropic.some((m) => m.id === "claude-sonnet-4-6")).toBe(true);
    expect(catalog.anthropic.some((m) => m.id === "claude-opus-4-7")).toBe(true);

    // minimax models
    expect(catalog.minimax).toBeDefined();
    expect(catalog.minimax.some((m) => m.id === "MiniMax-M2.7")).toBe(true);

    // zhipu models
    expect(catalog.zhipu).toBeDefined();
    expect(catalog.zhipu.some((m) => m.id === "glm-4-plus")).toBe(true);

    // ollama models
    expect(catalog.ollama).toBeDefined();
    expect(catalog.ollama.some((m) => m.id === "llama3")).toBe(true);

    // openai compat models
    expect(catalog["gpt-4o"]).toBeDefined();
    expect(catalog["gpt-4o"].some((m) => m.id === "gpt-4o")).toBe(true);
  });

  it("merges config overrides into catalog", () => {
    const catalog = buildCatalog({
      anthropic: { models: ["claude-sonnet-4-6", "custom-model"] },
    });

    expect(catalog.anthropic.some((m) => m.id === "custom-model")).toBe(true);
    // original models still present
    expect(catalog.anthropic.some((m) => m.id === "claude-opus-4-7")).toBe(true);
  });

  it("uses config model list exclusively when provided (no merging)", () => {
    const catalog = buildCatalog({
      custom: { models: ["my-model-a", "my-model-b"] },
    });

    expect(catalog.custom).toHaveLength(2);
    expect(catalog.custom[0].id).toBe("my-model-a");
    expect(catalog.custom[1].id).toBe("my-model-b");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/model-catalog.test.ts`
Expected: FAIL (buildCatalog not found)

**Step 3: Implement buildCatalog**

```typescript
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
  ...Object.fromEntries(
    Object.keys(OPENAI_COMPAT_MODELS).map((id) => [id, [{ id }]]),
  ),
};

export function buildCatalog(
  configProviders?: Record<string, ProviderConfig>,
): ProviderModelCatalog {
  const catalog: ProviderModelCatalog = {};

  // Start with static defaults
  for (const [provider, models] of Object.entries(STATIC_DEFAULTS)) {
    catalog[provider] = [...models];
  }

  // Apply config overrides
  if (configProviders) {
    for (const [provider, providerConfig] of Object.entries(configProviders)) {
      if (providerConfig.models && providerConfig.models.length > 0) {
        catalog[provider] = providerConfig.models.map((id) => ({ id }));
      }
    }
  }

  return catalog;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/model-catalog.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/adapters/model-catalog.ts tests/unit/adapters/model-catalog.test.ts
git commit -m "feat: add model-catalog builder from adapter capability maps"
```

---

### Task 4: Add catalog methods + validation to ProviderRegistry

**Files:**
- Modify: `src/adapters/registry.ts`
- Modify: `tests/unit/adapters/registry.test.ts`

**Step 1: Write failing tests**

Add to `tests/unit/adapters/registry.test.ts`:

```typescript
import { MockAdapter } from "@/adapters/mock.js";
import { ProviderRegistry } from "@/adapters/registry.js";

// ...existing imports and TEST_CONFIG...

describe("catalog methods", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry(TEST_CONFIG);
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/adapters/registry.test.ts`
Expected: FAIL (getModelCatalog not defined, etc.)

**Step 3: Implement new methods on ProviderRegistry**

```typescript
import { buildCatalog, type ProviderModelCatalog } from "./model-catalog.js";

// In ProviderRegistry class, add:

private modelCatalog: ProviderModelCatalog;

constructor(config: AgentConfig) {
  this.config = config;
  this.activeProvider = config.activeProvider;
  this.activeModel = config.activeModel;
  this.modelCatalog = buildCatalog(config.providers);
}

getModelCatalog(): ProviderModelCatalog {
  return this.modelCatalog;
}

getAvailableModels(): ModelEntry[] {
  return Object.values(this.modelCatalog).flat();
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

// Update setProvider to validate:
setProvider(name: string): void {
  if (!this.modelCatalog[name] && !this.adapters.has(name)) {
    throw new Error(`Unknown provider: ${name}`);
  }
  this.activeProvider = name;
}

// Also need to import ModelEntry type
import type { ModelEntry } from "../types.js";
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/adapters/registry.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/adapters/registry.ts tests/unit/adapters/registry.test.ts
git commit -m "feat: add model catalog methods and provider/model validation to registry"
```

---

### Task 5: Add saveModelSelection to config

**Files:**
- Modify: `src/core/config.ts`
- Modify: `tests/unit/core/config.test.ts`

**Step 1: Write failing tests**

Add to `tests/unit/core/config.test.ts`:

```typescript
import { saveModelSelection } from "@/core/config.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("saveModelSelection", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes activeProvider and activeModel to project config", async () => {
    await saveModelSelection(tmpDir, "anthropic", "claude-opus-4-7");

    const filePath = path.join(tmpDir, ".agent", "config.json");
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);

    expect(data.activeProvider).toBe("anthropic");
    expect(data.activeModel).toBe("claude-opus-4-7");
  });

  it("merges with existing config file", async () => {
    const agentDir = path.join(tmpDir, ".agent");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "config.json"),
      JSON.stringify({ activeProvider: "ollama", agent: { maxLoops: 20 } }),
    );

    await saveModelSelection(tmpDir, "anthropic", "claude-opus-4-7");

    const content = await fs.readFile(path.join(agentDir, "config.json"), "utf-8");
    const data = JSON.parse(content);

    expect(data.activeProvider).toBe("anthropic");
    expect(data.activeModel).toBe("claude-opus-4-7");
    expect(data.agent.maxLoops).toBe(20); // preserved
  });

  it("creates .agent directory if it does not exist", async () => {
    await saveModelSelection(tmpDir, "openai", "gpt-4o");

    const stat = await fs.stat(path.join(tmpDir, ".agent"));
    expect(stat.isDirectory()).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/core/config.test.ts`
Expected: FAIL (saveModelSelection not exported)

**Step 3: Implement saveModelSelection**

Add to `src/core/config.ts`:

```typescript
export async function saveModelSelection(
  projectDir: string,
  provider: string,
  model: string,
): Promise<void> {
  const agentDir = path.join(projectDir, ".agent");
  await fs.mkdir(agentDir, { recursive: true });

  const configPath = path.join(agentDir, "config.json");
  let existing: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(configPath, "utf-8");
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // file doesn't exist yet
  }

  const updated = { ...existing, activeProvider: provider, activeModel: model };
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + "\n");
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/core/config.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/core/config.ts tests/unit/core/config.test.ts
git commit -m "feat: add saveModelSelection to persist model choice to project config"
```

---

### Task 6: Add requestModeSwitch to CommandContext

**Files:**
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/repl.ts`
- Modify: `src/cli/index.ts`

**Step 1: Update CommandContext type**

Add `requestModeSwitch` to `CommandContext` interface:

```typescript
export interface CommandContext {
  // ...existing fields...
  requestModeSwitch?: (mode: string) => void;
}
```

**Step 2: Thread through REPL**

Add `onRequestModeSwitch` to `REPLDependencies`:

```typescript
export interface REPLDependencies {
  // ...existing fields...
  onRequestModeSwitch?: (mode: string) => void;
}
```

And in `buildCommandContext`:

```typescript
private buildCommandContext(): CommandContext {
  return {
    // ...existing fields...
    requestModeSwitch: this.deps.onRequestModeSwitch,
  };
}
```

**Step 3: Verify existing tests pass**

Run: `npx vitest run tests/unit/cli/commands.test.ts tests/unit/cli/repl.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/cli/commands.ts src/cli/repl.ts
git commit -m "feat: add requestModeSwitch callback to CommandContext and REPL"
```

---

### Task 7: Build ModelPicker Ink component

**Files:**
- Create: `src/cli/model-picker.tsx`
- Create: `tests/unit/cli/model-picker.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/cli/model-picker.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

// ModelPicker is an Ink component — test the pure logic functions
// Extract and test: fuzzyFilter, groupByProvider

describe("ModelPicker logic", () => {
  // Tests will be written after extracting the pure functions
  // For now, test that the module exports exist
  it("exports ModelPicker component", async () => {
    const mod = await import("@/cli/model-picker.js");
    expect(mod.ModelPicker).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cli/model-picker.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement ModelPicker**

Create `src/cli/model-picker.tsx`:

```typescript
import { Box, Text, useInput } from "ink";
import React, { useState } from "react";
import type { ModelEntry } from "../types.js";

interface ModelPickerProps {
  modelsByProvider: Record<string, ModelEntry[]>;
  activeModel: string;
  activeProvider: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export function fuzzyFilter(query: string, items: string[]): string[] {
  const lower = query.toLowerCase();
  return items.filter((item) => item.toLowerCase().includes(lower));
}

export function flattenModels(
  modelsByProvider: Record<string, ModelEntry[]>,
): Array<{ model: ModelEntry; provider: string }> {
  const result: Array<{ model: ModelEntry; provider: string }> = [];
  // Active provider first
  for (const [provider, models] of Object.entries(modelsByProvider)) {
    for (const model of models) {
      result.push({ model, provider });
    }
  }
  return result;
}

export function ModelPicker({
  modelsByProvider,
  activeModel,
  activeProvider,
  onSelect,
  onCancel,
}: ModelPickerProps) {
  const allModels = flattenModels(modelsByProvider);
  const [filter, setFilter] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = filter
    ? allModels.filter(({ model }) =>
        `${model.id} ${model.label ?? ""}`.toLowerCase().includes(filter.toLowerCase()),
      )
    : allModels;

  // Clamp selected index
  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));

  useInput((_char, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (filtered[safeIdx]) {
        onSelect(filtered[safeIdx].model.id);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIdx((prev) => Math.min(filtered.length - 1, prev + 1));
      return;
    }

    if (key.backspace || key.delete) {
      setFilter((prev) => prev.slice(0, -1));
      setSelectedIdx(0);
      return;
    }

    if (!key.ctrl && !key.meta && !key.shift) {
      setFilter((prev) => prev + _char);
      setSelectedIdx(0);
    }
  });

  const currentProvider = "";

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Select Model
        </Text>
        <Text color="gray"> (↑↓ navigate, Enter select, Esc cancel)</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">{"> "}</Text>
        <Text>{filter}</Text>
        <Text color="gray">█</Text>
      </Box>

      {filtered.length === 0 && (
        <Box>
          <Text color="red">No models match filter</Text>
        </Box>
      )}

      {filtered.map(({ model, provider }, idx) => {
        const isSelected = idx === safeIdx;
        const isActive =
          model.id === activeModel && provider === activeProvider;

        return (
          <Box key={`${provider}:${model.id}`}>
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "❯ " : "  "}
              {model.label ?? model.id}
              {isActive ? " (active)" : ""}
              <Text color="gray"> — {provider}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

**Step 4: Run test to verify module exports**

Run: `npx vitest run tests/unit/cli/model-picker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/model-picker.tsx tests/unit/cli/model-picker.test.ts
git commit -m "feat: add ModelPicker Ink component with fuzzy filter"
```

---

### Task 8: Build ProviderPicker Ink component

**Files:**
- Create: `src/cli/provider-picker.tsx`
- Create: `tests/unit/cli/provider-picker.test.ts`

**Step 1: Write failing test**

Create `tests/unit/cli/provider-picker.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

describe("ProviderPicker", () => {
  it("exports ProviderPicker component", async () => {
    const mod = await import("@/cli/provider-picker.js");
    expect(mod.ProviderPicker).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cli/provider-picker.test.ts`
Expected: FAIL

**Step 3: Implement ProviderPicker**

Create `src/cli/provider-picker.tsx`:

```typescript
import { Box, Text, useInput } from "ink";
import React, { useState } from "react";

interface ProviderPickerProps {
  providers: string[];
  activeProvider: string;
  onSelect: (provider: string) => void;
  onCancel: () => void;
}

export function ProviderPicker({
  providers,
  activeProvider,
  onSelect,
  onCancel,
}: ProviderPickerProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const safeIdx = Math.min(selectedIdx, Math.max(0, providers.length - 1));

  useInput((_char, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      if (providers[safeIdx]) {
        onSelect(providers[safeIdx]);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIdx((prev) => Math.min(providers.length - 1, prev + 1));
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Select Provider
        </Text>
        <Text color="gray"> (↑↓ navigate, Enter select, Esc cancel)</Text>
      </Box>

      {providers.length === 0 && (
        <Box>
          <Text color="red">No providers configured</Text>
        </Box>
      )}

      {providers.map((provider, idx) => {
        const isSelected = idx === safeIdx;
        const isActive = provider === activeProvider;

        return (
          <Box key={provider}>
            <Text color={isSelected ? "cyan" : undefined}>
              {isSelected ? "❯ " : "  "}
              {provider}
              {isActive ? " (active)" : ""}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

**Step 4: Run test to verify module exports**

Run: `npx vitest run tests/unit/cli/provider-picker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/provider-picker.tsx tests/unit/cli/provider-picker.test.ts
git commit -m "feat: add ProviderPicker Ink component"
```

---

### Task 9: Wire picker mode into App component

**Files:**
- Modify: `src/cli/app.tsx`
- Modify: `tests/unit/cli/streaming-tui.test.ts` (if affected)

**Step 1: Add mode state and picker rendering to App**

Add to App function in `src/cli/app.tsx`:

```typescript
import { ModelPicker } from "./model-picker.js";
import { ProviderPicker } from "./provider-picker.js";
import type { ModelEntry } from "../types.js";

// Add to AppProps:
export interface AppProps {
  onInput: (text: string) => Promise<void>;
  onModelSelect?: (modelId: string) => void;
  onProviderSelect?: (provider: string) => void;
  onPickerCancel?: () => void;
}

// In App function, add:
const [mode, setMode] = useState<"chat" | "model-picker" | "provider-picker">("chat");
const [catalog, setCatalog] = useState<Record<string, ModelEntry[]>>({});
const [providers, setProviders] = useState<string[]>([]);
const [activeModel, setActiveModel] = useState("");
const [activeProvider, setActiveProvider] = useState("");

// Expose mode control via module-level bridge (same pattern as streamState):
const modeState = {
  openModelPicker: (
    _catalog: Record<string, ModelEntry[]>,
    _activeModel: string,
    _activeProvider: string,
  ) => {},
  openProviderPicker: (_providers: string[], _activeProvider: string) => {},
};

useEffect(() => {
  modeState.openModelPicker = (cat, am, ap) => {
    setCatalog(cat);
    setActiveModel(am);
    setActiveProvider(ap);
    setMode("model-picker");
  };
  modeState.openProviderPicker = (p, ap) => {
    setProviders(p);
    setActiveProvider(ap);
    setMode("provider-picker");
  };
}, []);

// In useInput, guard on mode:
useInput((char, key) => {
  if (mode !== "chat") return; // picker handles its own input
  // ...existing input handling...
});

// At end of return, conditionally render:
return (
  <Box flexDirection="column" minHeight={1}>
    {mode === "chat" && (
      <>
        <OutputLines lines={lines} />
        {processing && currentStream && <StreamingLine text={currentStream} />}
        {processing && !currentStream && <Text color="gray">Thinking...</Text>}
        <InputLine input={input} />
      </>
    )}
    {mode === "model-picker" && (
      <ModelPicker
        modelsByProvider={catalog}
        activeModel={activeModel}
        activeProvider={activeProvider}
        onSelect={(modelId) => {
          setMode("chat");
          props.onModelSelect?.(modelId);
        }}
        onCancel={() => {
          setMode("chat");
          props.onPickerCancel?.();
        }}
      />
    )}
    {mode === "provider-picker" && (
      <ProviderPicker
        providers={providers}
        activeProvider={activeProvider}
        onSelect={(provider) => {
          setMode("chat");
          props.onProviderSelect?.(provider);
        }}
        onCancel={() => {
          setMode("chat");
          props.onPickerCancel?.();
        }}
      />
    )}
  </Box>
);

// Export modeState (add to existing exports):
// Already exported: renderApp
// Also export modeState for use by REPL/index.ts
```

In `renderApp`, add to returned object:

```typescript
openModelPicker: modeState.openModelPicker,
openProviderPicker: modeState.openProviderPicker,
```

**Step 2: Verify existing tests compile/pass**

Run: `npx vitest run tests/unit/cli/streaming-tui.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/app.tsx
git commit -m "feat: add picker mode state and routing to App component"
```

---

### Task 10: Wire commands to trigger picker and wire index.ts

**Files:**
- Modify: `src/cli/commands.ts`
- Modify: `src/cli/index.ts`

**Step 1: Update /model and /provider command handlers**

In `src/cli/commands.ts`, update the `/model` handler:

```typescript
this.register({
  name: "model",
  description: "Set or show active model",
  handler: async (args, ctx) => {
    if (args) {
      ctx.providerRegistry.setModel(args);
      return `Model set to: ${args}`;
    }
    // No args: open picker
    ctx.requestModeSwitch?.("model-picker");
    return "";
  },
});
```

Update the `/provider` handler:

```typescript
this.register({
  name: "provider",
  description: "Set or show active provider",
  handler: async (args, ctx) => {
    if (args) {
      ctx.providerRegistry.setProvider(args);
      return `Provider set to: ${args}`;
    }
    // No args: open picker
    ctx.requestModeSwitch?.("provider-picker");
    return "";
  },
});
```

**Step 2: Wire index.ts to connect everything**

In `src/cli/index.ts`, update `main()`:

```typescript
const app = renderApp({
  onInput: async (text) => {
    const result = await repl.processInput(text);
    if (result === "exit") app.unmount();
  },
  onModelSelect: async (modelId) => {
    try {
      providerRegistry.setModelWithProvider(modelId);
      // Re-create adapter for the new model
      const provider = providerRegistry.getActiveProvider();
      const adapter = providerRegistry.createAdapter(provider);
      providerRegistry.registerAdapter(provider, adapter);
      // Persist
      await saveModelSelection(projectDir, provider, modelId);
      app.addOutput(`Model: ${modelId} (${provider})`);
    } catch (e: any) {
      app.addOutput(`Error: ${e.message}`);
    }
  },
  onProviderSelect: async (provider) => {
    try {
      providerRegistry.setProvider(provider);
      const adapter = providerRegistry.createAdapter(provider);
      providerRegistry.registerAdapter(provider, adapter);
      await saveModelSelection(projectDir, provider, providerRegistry.getActiveModel());
      app.addOutput(`Provider: ${provider}`);
    } catch (e: any) {
      app.addOutput(`Error: ${e.message}`);
    }
  },
  onPickerCancel: () => {
    app.addOutput("Cancelled.");
  },
});

const repl = new REPL({
  // ...existing deps...
  onRequestModeSwitch: (mode) => {
    if (mode === "model-picker") {
      const catalog = providerRegistry.getModelCatalog();
      app.openModelPicker(
        catalog,
        providerRegistry.getActiveModel(),
        providerRegistry.getActiveProvider(),
      );
    } else if (mode === "provider-picker") {
      const providers = Object.keys(providerRegistry.getModelCatalog());
      app.openProviderPicker(providers, providerRegistry.getActiveProvider());
    }
  },
});
```

Add import for `saveModelSelection`:
```typescript
import { loadConfig, saveModelSelection } from "../core/config.js";
```

**Step 3: Update commands test for new behavior**

In `tests/unit/cli/commands.test.ts`, update the `/model` test:

```typescript
it("/model with no args requests mode switch to model-picker", async () => {
  const modeSwitchSpy = vi.fn();
  registry.registerBuiltinCommands();
  await registry.dispatch("/model", { ...ctx, requestModeSwitch: modeSwitchSpy });
  expect(modeSwitchSpy).toHaveBeenCalledWith("model-picker");
});

it("/model with args still sets model directly", async () => {
  registry.registerBuiltinCommands();
  await registry.dispatch("/model gpt-4o", ctx);
  expect(ctx.providerRegistry.setModel).toHaveBeenCalledWith("gpt-4o");
});
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/cli/commands.ts src/cli/index.ts tests/unit/cli/commands.test.ts
git commit -m "feat: wire model/provider pickers to commands and app integration"
```

---

### Task 11: Integration verification

**Files:**
- Create: `tests/integration/model-picker.test.ts`

**Step 1: Write integration test**

```typescript
import { buildCatalog } from "@/adapters/model-catalog.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import { saveModelSelection } from "@/core/config.js";
import { describe, expect, it } from "vitest";

describe("model picker integration", () => {
  const TEST_CONFIG = {
    activeProvider: "anthropic",
    activeModel: "claude-sonnet-4-6",
    providers: {
      anthropic: { apiKey: "sk-test" },
      openai: { apiKey: "sk-test" },
    },
    agent: {
      maxLoops: 50,
      maxOutputTokensPerTurn: 4096,
      budgetTotal: 50,
      refundableTools: [],
      streaming: true,
      interruptible: true,
    },
  };

  it("catalog resolves model to correct provider", () => {
    const registry = new ProviderRegistry(TEST_CONFIG);

    // anthropic models belong to anthropic
    registry.setModelWithProvider("claude-opus-4-7");
    expect(registry.getActiveProvider()).toBe("anthropic");

    // minimax models belong to minimax
    registry.setModelWithProvider("MiniMax-M2.5");
    expect(registry.getActiveProvider()).toBe("minimax");
  });

  it("getAvailableModels returns entries with id field", () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const models = registry.getAvailableModels();
    expect(models.length).toBeGreaterThan(5);
    for (const model of models) {
      expect(model).toHaveProperty("id");
      expect(typeof model.id).toBe("string");
    }
  });

  it("catalog includes all known providers", () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const catalog = registry.getModelCatalog();

    expect(catalog.anthropic).toBeDefined();
    expect(catalog.minimax).toBeDefined();
    expect(catalog.zhipu).toBeDefined();
    expect(catalog.ollama).toBeDefined();
  });
});
```

**Step 2: Run integration test**

Run: `npx vitest run tests/integration/model-picker.test.ts`
Expected: ALL PASS

**Step 3: Final full test run**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/integration/model-picker.test.ts
git commit -m "test: add model picker integration tests"
```
