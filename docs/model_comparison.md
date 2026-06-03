# Model API Feature Coverage Matrix

> Generated 2026-06-03 | Based on current API docs from DeepSeek, Kimi, Zhipu (GLM), Anthropic, MiniMax, Ollama

---

## 1. Capability Summary

| Model | Tools | Vision | Context Window | Max Output Tokens |
|-------|-------|--------|---------------|-------------------|
| deepseek-v4-pro[1m] | ✅ | ❌ | 1,000,000 | 384,000 |
| deepseek-v4-pro | ✅ | ❌ | 1,000,000 | 384,000 |
| deepseek-v4-flash | ✅ | ❌ | 1,000,000 | 384,000 |
| deepseek-v3 (deprecated) | ✅ | ❌ | 128,000 | 8,192 |
| deepseek-r1 (deprecated) | ✅ | ❌ | 128,000 | 8,192 |
| kimi-k2.6 | ✅ | ✅ | 262,000 | 33,000 |
| kimi-k2.5 | ✅ | ✅ | 262,000 | 33,000 |
| kimi-k2-thinking | ✅ | ❌ | 262,000 | 33,000 |
| gpt-4o | ✅ | ✅ | 128,000 | 16,384 |
| gpt-4o-mini | ✅ | ✅ | 128,000 | 16,384 |
| glm-4-plus | ✅ | ✅ | 128,000 | 8,192 |
| glm-4-flash | ✅ | ✅ | 128,000 | 4,096 |
| moonshot-v1-128k | ✅ | ❌ | 200,000 | 8,192 |
| abab-7 | ✅ | ❌ | 128,000 | 8,192 |

---

## 2. Thinking / Reasoning

| Feature | DeepSeek V4 | Kimi K2.x | GLM | Anthropic |
|---------|-------------|-----------|-----|-----------|
| **Thinking toggle** | `thinking: {type:"enabled"/"disabled"}` via `extra_body` | `thinking: {type:"enabled", keep:"all"}` (hardcoded for k2.6) | ❌ | `thinking: {type:"enabled", budget_tokens}` |
| **Reasoning effort** | `reasoning_effort`: `low`/`medium`/`high`/`max` | ❌ | ❌ | N/A |
| **Stream reasoning content** | `delta.reasoning_content` | ❌ | ❌ | `delta.thinking` |
| **Non-stream reasoning** | `message.reasoning_content` | ❌ | ❌ | `content[*].thinking` |
| **Think tag support** | `...` in content (legacy R1) | ❌ | ❌ | ❌ |
| **Multi-turn requirement** | MUST pass `reasoning_content` back in subsequent requests (400 error otherwise) | N/A | N/A | N/A |
| **Temp/top_p restrictions** | Not supported when thinking enabled (silently ignored) | None | N/A | N/A |

### Effort Mapping (DeepSeek V4)

| UI Label | `reasoning_effort` value |
|----------|--------------------------|
| low | `low` |
| medium | `high` |
| high | `high` |
| max | `max` |

---

## 3. Structured / JSON Output

| Feature | DeepSeek | Kimi | Zhipu (GLM) | MiniMax | Anthropic | OpenAI |
|---------|----------|------|-------------|---------|-----------|--------|
| `response_format: {type:"text"}` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `response_format: {type:"json_object"}` | ✅ | ✅ | ✅ (glm-4.7+) | Likely ✅ | ✅ | ✅ |
| `response_format: {type:"json_schema"}` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `strict` on tool definitions | ✅ (Beta) | ❌ | ❌ | ❌ | ❌ | ✅* |
| `tool_choice` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

\* OpenAI uses `strict: true` within `json_schema` response_format, not on tools.

### Provider-Specific Quirks

| Provider | Quirk |
|----------|-------|
| **DeepSeek** | `json_object` may occasionally return empty content — prompt must include "json" keyword + example format. `strict` mode requires `base_url="https://api.deepseek.com/beta"`, enforces `additionalProperties: false`, all properties `required`; `minLength`/`maxLength`/`minItems`/`maxItems` unsupported |
| **Kimi** | Only generates JSON Object (never JSON Array). Must describe expected format in system/user prompt |
| **Zhipu** | Schema enforcement is prompt-based only — no API-level `json_schema`. Recommends client-side validation |
| **Anthropic** | `tool_choice` enum differs: `auto`/`any`/`tool` vs OpenAI's `auto`/`none`/`required` |

### DeepSeek `strict` JSON Schema Restrictions

| Supported | Unsupported |
|-----------|-------------|
| `object`, `string`, `number`, `integer`, `boolean`, `array`, `enum` | `minLength`, `maxLength` |
| `anyOf`, `$ref`, `$def` | `minItems`, `maxItems` |
| | `additionalProperties` (must be `false`), all properties must be `required` |

---

## 4. Multi-Turn Conversation

| Requirement | DeepSeek | Kimi | Others |
|-------------|----------|------|--------|
| **Append assistant message each turn** | ✅ Required | ✅ Required | ✅ Required |
| **Pass `reasoning_content` backward** | ✅ CRITICAL (400 if missing) | ❌ Not applicable | ❌ Not applicable |
| **Tool-call message format** | OpenAI-compat `tool_calls[]` | OpenAI-compat `tool_calls[]` | OpenAI-compat |
| **Tool result format** | `{role:"tool", tool_call_id, content}` | Same | Same |
| **Multi-system messages** | Tolerated (typically merged) | Tolerated | Varies |
| **`name` field on messages** | Optional | Optional | Optional |

### Current Codebase Gap

The `agent.ts` normal completion path (no tool calls) **does not push the final assistant message** to `currentMessages`, nor yield the `messages` event. This causes:
- Multi-turn conversation history loss (all providers)
- DeepSeek `reasoning_content` loss across turns → 400 errors

---

## 5. Multimodal / Vision

| Feature | DeepSeek | Kimi | Zhipu (GLM) | MiniMax | Anthropic | OpenAI |
|---------|----------|------|-------------|---------|-----------|--------|
| **Vision support** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Content part format** | N/A | `{type:"image_url", image_url:{url}}` | Same | Same | `{type:"image", source:{type:"base64", media_type, data}}` | `{type:"image_url", image_url:{url}}` |
| **Base64 images** | N/A | ✅ | ✅ | ✅ | ✅ | ✅ |
| **URL images** | N/A | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Video support** | N/A | `video_url` type | ❌ | ❌ | ❌ | ❌ |
| **File ID uploads** | N/A | `ms://<file_id>` | ❌ | ❌ | ❌ | ❌ |
| **Supported image types** | N/A | Standard (jpeg/png/gif/webp) | Standard | Standard | jpeg/png/gif/webp | Standard |

### Wire Format Comparison

**OpenAI-compat (Kimi, GLM, MiniMax, GPT-4o):**
```json
{
  "content": [
    { "type": "text", "text": "Describe this image" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBOR..." } }
  ]
}
```

**Anthropic (Claude):**
```json
{
  "content": [
    { "type": "text", "text": "Describe this image" },
    { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "iVBOR..." } }
  ]
}
```

### Current Codebase Gap

`Message.content` is typed as `string` — cannot hold `ContentPart[]` arrays. All 6 adapters' `convertMessages()` blindly map content to string. Zero tools produce/encode images. The `vision: true` capability flag on 15+ models is purely informational.

---

## 6. Codebase Implementation Status

| Capability | `types.ts` | `openai-compat.ts` | `anthropic.ts` | `zhipu.ts` | `minimax.ts` | `ollama.ts` |
|------------|------------|--------------------|----------------|------------|-------------|-------------|
| **Thinking params** | ✅ `ChatOptions.thinking` + `reasoningEffort` | ✅ `extra_body` | N/A | N/A | N/A | N/A |
| **Think tag parsing** | N/A | ✅ `stripThinkTags()` in stream + non-stream | N/A | N/A | N/A | N/A |
| **reasoning_content passback** | ✅ `Message.reasoningContent` | ✅ `convertMessages()` includes it | N/A | N/A | N/A | N/A |
| **responseFormat** | ❌ Missing | ❌ Not passed | ❌ Not passed | ❌ Not passed | ❌ Not passed | ❌ Not passed |
| **strict tools** | ❌ Missing from `ToolDefinition` | ❌ Not implemented | N/A | N/A | N/A | N/A |
| **toolChoice** | ❌ Missing from `ChatOptions` | ❌ Not passed | ❌ Not passed | ❌ Not passed | ❌ Not passed | ❌ Not passed |
| **Vision content parts** | ❌ `ContentPart` types missing | ❌ Not implemented | ❌ Not implemented | ❌ Not implemented | ❌ Not implemented | ❌ Not implemented |
| **Multi-turn msg persistence** | N/A | N/A | N/A | N/A | N/A | N/A |

---

## 7. Recommended Implementation Order

| Priority | Task | Effort |
|----------|------|--------|
| **P0** | Fix `agent.ts` normal completion path — push assistant message + yield `messages` event (restores multi-turn across all providers) | Small |
| **P1** | Add `responseFormat` to `ChatOptions` + wire in `openai-compat.ts` (covers DeepSeek/Kimi) | Medium |
| **P1** | Add `strict` to `ToolDefinition` + wire in `openai-compat.ts` (DeepSeek Beta) | Medium |
| **P2** | Refactor `Message.content` to `string \| ContentPart[]` + add vision content part types | Large |
| **P2** | Update all adapters' `convertMessages()` for vision content parts | Large |
| **P2** | Add `toolChoice` to `ChatOptions` + wire in adapters | Small |
| **P3** | Add `read_image` tool (file → base64 → content part) | Medium |
| **P3** | Provider-specific quirk handling (DeepSeek empty content, Kimi object-only) | Small |
| **P4** | Anthropic `tool_choice` translation layer | Small |
