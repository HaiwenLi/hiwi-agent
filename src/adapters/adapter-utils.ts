import type { TokenUsage, ContentPart } from "../types.js";

export function extractText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function safeJsonParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function stripThinkTags(text: string): { thinkContent: string; cleanContent: string } {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let thinkContent = "";
  const cleanContent = text
    .replace(thinkRegex, (_, content) => {
      thinkContent += content;
      return "";
    })
    .trim();
  return { thinkContent, cleanContent };
}

export function endsWithPartialTag(buffer: string, tag: string): boolean {
  for (let len = 1; len < tag.length; len++) {
    if (buffer.endsWith(tag.substring(0, len))) return true;
  }
  return false;
}

export interface StreamingThinkContext {
  thinkMode: boolean;
  thinkBuffer: string;
}

export function createThinkContext(): StreamingThinkContext {
  return { thinkMode: false, thinkBuffer: "" };
}

export function* processThinkStream(
  deltaContent: string,
  ctx: StreamingThinkContext,
): Generator<{ type: "text-delta" | "reasoning-delta"; text: string }> {
  ctx.thinkBuffer += deltaContent;
  while (ctx.thinkBuffer) {
    if (ctx.thinkMode) {
      const closeIdx = ctx.thinkBuffer.indexOf("</think>");
      if (closeIdx >= 0) {
        if (closeIdx > 0) {
          yield { type: "reasoning-delta", text: ctx.thinkBuffer.substring(0, closeIdx) };
        }
        ctx.thinkBuffer = ctx.thinkBuffer.substring(closeIdx + 8);
        ctx.thinkMode = false;
      } else if (endsWithPartialTag(ctx.thinkBuffer, "</think>")) {
        break;
      } else {
        yield { type: "reasoning-delta", text: ctx.thinkBuffer };
        ctx.thinkBuffer = "";
      }
    } else {
      const openIdx = ctx.thinkBuffer.indexOf("<think>");
      if (openIdx >= 0) {
        if (openIdx > 0) {
          yield { type: "text-delta", text: ctx.thinkBuffer.substring(0, openIdx) };
        }
        ctx.thinkBuffer = ctx.thinkBuffer.substring(openIdx + 7);
        ctx.thinkMode = true;
      } else if (endsWithPartialTag(ctx.thinkBuffer, "<think>")) {
        break;
      } else {
        yield { type: "text-delta", text: ctx.thinkBuffer };
        ctx.thinkBuffer = "";
      }
    }
  }
}

// ─── Token Usage Normalization ──────────────────────────────

export interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  cached_tokens?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

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
    const promptTokens = raw.prompt_tokens ?? 0;
    outputTokens = raw.completion_tokens ?? 0;

    cacheReadTokens =
      raw.prompt_tokens_details?.cached_tokens ??
      raw.prompt_cache_hit_tokens ??
      raw.cached_tokens;

    cacheWriteTokens =
      raw.prompt_tokens_details?.cache_write_tokens ??
      raw.prompt_cache_miss_tokens;

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
        ? Math.round((usage.inputTokens / contextWindow) * 1000) / 10
        : null,
    modelName,
    provider,
    thinkingEffort,
  };
}
