# Token Usage Accuracy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Normalize token counting across all adapters so inputTokens excludes cache tokens, streaming captures cache data, and contextPercent is computed consistently.

**Architecture:** Extract a shared `buildNormalizedUsage()` helper into `adapter-utils.ts` that subtracts cache tokens from prompt_tokens for OpenAI-compatible providers. Each adapter calls this helper. Add `totalTokens` to the `TokenUsage` interface. Fix streaming to capture cache fields from final chunks.

**Tech Stack:** TypeScript, Vitest, existing adapter pattern

---

## Problem Analysis

### Current token semantics per provider

| Provider | `inputTokens` source | Includes cache? | Cache fields |
|----------|---------------------|-----------------|--------------|
| Anthropic | `input_tokens` | **No** ✅ | `cache_read_input_tokens`, `cache_creation_input_tokens` |
| OpenAI | `prompt_tokens` | **Yes** ❌ | `prompt_tokens_details.cached_tokens` (not extracted) |
| DeepSeek | `prompt_tokens` | **Yes** ❌ | `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens` (non-stream only) |
| Kimi | `prompt_tokens` | **Yes** ❌ | `cached_tokens` (non-stream only) |
| Zhipu | `prompt_tokens` | **Yes** ❌ | `prompt_tokens_details.cached_tokens` |
| MiniMax | `prompt_tokens` | **Yes** ❌ | `prompt_cache_hit_tokens`, `prompt_cache_miss_tokens` (miss not in stream) |
| Ollama | `prompt_eval_count` | N/A | None |

### Bugs found

1. **OpenAI adapter**: No cache token extraction at all — `buildUsage()` ignores `prompt_tokens_details`
2. **DeepSeek streaming**: `buildUsage({ prompt_tokens, completion_tokens })` — drops `prompt_cache_hit_tokens`
3. **Kimi streaming**: Same — drops `cached_tokens`
4. **OpenAI-Compat streaming**: Same — drops all cache fields
5. **MiniMax streaming**: Captures `prompt_cache_hit_tokens` but not `prompt_cache_miss_tokens`
6. **`contextPercent` inconsistency**: Adapters use `inputTokens / contextWindow`; REPL fallback uses `(inputTokens + outputTokens) / contextWindow`
7. **No `totalTokens`**: Cannot see total context consumption at a glance
8. **Double-counting**: For OpenAI-compat providers, `inputTokens` includes cache tokens, so `↑` count + `cache` count overstates real usage

### Design decision: normalized `inputTokens`

**Rule:** `inputTokens` = non-cache input tokens only. Cache tokens reported separately.

- Anthropic: `inputTokens = input_tokens` (already correct)
- OpenAI-compat providers: `inputTokens = prompt_tokens - cacheReadTokens - cacheWriteTokens`
- `totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens`
- `contextPercent = inputTokens / contextWindow * 100` (consistent everywhere — input tokens represent how full the next prompt will be)

---

### Task 1: Add `totalTokens` to `TokenUsage` interface

**Files:**
- Modify: `src/types.ts:33-43`

**Step 1: Update the TokenUsage interface**

Add `totalTokens` as an optional field to the existing `TokenUsage` interface in `src/types.ts`:

```typescript
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  contextPercent?: number | null;
  contextWindow?: number;
  modelName?: string;
  provider?: string;
  thinkingEffort?: string;
}
```

**Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (field is optional, no breaking changes)

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add totalTokens field to TokenUsage interface"
```

---

### Task 2: Write tests for `buildNormalizedUsage` helper

**Files:**
- Create: `tests/unit/adapters/token-usage.test.ts`

**Step 1: Write failing tests for the new helper**

Create `tests/unit/adapters/token-usage.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildNormalizedUsage, enrichUsage } from "@/adapters/adapter-utils.js";

describe("buildNormalizedUsage", () => {
  it("handles Anthropic-style usage (input excludes cache)", () => {
    const result = buildNormalizedUsage("anthropic", {
      input_tokens: 5000,
      output_tokens: 1000,
      cache_read_input_tokens: 3000,
      cache_creation_input_tokens: 2000,
    });
    expect(result.inputTokens).toBe(5000);
    expect(result.outputTokens).toBe(1000);
    expect(result.cacheReadTokens).toBe(3000);
    expect(result.cacheWriteTokens).toBe(2000);
    expect(result.totalTokens).toBe(11000);
  });

  it("handles OpenAI-style usage (prompt includes cache, subtracts them)", () => {
    const result = buildNormalizedUsage("openai", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 6000 },
    });
    expect(result.inputTokens).toBe(4000); // 10000 - 6000
    expect(result.outputTokens).toBe(2000);
    expect(result.cacheReadTokens).toBe(6000);
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(12000);
  });

  it("handles DeepSeek-style usage (prompt includes cache, separate hit/miss fields)", () => {
    const result = buildNormalizedUsage("deepseek", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_cache_hit_tokens: 5000,
      prompt_cache_miss_tokens: 3000,
    });
    expect(result.inputTokens).toBe(2000); // 10000 - 5000 - 3000
    expect(result.outputTokens).toBe(2000);
    expect(result.cacheReadTokens).toBe(5000);
    expect(result.cacheWriteTokens).toBe(3000);
    expect(result.totalTokens).toBe(12000);
  });

  it("handles Kimi-style usage (prompt includes cache, cached_tokens field)", () => {
    const result = buildNormalizedUsage("kimi", {
      prompt_tokens: 8000,
      completion_tokens: 1500,
      cached_tokens: 4000,
    });
    expect(result.inputTokens).toBe(4000); // 8000 - 4000
    expect(result.outputTokens).toBe(1500);
    expect(result.cacheReadTokens).toBe(4000);
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(9500);
  });

  it("handles Zhipu-style usage (prompt includes cache, nested cached_tokens)", () => {
    const result = buildNormalizedUsage("zhipu", {
      prompt_tokens: 12000,
      completion_tokens: 3000,
      prompt_tokens_details: { cached_tokens: 7000 },
    });
    expect(result.inputTokens).toBe(5000); // 12000 - 7000
    expect(result.outputTokens).toBe(3000);
    expect(result.cacheReadTokens).toBe(7000);
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(15000);
  });

  it("handles MiniMax-style usage (prompt includes cache, hit/miss fields)", () => {
    const result = buildNormalizedUsage("minimax", {
      prompt_tokens: 9000,
      completion_tokens: 2000,
      prompt_cache_hit_tokens: 4000,
      prompt_cache_miss_tokens: 2000,
    });
    expect(result.inputTokens).toBe(3000); // 9000 - 4000 - 2000
    expect(result.outputTokens).toBe(2000);
    expect(result.cacheReadTokens).toBe(4000);
    expect(result.cacheWriteTokens).toBe(3000);
    expect(result.totalTokens).toBe(11000);
  });

  it("handles Ollama-style usage (no cache)", () => {
    const result = buildNormalizedUsage("ollama", {
      prompt_eval_count: 6000,
      eval_count: 1500,
    });
    expect(result.inputTokens).toBe(6000);
    expect(result.outputTokens).toBe(1500);
    expect(result.cacheReadTokens).toBeUndefined();
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(7500);
  });

  it("handles usage with no cache data gracefully", () => {
    const result = buildNormalizedUsage("openai", {
      prompt_tokens: 5000,
      completion_tokens: 1000,
    });
    expect(result.inputTokens).toBe(5000);
    expect(result.outputTokens).toBe(1000);
    expect(result.cacheReadTokens).toBeUndefined();
    expect(result.cacheWriteTokens).toBeUndefined();
    expect(result.totalTokens).toBe(6000);
  });

  it("clamps inputTokens to >= 0 (prevents negative from cache subtraction)", () => {
    const result = buildNormalizedUsage("deepseek", {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_cache_hit_tokens: 200, // more than prompt
    });
    expect(result.inputTokens).toBe(0); // clamped
    expect(result.totalTokens).toBe(250);
  });
});

describe("enrichUsage", () => {
  it("adds contextPercent, modelName, provider, totalTokens", () => {
    const base = buildNormalizedUsage("openai", {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 6000 },
    });
    const result = enrichUsage(base, 128000, "gpt-4o", "openai", "high");
    expect(result.contextWindow).toBe(128000);
    expect(result.contextPercent).toBeCloseTo(3.125, 2); // 4000/128000 * 100
    expect(result.modelName).toBe("gpt-4o");
    expect(result.provider).toBe("openai");
    expect(result.thinkingEffort).toBe("high");
  });

  it("returns null contextPercent when contextWindow is 0", () => {
    const base = buildNormalizedUsage("ollama", {
      prompt_eval_count: 100,
      eval_count: 50,
    });
    const result = enrichUsage(base, 0, "llama3", "ollama");
    expect(result.contextPercent).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/unit/adapters/token-usage.test.ts`
Expected: FAIL — `buildNormalizedUsage` and `enrichUsage` are not exported from adapter-utils

**Step 3: Commit the failing test**

```bash
git add tests/unit/adapters/token-usage.test.ts
git commit -m "test: add failing tests for buildNormalizedUsage helper"
```

---

### Task 3: Implement `buildNormalizedUsage` and `enrichUsage` in adapter-utils

**Files:**
- Modify: `src/adapters/adapter-utils.ts`

**Step 1: Add the helper functions**

Append to `src/adapters/adapter-utils.ts` after the existing `processThinkStream` function:

```typescript
import type { TokenUsage } from "../types.js";

// ─── Token Usage Normalization ──────────────────────────────

/**
 * Raw usage shapes from different providers.
 * Each provider reports tokens differently — this union covers all known formats.
 */
export interface RawUsage {
  // Anthropic fields
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  // OpenAI / OpenAI-compatible fields
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  // DeepSeek fields
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  // Kimi fields
  cached_tokens?: number;
  // MiniMax fields (same as DeepSeek: prompt_cache_hit_tokens, prompt_cache_miss_tokens)
  // Ollama fields
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Normalize raw provider usage into a consistent TokenUsage shape.
 *
 * Key rule: `inputTokens` = non-cache input tokens only.
 * - Anthropic: input_tokens already excludes cache
 * - OpenAI-compat: prompt_tokens includes cache → subtract cacheRead + cacheWrite
 * - Ollama: no cache concept
 */
export function buildNormalizedUsage(provider: string, raw: RawUsage): TokenUsage {
  let inputTokens: number;
  let outputTokens: number;
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;

  if (provider === "anthropic") {
    inputTokens = raw.input_tokens ?? 0;
    outputTokens = raw.output_tokens ?? 0;
    cacheReadTokens = raw.cache_read_input_tokens;
    cacheWriteTokens = raw.cache_creation_input_tokens;
  } else if (provider === "ollama") {
    inputTokens = raw.prompt_eval_count ?? 0;
    outputTokens = raw.eval_count ?? 0;
  } else {
    // OpenAI-compatible providers: prompt_tokens includes cached tokens
    const promptTokens = raw.prompt_tokens ?? 0;
    outputTokens = raw.completion_tokens ?? 0;

    // Extract cache read tokens from various field locations
    cacheReadTokens =
      raw.prompt_tokens_details?.cached_tokens ??
      raw.prompt_cache_hit_tokens ??
      raw.cached_tokens;

    // Extract cache write tokens
    cacheWriteTokens =
      raw.prompt_tokens_details?.cache_write_tokens ??
      raw.prompt_cache_miss_tokens;

    // Subtract cache tokens from prompt to get non-cache input
    const cacheTotal = (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0);
    inputTokens = Math.max(0, promptTokens - cacheTotal);
  }

  const totalTokens =
    inputTokens +
    outputTokens +
    (cacheReadTokens ?? 0) +
    (cacheWriteTokens ?? 0);

  const result: TokenUsage = {
    inputTokens,
    outputTokens,
    totalTokens,
  };
  if (cacheReadTokens != null && cacheReadTokens > 0) result.cacheReadTokens = cacheReadTokens;
  if (cacheWriteTokens != null && cacheWriteTokens > 0) result.cacheWriteTokens = cacheWriteTokens;

  return result;
}

/**
 * Enrich a normalized TokenUsage with display metadata.
 * Computes contextPercent from the normalized inputTokens.
 */
export function enrichUsage(
  usage: TokenUsage,
  contextWindow: number,
  modelName: string,
  provider: string,
  thinkingEffort?: string,
): TokenUsage {
  return {
    ...usage,
    contextWindow,
    contextPercent:
      contextWindow > 0
        ? Math.round((usage.inputTokens / contextWindow) * 1000) / 10 // one decimal place
        : null,
    modelName,
    provider,
    thinkingEffort,
  };
}
```

Also add the import at the top of the file — `TokenUsage` is needed. Add this import line at the top:

```typescript
import type { TokenUsage, ContentPart } from "../types.js";
```

And change the existing `ContentPart` import reference from the `extractText` parameter type to use this shared import.

**Step 2: Run the tests to verify they pass**

Run: `pnpm vitest run tests/unit/adapters/token-usage.test.ts`
Expected: All tests PASS

**Step 3: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/adapters/adapter-utils.ts
git commit -m "feat: add buildNormalizedUsage and enrichUsage helpers to adapter-utils"
```

---

### Task 4: Update Anthropic adapter to use shared helpers

**Files:**
- Modify: `src/adapters/anthropic.ts`
- Modify: `tests/unit/adapters/anthropic.test.ts`

The Anthropic adapter already has correct token semantics (`input_tokens` excludes cache). We just need to use `buildNormalizedUsage` and `enrichUsage` for consistency and get `totalTokens`.

**Step 1: Update the Anthropic adapter**

In `src/adapters/anthropic.ts`:

1. Add import: `import { buildNormalizedUsage, enrichUsage } from "./adapter-utils.js";`
2. In `chat()` (around line 71), replace the inline usage object with:
   ```typescript
   usage: enrichUsage(
     buildNormalizedUsage("anthropic", {
       input_tokens: response.usage.input_tokens,
       output_tokens: response.usage.output_tokens,
       cache_read_input_tokens: (response.usage as any).cache_read_input_tokens,
       cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
     }),
     this.capabilities.contextWindow,
     response.model,
     this.provider,
   ),
   ```
3. In `stream()` (around line 129), replace the inline usage object with:
   ```typescript
   const baseUsage = buildNormalizedUsage("anthropic", {
     input_tokens: finalMessage.usage.input_tokens,
     output_tokens: finalMessage.usage.output_tokens,
     cache_read_input_tokens: (finalMessage.usage as any).cache_read_input_tokens,
     cache_creation_input_tokens: (finalMessage.usage as any).cache_creation_input_tokens,
   });
   const enrichedUsage = enrichUsage(baseUsage, this.capabilities.contextWindow, finalMessage.model, this.provider);
   this.lastUsage = enrichedUsage;
   ```

**Step 2: Run existing Anthropic adapter tests**

Run: `pnpm vitest run tests/unit/adapters/anthropic.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/adapters/anthropic.ts
git commit -m "refactor(anthropic): use shared buildNormalizedUsage helper"
```

---

### Task 5: Update OpenAI adapter — add cache token support

**Files:**
- Modify: `src/adapters/openai.ts`
- Modify: `tests/unit/adapters/openai.test.ts`

This is the most impactful fix: OpenAI currently has zero cache awareness.

**Step 1: Add test for cache token extraction in OpenAI adapter**

Add to `tests/unit/adapters/openai.test.ts`:

```typescript
it("extracts cache tokens from prompt_tokens_details", async () => {
  mockCreate.mockResolvedValue({
    choices: [{ message: { role: "assistant", content: "Cached!" }, finish_reason: "stop" }],
    usage: {
      prompt_tokens: 10000,
      completion_tokens: 2000,
      prompt_tokens_details: { cached_tokens: 6000 },
    },
    model: "gpt-4o",
  });

  const adapter = new OpenAIAdapter({ apiKey: "sk-test" });
  const resp = await adapter.chat([{ role: "user", content: "hi" }]);

  expect(resp.usage.inputTokens).toBe(4000); // 10000 - 6000
  expect(resp.usage.outputTokens).toBe(2000);
  expect(resp.usage.cacheReadTokens).toBe(6000);
  expect(resp.usage.totalTokens).toBe(12000);
});
```

**Step 2: Update OpenAI adapter**

In `src/adapters/openai.ts`:

1. Add import: `import { buildNormalizedUsage, enrichUsage, safeJsonParse } from "./adapter-utils.js";` (remove standalone `safeJsonParse` import)
2. **Delete** the local `buildUsage` function (lines 21-29)
3. In `chat()` (around line 85), replace the inline usage with:
   ```typescript
   usage: enrichUsage(
     buildNormalizedUsage("openai", {
       prompt_tokens: response.usage?.prompt_tokens,
       completion_tokens: response.usage?.completion_tokens,
       prompt_tokens_details: (response.usage as any)?.prompt_tokens_details,
     }),
     this.capabilities.contextWindow,
     response.model,
     this.provider,
   ),
   ```
4. In `stream()` (around lines 155-158), update the usage extraction from chunks to also capture cache:
   ```typescript
   // Before the for-await loop, add:
   let cacheReadTokens: number | undefined;
   let cacheWriteTokens: number | undefined;

   // Inside the loop, after existing usage extraction:
   if (chunk.usage) {
     inputTokens = chunk.usage.prompt_tokens;
     outputTokens = chunk.usage.completion_tokens;
     const details = (chunk.usage as any)?.prompt_tokens_details;
     if (details?.cached_tokens) cacheReadTokens = details.cached_tokens;
     if (details?.cache_write_tokens) cacheWriteTokens = details.cache_write_tokens;
   }
   ```
5. Replace the final usage construction (around line 172) with:
   ```typescript
   const usage = enrichUsage(
     buildNormalizedUsage("openai", {
       prompt_tokens: inputTokens,
       completion_tokens: outputTokens,
       prompt_tokens_details: {
         cached_tokens: cacheReadTokens,
         cache_write_tokens: cacheWriteTokens,
       },
     }),
     this.capabilities.contextWindow,
     modelName,
     this.provider,
   );
   ```

**Step 3: Run OpenAI adapter tests**

Run: `pnpm vitest run tests/unit/adapters/openai.test.ts`
Expected: All PASS including new cache test

**Step 4: Commit**

```bash
git add src/adapters/openai.ts tests/unit/adapters/openai.test.ts
git commit -m "fix(openai): extract cache tokens from prompt_tokens_details, normalize inputTokens"
```

---

### Task 6: Update DeepSeek adapter — fix streaming cache loss

**Files:**
- Modify: `src/adapters/deepseek.ts`
- Modify: `tests/unit/adapters/deepseek.test.ts`

**Step 1: Add test for streaming cache token extraction**

Add to `tests/unit/adapters/deepseek.test.ts`:

```typescript
it("captures cache tokens in streaming mode", async () => {
  const chunks = [
    { choices: [{ delta: { content: "Hello" } }], model: "deepseek-v4-pro" },
    { choices: [{ delta: {}, finish_reason: "stop" }], model: "deepseek-v4-pro",
      usage: { prompt_tokens: 8000, completion_tokens: 1000, prompt_cache_hit_tokens: 5000, prompt_cache_miss_tokens: 2000 } },
  ];
  mockCreate.mockImplementation(async function* () {
    for (const chunk of chunks) yield chunk;
  });

  const adapter = new DeepSeekAdapter({ apiKey: "sk-test" });
  const events = [];
  for await (const event of adapter.stream([{ role: "user", content: "hi" }])) {
    events.push(event);
  }
  const finish = events.find((e) => e.type === "finish");
  expect(finish.usage.inputTokens).toBe(1000); // 8000 - 5000 - 2000
  expect(finish.usage.cacheReadTokens).toBe(5000);
  expect(finish.usage.cacheWriteTokens).toBe(2000);
  expect(finish.usage.totalTokens).toBe(9000);
});
```

**Step 2: Update DeepSeek adapter**

In `src/adapters/deepseek.ts`:

1. Replace import to use shared helpers: `import { buildNormalizedUsage, enrichUsage, createThinkContext, processThinkStream, safeJsonParse, stripThinkTags } from "./adapter-utils.js";`
2. **Delete** the local `buildUsage` function (lines 25-37)
3. **Delete** the local `enrichUsage` function (lines 39-53)
4. In `chat()` (around line 120), replace the usage call:
   ```typescript
   usage: enrichUsage(
     buildNormalizedUsage("deepseek", {
       prompt_tokens: response.usage?.prompt_tokens,
       completion_tokens: response.usage?.completion_tokens,
       prompt_cache_hit_tokens: (response.usage as any)?.prompt_cache_hit_tokens,
       prompt_cache_miss_tokens: (response.usage as any)?.prompt_cache_miss_tokens,
     }),
     this.capabilities.contextWindow,
     response.model,
     options?.reasoningEffort ?? REASONING_EFFORT_DEFAULT,
   ),
   ```
5. In `stream()`, before the for-await loop, add:
   ```typescript
   let cacheHitTokens: number | undefined;
   let cacheMissTokens: number | undefined;
   ```
6. Inside the for-await loop, after existing usage extraction (around line 196):
   ```typescript
   if (chunk.usage) {
     inputTokens = chunk.usage.prompt_tokens;
     outputTokens = chunk.usage.completion_tokens;
     const raw = chunk.usage as any;
     if (raw.prompt_cache_hit_tokens) cacheHitTokens = raw.prompt_cache_hit_tokens;
     if (raw.prompt_cache_miss_tokens) cacheMissTokens = raw.prompt_cache_miss_tokens;
   }
   ```
7. Replace the final usage construction (around line 217):
   ```typescript
   const usage = enrichUsage(
     buildNormalizedUsage("deepseek", {
       prompt_tokens: inputTokens,
       completion_tokens: outputTokens,
       prompt_cache_hit_tokens: cacheHitTokens,
       prompt_cache_miss_tokens: cacheMissTokens,
     }),
     this.capabilities.contextWindow,
     modelName,
     options?.reasoningEffort ?? REASONING_EFFORT_DEFAULT,
   );
   ```

**Step 3: Run DeepSeek tests**

Run: `pnpm vitest run tests/unit/adapters/deepseek.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/adapters/deepseek.ts tests/unit/adapters/deepseek.test.ts
git commit -m "fix(deepseek): capture cache tokens in streaming, normalize inputTokens"
```

---

### Task 7: Update Kimi adapter — fix streaming cache loss

**Files:**
- Modify: `src/adapters/kimi.ts`
- Modify: `tests/unit/adapters/kimi.test.ts`

**Step 1: Add test for streaming cache tokens in Kimi**

Add to `tests/unit/adapters/kimi.test.ts`:

```typescript
it("captures cache tokens in streaming mode", async () => {
  const chunks = [
    { choices: [{ delta: { content: "Hello" } }], model: "kimi-k2.6" },
    { choices: [{ delta: {}, finish_reason: "stop" }], model: "kimi-k2.6",
      usage: { prompt_tokens: 6000, completion_tokens: 800, cached_tokens: 3000 } },
  ];
  mockCreate.mockImplementation(async function* () {
    for (const chunk of chunks) yield chunk;
  });

  const adapter = new KimiAdapter({ apiKey: "sk-test" });
  const events = [];
  for await (const event of adapter.stream([{ role: "user", content: "hi" }])) {
    events.push(event);
  }
  const finish = events.find((e) => e.type === "finish");
  expect(finish.usage.inputTokens).toBe(3000); // 6000 - 3000
  expect(finish.usage.cacheReadTokens).toBe(3000);
  expect(finish.usage.totalTokens).toBe(6800);
});
```

**Step 2: Update Kimi adapter**

In `src/adapters/kimi.ts`:

1. Replace import: `import { buildNormalizedUsage, enrichUsage, createThinkContext, processThinkStream, safeJsonParse, stripThinkTags } from "./adapter-utils.js";`
2. **Delete** local `buildUsage` function (lines 30-39)
3. **Delete** local `enrichUsage` function (lines 42-56)
4. In `chat()`, replace usage construction:
   ```typescript
   usage: enrichUsage(
     buildNormalizedUsage("kimi", {
       prompt_tokens: response.usage?.prompt_tokens,
       completion_tokens: response.usage?.completion_tokens,
       cached_tokens: (response.usage as any)?.cached_tokens,
     }),
     this.capabilities.contextWindow,
     response.model,
     "kimi",
     options?.reasoningEffort,
   ),
   ```
5. In `stream()`, before the for-await loop, add:
   ```typescript
   let cachedTokens: number | undefined;
   ```
6. Inside the for-await loop, after existing usage extraction:
   ```typescript
   if (chunk.usage) {
     inputTokens = chunk.usage.prompt_tokens;
     outputTokens = chunk.usage.completion_tokens;
     const raw = chunk.usage as any;
     if (raw.cached_tokens) cachedTokens = raw.cached_tokens;
   }
   ```
7. Replace final usage construction:
   ```typescript
   const usage = enrichUsage(
     buildNormalizedUsage("kimi", {
       prompt_tokens: inputTokens,
       completion_tokens: outputTokens,
       cached_tokens: cachedTokens,
     }),
     this.capabilities.contextWindow,
     modelName,
     "kimi",
     options?.reasoningEffort,
   );
   ```

**Step 3: Run Kimi tests**

Run: `pnpm vitest run tests/unit/adapters/kimi.test.ts`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/adapters/kimi.ts tests/unit/adapters/kimi.test.ts
git commit -m "fix(kimi): capture cache tokens in streaming, normalize inputTokens"
```

---

### Task 8: Update OpenAI-Compat adapter — fix streaming cache loss

**Files:**
- Modify: `src/adapters/openai-compat.ts`

**Step 1: Update OpenAI-Compat adapter**

In `src/adapters/openai-compat.ts`:

1. Replace import: `import { buildNormalizedUsage, enrichUsage, createThinkContext, endsWithPartialTag, processThinkStream, safeJsonParse, stripThinkTags } from "./adapter-utils.js";`
2. **Delete** local `buildUsage` function (lines 26-47)
3. **Delete** local `enrichUsage` function (lines 49-65)
4. In `chat()` (around line 149), replace usage:
   ```typescript
   usage: enrichUsage(
     buildNormalizedUsage(this.provider, {
       prompt_tokens: response.usage?.prompt_tokens,
       completion_tokens: response.usage?.completion_tokens,
       prompt_cache_hit_tokens: (response.usage as any)?.prompt_cache_hit_tokens,
       prompt_cache_miss_tokens: (response.usage as any)?.prompt_cache_miss_tokens,
       cached_tokens: (response.usage as any)?.cached_tokens,
       prompt_tokens_details: (response.usage as any)?.prompt_tokens_details,
     }),
     this.capabilities.contextWindow,
     response.model,
     this.provider,
     options?.reasoningEffort,
   ),
   ```
5. In `stream()`, before the for-await loop, add:
   ```typescript
   let cacheHitTokens: number | undefined;
   let cacheMissTokens: number | undefined;
   let cachedTokens: number | undefined;
   ```
6. Inside the for-await loop, after existing usage extraction:
   ```typescript
   if (chunk.usage) {
     inputTokens = chunk.usage.prompt_tokens;
     outputTokens = chunk.usage.completion_tokens;
     const raw = chunk.usage as any;
     if (raw.prompt_cache_hit_tokens) cacheHitTokens = raw.prompt_cache_hit_tokens;
     if (raw.prompt_cache_miss_tokens) cacheMissTokens = raw.prompt_cache_miss_tokens;
     if (raw.cached_tokens) cachedTokens = raw.cached_tokens;
   }
   ```
7. Replace final usage construction:
   ```typescript
   const usage = enrichUsage(
     buildNormalizedUsage(this.provider, {
       prompt_tokens: inputTokens,
       completion_tokens: outputTokens,
       prompt_cache_hit_tokens: cacheHitTokens,
       prompt_cache_miss_tokens: cacheMissTokens,
       cached_tokens: cachedTokens,
     }),
     this.capabilities.contextWindow,
     modelName,
     this.provider,
     options?.reasoningEffort,
   );
   ```

**Step 2: Run OpenAI-Compat tests**

Run: `pnpm vitest run tests/unit/adapters/openai-compat.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/adapters/openai-compat.ts
git commit -m "fix(openai-compat): capture cache tokens in streaming, use shared helpers"
```

---

### Task 9: Update Zhipu adapter to use shared helpers

**Files:**
- Modify: `src/adapters/zhipu.ts`

**Step 1: Update Zhipu adapter**

In `src/adapters/zhipu.ts`:

1. Add import: `import { buildNormalizedUsage, enrichUsage, extractText, safeJsonParse } from "./adapter-utils.js";` (remove standalone `extractText`/`safeJsonParse` imports)
2. In `chat()` (around line 146-168), replace the inline usage object:
   ```typescript
   const baseUsage = buildNormalizedUsage("zhipu", {
     prompt_tokens: data.usage?.prompt_tokens,
     completion_tokens: data.usage?.completion_tokens,
     prompt_tokens_details: data.usage?.prompt_tokens_details,
   });
   // ...in the return:
   usage: enrichUsage(baseUsage, this.capabilities.contextWindow, data.model ?? this.id, this.provider, options?.reasoningEffort),
   ```
3. In `stream()` (around line 228), add cache miss tracking:
   ```typescript
   let cacheMissTokens: number | undefined;
   ```
   And in the usage parsing inside the loop, also check for `prompt_cache_miss_tokens` if available.
4. Replace the final usage construction (around line 333):
   ```typescript
   const usage = enrichUsage(
     buildNormalizedUsage("zhipu", {
       prompt_tokens: inputTokens,
       completion_tokens: outputTokens,
       prompt_tokens_details: { cached_tokens: cacheHitTokens > 0 ? cacheHitTokens : undefined },
     }),
     this.capabilities.contextWindow,
     modelName,
     this.provider,
     options?.reasoningEffort,
   );
   ```

**Step 2: Run Zhipu tests**

Run: `pnpm vitest run tests/unit/adapters/zhipu.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/adapters/zhipu.ts
git commit -m "refactor(zhipu): use shared buildNormalizedUsage helper"
```

---

### Task 10: Update MiniMax adapter — fix streaming cache miss tokens

**Files:**
- Modify: `src/adapters/minimax.ts`

**Step 1: Update MiniMax adapter**

In `src/adapters/minimax.ts`:

1. Add import: `import { buildNormalizedUsage, enrichUsage, extractText, safeJsonParse } from "./adapter-utils.js";`
2. In `chat()` (around line 152-172), replace inline usage:
   ```typescript
   const baseUsage = buildNormalizedUsage("minimax", {
     prompt_tokens: data.usage?.prompt_tokens,
     completion_tokens: data.usage?.completion_tokens,
     prompt_cache_hit_tokens: data.usage?.prompt_cache_hit_tokens,
     prompt_cache_miss_tokens: data.usage?.prompt_cache_miss_tokens,
   });
   // ...in the return:
   usage: enrichUsage(baseUsage, this.capabilities.contextWindow, data.model ?? this.id, this.provider, options?.reasoningEffort),
   ```
3. In `stream()`, add `cacheMissTokens` tracking alongside existing `cacheHitTokens`:
   ```typescript
   let cacheMissTokens = 0;
   ```
   In the usage parsing inside the loop:
   ```typescript
   if (parsed.usage) {
     inputTokens = parsed.usage.prompt_tokens;
     outputTokens = parsed.usage.completion_tokens;
     cacheHitTokens = parsed.usage.prompt_cache_hit_tokens ?? 0;
     cacheMissTokens = (parsed.usage as any).prompt_cache_miss_tokens ?? 0;
   }
   ```
4. Replace final usage construction:
   ```typescript
   const usage = enrichUsage(
     buildNormalizedUsage("minimax", {
       prompt_tokens: inputTokens,
       completion_tokens: outputTokens,
       prompt_cache_hit_tokens: cacheHitTokens > 0 ? cacheHitTokens : undefined,
       prompt_cache_miss_tokens: cacheMissTokens > 0 ? cacheMissTokens : undefined,
     }),
     this.capabilities.contextWindow,
     modelName,
     this.provider,
     options?.reasoningEffort,
   );
   ```

**Step 2: Run MiniMax tests**

Run: `pnpm vitest run tests/unit/adapters/minimax.test.ts`
Expected: All PASS

**Step 3: Commit**

```bash
git add src/adapters/minimax.ts
git commit -m "fix(minimax): capture cache miss tokens in streaming, use shared helpers"
```

---

### Task 11: Fix REPL contextPercent consistency

**Files:**
- Modify: `src/cli/repl.ts:322-338`

**Step 1: Fix the contextPercent fallback calculation**

In `src/cli/repl.ts`, around line 335-338, replace:

```typescript
// BEFORE (wrong — uses input + output):
statusData.contextPercent = (totalTokens / statusData.contextWindow) * 100;

// AFTER (consistent with adapters — uses inputTokens only):
statusData.contextPercent =
  statusData.contextWindow > 0
    ? Math.round((statusData.inputTokens / statusData.contextWindow) * 1000) / 10
    : null;
```

Also remove the now-unused `totalTokens` variable at line 336.

**Step 2: Run REPL tests**

Run: `pnpm vitest run tests/unit/cli/repl.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/repl.ts
git commit -m "fix(repl): use consistent contextPercent formula (inputTokens / contextWindow)"
```

---

### Task 12: Update status bar to show cache write and totalTokens

**Files:**
- Modify: `src/cli/app.ts:238-258`

**Step 1: Update the renderStatusBar method**

In `src/cli/app.ts`, update the `renderStatusBar` method to show cache write tokens and use totalTokens:

```typescript
private renderStatusBar(width: number): string {
  const d = this.statusData;
  const contextStr = d.contextPercent != null ? `${d.contextPercent.toFixed(1)}%` : "?";
  let contextColor = "37";
  if (d.contextPercent != null) {
    if (d.contextPercent > 90) contextColor = "31";
    else if (d.contextPercent > 70) contextColor = "33";
  }

  // Cache read indicator (green, dim)
  const cacheReadPart = d.cacheReadTokens != null && d.cacheReadTokens > 0
    ? ` \x1b[32m\x1b[2m↗${formatTokens(d.cacheReadTokens)}\x1b[0m`
    : "";
  // Cache write indicator (yellow, dim)
  const cacheWritePart = d.cacheWriteTokens != null && d.cacheWriteTokens > 0
    ? ` \x1b[33m\x1b[2m↘${formatTokens(d.cacheWriteTokens)}\x1b[0m`
    : "";

  const left = `\x1b[${contextColor}m↑${formatTokens(d.inputTokens)} ↓${formatTokens(d.outputTokens)}${cacheReadPart}${cacheWritePart} ${contextStr}/${formatTokens(d.contextWindow ?? 200000)}\x1b[0m`;
  const effort = d.thinkingEffort ?? "high";
  const right = `${d.provider} ${d.modelName} \x1b[90m[\x1b[37m${effort}\x1b[90m]\x1b[0m`;
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  const padding = Math.max(1, width - leftWidth - rightWidth);
  return `${left}${" ".repeat(padding)}${right}`;
}
```

This changes the display from:
```
↑12.5k ↓3.2k cache8.1k 45.2%/200k anthropic claude-sonnet-4-6 [high]
```
To:
```
↑4.4k ↓3.2k ↗8.1k ↘2.0k 3.4%/200k anthropic claude-sonnet-4-6 [high]
```

The new format is more accurate:
- `↑` = non-cache input tokens (what you actually pay full price for)
- `↓` = output tokens
- `↗` = cache read tokens (cheaper)
- `↘` = cache write tokens (one-time cost)

**Step 2: Run app tests**

Run: `pnpm vitest run tests/unit/cli/app.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/cli/app.ts
git commit -m "feat(ui): show cache write tokens and use directional arrows in status bar"
```

---

### Task 13: Full test suite verification

**Step 1: Run all adapter tests**

Run: `pnpm vitest run tests/unit/adapters/`
Expected: All PASS

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All PASS

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "chore: token usage accuracy complete — all tests passing"
```

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| `inputTokens` (OpenAI-compat) | `prompt_tokens` (includes cache) | `prompt_tokens - cacheRead - cacheWrite` |
| Cache tokens in streaming | Lost for DeepSeek, Kimi, OpenAI-Compat, MiniMax | Captured from final chunk |
| `contextPercent` | Inconsistent (input vs input+output) | Consistent: `inputTokens / contextWindow` |
| `totalTokens` | Not tracked | `input + output + cacheRead + cacheWrite` |
| Status bar | `↑ ↓ cacheX` | `↑ ↓ ↗ ↘` (input, output, cache-read, cache-write) |
| Code duplication | Each adapter has its own `buildUsage`/`enrichUsage` | Shared `buildNormalizedUsage`/`enrichUsage` in adapter-utils |
