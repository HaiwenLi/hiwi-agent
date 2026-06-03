import OpenAI from "openai";
import type {
  ChatOptions,
  ChatResponse,
  ContentPart,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  TokenUsage,
  ToolDefinition,
} from "../types.js";
import { createThinkContext, endsWithPartialTag, processThinkStream, safeJsonParse, stripThinkTags } from "./adapter-utils.js";

export const OPENAI_COMPAT_MODELS: Record<string, ModelCapabilities> = {
  "abab-7": { tools: true, vision: false, maxTokens: 8_192, contextWindow: 128_000 },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 16384,
  contextWindow: 128_000,
};

function buildUsage(raw: {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  cached_tokens?: number;
}): TokenUsage {
  const inputTokens = raw.prompt_tokens ?? 0;
  const outputTokens = raw.completion_tokens ?? 0;
  // DeepSeek cache format
  const cacheHit = raw.prompt_cache_hit_tokens;
  const cacheMiss = raw.prompt_cache_miss_tokens;
  // Kimi cache format
  const cached = raw.cached_tokens;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheHit ?? cached,
    cacheWriteTokens: cacheMiss,
  };
}

function enrichUsage(
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
      contextWindow > 0 ? Math.round((usage.inputTokens / contextWindow) * 100) : null,
    modelName,
    provider,
    thinkingEffort,
  };
}

export class OpenAICompatAdapter implements ModelAdapter {
  id: string;
  readonly provider: string;
  capabilities: ModelCapabilities;
  private client: OpenAI;
  private lastUsage: TokenUsage | undefined;

  constructor(options: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }) {
    this.id = options.model ?? "gpt-4o";
    this.provider = options.provider;
    this.capabilities = OPENAI_COMPAT_MODELS[this.id] ?? DEFAULT_CAPABILITIES;
    this.client = new OpenAI({
      apiKey: options.apiKey ?? "sk-placeholder",
      baseURL: options.baseUrl,
    });
  }

  setModel(modelId: string): void {
    this.id = modelId;
    this.capabilities = OPENAI_COMPAT_MODELS[modelId] ?? DEFAULT_CAPABILITIES;
  }

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
    };

    if (options?.thinking || options?.reasoningEffort) {
      params.extra_body = {};
      if (options?.thinking) {
        (params.extra_body as Record<string, unknown>).thinking = options.thinking;
      }
      if (options?.reasoningEffort) {
        (params.extra_body as Record<string, unknown>).reasoning_effort = options.reasoningEffort;
      }
    }

    if (options?.responseFormat) {
      params.response_format = options.responseFormat;
    }
    if (options?.toolChoice) {
      params.tool_choice = options.toolChoice;
    }

    const response = await this.client.chat.completions.create(
      params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
      { signal },
    );

    const choice = response.choices[0];
    const tc = choice.message.tool_calls ?? [];
    const raw = choice.message as unknown as Record<string, unknown>;
    const reasoningContent = (raw.reasoning_content as string) ?? "";
    let content = choice.message.content ?? "";
    const strippedContent = stripThinkTags(content);
    const thinkContent = strippedContent.thinkContent;
    content = strippedContent.cleanContent;

    // If content was wrapped in  tags (e.g. DeepSeek R1 style without reasoning_content),
    // yield the think content as reasoning for the UI to render specially
    // The final content stored should be the clean content without  tags

    const mergedReasoningContent = [reasoningContent, thinkContent].filter(Boolean).join("\n");

    return {
      content,
      reasoningContent: mergedReasoningContent || undefined,
      toolCalls: tc.map((t) => ({
        id: t.id,
        name: t.function.name,
        input: safeJsonParse(t.function.arguments),
      })),
      finishReason: choice.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: enrichUsage(
        buildUsage(response.usage ?? {}),
        this.capabilities.contextWindow,
        response.model,
        this.provider,
        options?.reasoningEffort,
      ),
    };
  }

  async *stream(messages: Message[], options?: ChatOptions, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      stream: true,
    };

    if (options?.thinking || options?.reasoningEffort) {
      params.extra_body = {};
      if (options?.thinking) {
        (params.extra_body as Record<string, unknown>).thinking = options.thinking;
      }
      if (options?.reasoningEffort) {
        (params.extra_body as Record<string, unknown>).reasoning_effort = options.reasoningEffort;
      }
    }

    if (options?.responseFormat) {
      params.response_format = options.responseFormat;
    }
    if (options?.toolChoice) {
      params.tool_choice = options.toolChoice;
    }

    const stream = await this.client.chat.completions.create(
      params as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
      { signal },
    );

    // Accumulate streaming tool call fragments
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let modelName = this.id;
    let finishReason = "stop";
    let inputTokens = 0;
    let outputTokens = 0;
    const thinkCtx = createThinkContext();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
      if ((delta as any)?.reasoning_content) {
        yield { type: "reasoning-delta", text: (delta as any).reasoning_content as string };
      }
      if (delta?.content) {
        for (const event of processThinkStream(delta.content as string, thinkCtx)) {
          yield event;
        }
      }
      if (delta?.tool_calls) {
        for (let ti = 0; ti < (delta.tool_calls as unknown[]).length; ti++) {
          const tc = (delta.tool_calls as unknown[])[ti] as Record<string, unknown>;
          // Use server-provided index if available, otherwise fall back to array position
          const idx = typeof tc.index === "number" ? tc.index : ti;
          let entry = toolCallMap.get(idx);
          if (!entry) {
            entry = {
              id: (tc.id as string) ?? "",
              name: (tc.function as any)?.name ?? "",
              arguments: "",
            };
            toolCallMap.set(idx, entry);
          }
          if (tc.id) entry.id = tc.id as string;
          if ((tc.function as any)?.name) entry.name = (tc.function as any).name;
          if ((tc.function as any)?.arguments) entry.arguments += (tc.function as any).arguments;
        }
      }
      if (chunk.model) {
        modelName = chunk.model;
      }
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    if (thinkCtx.thinkBuffer) {
      yield { type: thinkCtx.thinkMode ? "reasoning-delta" : "text-delta", text: thinkCtx.thinkBuffer };
    }

    // Emit accumulated tool calls
    for (const [, tc] of toolCallMap) {
      yield {
        type: "tool-call",
        toolCall: {
          id: tc.id,
          name: tc.name,
          input: safeJsonParse(tc.arguments),
        },
      };
    }

    const usage = enrichUsage(
      buildUsage({ prompt_tokens: inputTokens, completion_tokens: outputTokens }),
      this.capabilities.contextWindow,
      modelName,
      this.provider,
      options?.reasoningEffort,
    );
    this.lastUsage = usage;
    yield {
      type: "finish",
      finishReason: finishReason === "tool_calls" ? "tool-calls" : "stop",
      usage,
    };
  }

  getUsage(): TokenUsage | undefined {
    return this.lastUsage;
  }

  private convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.ChatCompletionMessageParam => {
      switch (msg.role) {
        case "system":
          return {
            role: "system",
            content:
              typeof msg.content === "string"
                ? msg.content
                : msg.content.map((p) => (p.type === "text" ? p.text : "")).join(""),
          };
        case "user": {
          const userContent = this.mapContent(msg.content);
          return { role: "user", content: userContent };
        }
        case "assistant": {
          const assistantContent = msg.content
            ? typeof msg.content === "string"
              ? msg.content
              : this.mapContentParts(msg.content)
            : null;
          const msgBase: Record<string, unknown> = {
            role: "assistant",
            content: assistantContent,
          };
          if (msg.reasoningContent) {
            msgBase.reasoning_content = msg.reasoningContent;
          }
          if (msg.toolCalls?.length) {
            msgBase.tool_calls = msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            }));
          }
          return msgBase as unknown as OpenAI.ChatCompletionMessageParam;
        }
        case "tool":
          return {
            role: "tool",
            content: typeof msg.content === "string" ? msg.content : "",
            tool_call_id: msg.toolCallId ?? "",
          };
      }
    });
  }

  private convertTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
        ...(t.strict !== undefined ? { strict: t.strict } : {}),
      },
    }));
  }

  private mapContent(content: string | ContentPart[]): string | OpenAI.ChatCompletionContentPart[] {
    if (typeof content === "string") return content;
    return this.mapContentParts(content);
  }

  private mapContentParts(parts: ContentPart[]): OpenAI.ChatCompletionContentPart[] {
    return parts.map((p) => {
      if (p.type === "text") return p as OpenAI.ChatCompletionContentPartText;
      return p as OpenAI.ChatCompletionContentPartImage;
    });
  }
}
