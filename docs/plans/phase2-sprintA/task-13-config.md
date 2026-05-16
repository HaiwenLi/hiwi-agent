### Task 13: Config Additions for System Prompt

**Files:**
- Modify: `src/types.ts` (add SystemPromptConfig to AgentConfig)
- Modify: `src/core/config.ts` (add schema and defaults)
- Test: `tests/unit/core/config.test.ts` (extend existing)

**Context:** Add optional `systemPrompt` section to config so users can override the prompt variant (`auto`, `anthropic`, `gpt`, `default`).

---

**Step 1: Write the failing tests**

Add to `tests/unit/core/config.test.ts` (extend existing config tests):

```typescript
describe("systemPrompt config", () => {
  it("accepts systemPrompt.providerVariant", async () => {
    const globalDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-cfg-"));
    await fs.writeFile(
      path.join(globalDir, "config.json"),
      JSON.stringify({
        systemPrompt: { providerVariant: "anthropic" },
      }),
    );

    const result = await loadConfig(globalDir);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect((result.value as any).systemPrompt?.providerVariant).toBe("anthropic");
    }

    await fs.rm(globalDir, { recursive: true, force: true });
  });

  it("defaults to auto when not specified", async () => {
    const globalDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-cfg-"));
    const result = await loadConfig(globalDir);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect((result.value as any).systemPrompt).toBeUndefined();
    }

    await fs.rm(globalDir, { recursive: true, force: true });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/config.test.ts`
Expected: FAIL — `systemPrompt` not in config type

**Step 3: Add SystemPromptConfig to types**

In `src/types.ts`, add before `AgentConfig`:

```typescript
export interface SystemPromptConfig {
  providerVariant?: "auto" | "anthropic" | "gpt" | "default";
}
```

Update `AgentConfig`:

```typescript
export interface AgentConfig {
  activeProvider: string;
  activeModel: string;
  providers: Record<string, ProviderConfig>;
  agent: AgentLoopConfig;
  systemPrompt?: SystemPromptConfig;
}
```

**Step 4: Add schema to config.ts**

In `src/core/config.ts`, add:

```typescript
const SystemPromptConfigSchema = z.object({
  providerVariant: z.enum(["auto", "anthropic", "gpt", "default"]).optional(),
}).optional();
```

Update `AgentConfigPartialSchema`:

```typescript
const AgentConfigPartialSchema = z.object({
  activeProvider: z.string().optional(),
  activeModel: z.string().optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  agent: z.object({
    maxLoops: z.number().optional(),
    maxOutputTokensPerTurn: z.number().optional(),
    budgetTotal: z.number().optional(),
    refundableTools: z.array(z.string()).optional(),
    streaming: z.boolean().optional(),
    interruptible: z.boolean().optional(),
  }).optional(),
  systemPrompt: z.object({
    providerVariant: z.enum(["auto", "anthropic", "gpt", "default"]).optional(),
  }).optional(),
});
```

Update `deepMerge` to handle `systemPrompt`:

```typescript
if (override.systemPrompt !== undefined)
  result.systemPrompt = { ...base.systemPrompt, ...(override.systemPrompt as Partial<SystemPromptConfig>) };
```

Import `SystemPromptConfig` type:

```typescript
import type { AgentConfig, AgentLoopConfig, ProviderConfig, SystemPromptConfig } from "../types.js";
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/config.test.ts`
Expected: PASS

**Step 6: Run full suite**

Run: `pnpm vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/types.ts src/core/config.ts tests/unit/core/config.test.ts
git commit -m "feat: add systemPrompt config with providerVariant option"
```
