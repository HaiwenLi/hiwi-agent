# Task 05: Dedicated MiniMax Adapter

**Files:**
- Create: `src/adapters/minimax.ts`
- Create: `tests/unit/adapters/minimax.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Adapters / Providers

## Goal

Create a dedicated adapter for MiniMax models with MiniMax-specific error handling and model capabilities.

## Rationale for Dedicated Adapter

- MiniMax uses a different API structure for group chat vs single chat
- Unique error codes and retry strategies
- MiniMax-specific rate limiting (per-group quotas)
- Some models support function calling, others don't

## Interface

```typescript
// src/adapters/minimax.ts

export const MINIMAX_MODELS: Record<string, ModelCapabilities> = {
  "abab6.5s-chat":  { tools: true,  vision: false, maxTokens: 4096, contextWindow: 245_000 },
  "abab6.5g-chat":  { tools: true,  vision: false, maxTokens: 4096, contextWindow: 128_000 },
  "abab6.5t-chat":  { tools: false, vision: false, maxTokens: 4096, contextWindow: 16_384 },
  "abab5.5-chat":   { tools: false, vision: false, maxTokens: 4096, contextWindow: 16_384 },
};

export class MiniMaxAdapter implements ModelAdapter {
  constructor(config: { apiKey: string; groupId?: string; baseUrl?: string; model?: string });

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  async streamChat(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  listModels(): ModelCapabilities[];
}
```

## MiniMax-Specific Behavior

- Group ID support for team/org billing
- Different endpoint for streaming vs non-streaming
- Token counting follows MiniMax's tokenizer (different from GPT)
- Retry strategy tuned for MiniMax's rate limit headers

## Integration

```typescript
// In provider registry setup:
registry.register("minimax", () => new MiniMaxAdapter({
  apiKey: resolveApiKey("MINIMAX_API_KEY"),
  groupId: process.env.MINIMAX_GROUP_ID,
  baseUrl: "https://api.minimax.chat/v1/text/chatcompletion_v2",
}));
```

## Edge Cases

- Missing group ID → use default (single user mode)
- Rate limit with retry-after header → auto-retry
- Model not available in group → clear error
- Streaming interruption → clean partial response

## Tests

- Chat with MiniMax model (mock API)
- Stream chat with chunks
- Handle rate limiting with retry
- Group ID header included in requests
- List available models with capabilities
- Handle missing group ID gracefully
