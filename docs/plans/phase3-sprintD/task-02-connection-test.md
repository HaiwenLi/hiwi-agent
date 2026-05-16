# Task 02: Provider Connection Testing

**Files:**
- Create: `src/adapters/connection-test.ts`
- Modify: `src/cli/commands.ts`
- Create: `tests/unit/adapters/connection-test.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Adapters / Connection Testing

## Goal

Add a `/test` command that verifies connectivity to the current (or specified) LLM provider. Reports success/failure with latency and model info.

## Interface

```typescript
// src/adapters/connection-test.ts

export interface ConnectionTestResult {
  provider: string;
  model: string;
  connected: boolean;
  latencyMs: number;
  error?: string;
  modelInfo?: {
    id: string;
    contextWindow?: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
  };
}

export async function testConnection(
  registry: ProviderRegistry,
  providerName?: string,  // defaults to active provider
): Promise<ConnectionTestResult>;
```

## Behavior

1. Send a minimal chat request ("Reply with OK") to the provider
2. Measure round-trip latency
3. Report success/failure with timing
4. On success, include model capabilities from registry

## CLI Integration

```typescript
// In commands.ts, add:
{
  name: "test",
  description: "Test connection to current or specified provider",
  handler: async (ctx, args) => {
    const result = await testConnection(ctx.providerRegistry, args);
    if (result.connected) {
      return `Connected to ${result.provider}/${result.model} (${result.latencyMs}ms)`;
    }
    return `Connection failed: ${result.error}`;
  },
}
```

## Edge Cases

- API key not configured → clear message "Set ${ENV_VAR} to use this provider"
- Network timeout (10s) → report timeout
- Provider returns error → include error details
- Invalid model name → suggest available models

## Tests

- Successful connection to mock provider
- Connection failure with error message
- Timeout handling
- Missing API key detection
- Test specific provider (not just active)
