# Task 04: Dedicated Zhipu/GLM Adapter

**Files:**
- Create: `src/adapters/zhipu.ts`
- Create: `tests/unit/adapters/zhipu.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Adapters / Providers

## Goal

Create a dedicated adapter for Zhipu/GLM models with GLM-specific error handling, model capabilities, and streaming behavior. Currently covered generically by OpenAI-compat adapter, but GLM models have quirks worth handling explicitly.

## Rationale for Dedicated Adapter

- GLM-4 models have unique error codes (1301/sensitive content, 1215/invalid token)
- Different rate limiting headers and retry strategy
- GLM-specific model capabilities (some support function calling, some don't)
- Custom system prompt handling (GLM has specific instructions for tool use)

## Interface

```typescript
// src/adapters/zhipu.ts

export const ZHIPU_MODELS: Record<string, ModelCapabilities> = {
  "glm-4-plus":   { tools: true,  vision: true,  maxTokens: 4096, contextWindow: 128_000 },
  "glm-4-flash":  { tools: true,  vision: false, maxTokens: 4096, contextWindow: 128_000 },
  "glm-4":        { tools: true,  vision: true,  maxTokens: 4096, contextWindow: 128_000 },
  "glm-4v":       { tools: false, vision: true,  maxTokens: 4096, contextWindow: 8_192 },
  "glm-3-turbo":  { tools: true,  vision: false, maxTokens: 4096, contextWindow: 32_000 },
};

export class ZhipuAdapter implements ModelAdapter {
  constructor(config: { apiKey: string; baseUrl?: string; model?: string });

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  async streamChat(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
  listModels(): ModelCapabilities[];
}
```

## GLM-Specific Error Handling

```typescript
// Zhipu error codes → user-friendly messages
const GLM_ERRORS: Record<number, string> = {
  1301: "Content filtered by safety system. Rephrase your request.",
  1215: "Invalid or expired API token. Check ZHIPU_API_KEY.",
  1234: "Rate limited. Wait and retry.",
};
```

## Integration

```typescript
// In provider registry setup:
registry.register("zhipu", () => new ZhipuAdapter({
  apiKey: resolveApiKey("ZHIPU_API_KEY"),
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
}));
```

## Edge Cases

- Sensitive content filtering (code snippet with security keywords) → clear message
- Token expiration mid-session → auto-refresh if possible
- Model not found → suggest available models
- Vision model without image → proceed as text-only

## Tests

- Chat with GLM model (mock API)
- Stream chat with chunks
- Handle sensitive content error (1301)
- Handle invalid token error (1215)
- List available models with capabilities
- Vision model capability flag
