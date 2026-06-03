import OpenAI from "openai";
import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  TokenUsage,
  ToolDefinition,
} from "../types.js";
import { buildNormalizedUsage, createThinkContext, enrichUsage, endsWithPartialTag, processThinkStream, safeJsonParse, stripThinkTags } from "./adapter-utils.js";

export const DEEPSEEK_MODELS: Record<string, ModelCapabilities> = {
  "deepseek-v4-pro": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1_000_000 },
  "deepseek-v4-flash": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1_000_000 },
  "deepseek-v4-pro[1m]": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1_000_000 },
};

const DEFAULT_MODEL = "deepseek-v4-pro";

const THINKING_DEFAULT = { type: "enabled" as const };
const REASONING_EFFORT_DEFAULT = "high";

export class DeepSeekAdapter implements ModelAdapter {
  id: string;
  readonly provider = "deepseek";
  capabilities: ModelCapabilities;
  private client: OpenAI;
  private lastUsage: TokenUsage | undefined;

  constructor(options: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.id = options.model ?? DEFAULT_MODEL;
    this.capabilities = DEEPSEEK_MODELS[this.id] ?? DEEPSEEK_MODELS[DEFAULT_MODEL];
    if (!options.apiKey) throw new Error("No API key configured for DeepSeek provider. Set DEEPSEEK_API_KEY or add apiKey to config.");
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? "https://api.deepseek.com",
    });
  }

  setModel(modelId: string): void {
    this.id = modelId;
    this.capabilities = DEEPSEEK_MODELS[modelId] ?? DEEPSEEK_MODELS[DEFAULT_MODEL];
  }

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
    };

    params.extra_body = {};
    (params.extra_body as Record<string, unknown>).thinking =
      options?.thinking ?? THINKING_DEFAULT;
    (params.extra_body as Record<string, unknown>).reasoning_effort =
      options?.reasoningEffort ?? REASONING_EFFORT_DEFAULT;

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
    const stripped = stripThinkTags(content);
    const mergedReasoning = [reasoningContent, stripped.thinkContent].filter(Boolean).join("\n");

    return {
      content: stripped.cleanContent,
      reasoningContent: mergedReasoning || undefined,
      toolCalls: tc.map((t) => ({
        id: t.id,
        name: t.function.name,
        input: safeJsonParse(t.function.arguments),
      })),
      finishReason: choice.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: enrichUsage(
        buildNormalizedUsage("deepseek", {
          prompt_tokens: response.usage?.prompt_tokens,
          completion_tokens: response.usage?.completion_tokens,
          prompt_cache_hit_tokens: (response.usage as any)?.prompt_cache_hit_tokens,
          prompt_cache_miss_tokens: (response.usage as any)?.prompt_cache_miss_tokens,
        }),
        this.capabilities.contextWindow,
        response.model,
        this.provider,
        options?.reasoningEffort ?? REASONING_EFFORT_DEFAULT,
      ),
    };
  }

  async *stream(messages: Message[], options?: ChatOptions, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      stream: true,
    };

    params.extra_body = {};
    (params.extra_body as Record<string, unknown>).thinking =
      options?.thinking ?? THINKING_DEFAULT;
    (params.extra_body as Record<string, unknown>).reasoning_effort =
      options?.reasoningEffort ?? REASONING_EFFORT_DEFAULT;

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

    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let modelName = this.id;
    let finishReason = "stop";
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheHitTokens: number | undefined;
    let cacheMissTokens: number | undefined;
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
        for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
          const idx = tc.index as number;
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
        const raw = chunk.usage as any;
        if (raw.prompt_cache_hit_tokens) cacheHitTokens = raw.prompt_cache_hit_tokens;
        if (raw.prompt_cache_miss_tokens) cacheMissTokens = raw.prompt_cache_miss_tokens;
      }
    }

    if (thinkCtx.thinkBuffer) {
      yield { type: thinkCtx.thinkMode ? "reasoning-delta" : "text-delta", text: thinkCtx.thinkBuffer };
    }

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
      buildNormalizedUsage("deepseek", {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        prompt_cache_hit_tokens: cacheHitTokens,
        prompt_cache_miss_tokens: cacheMissTokens,
      }),
      this.capabilities.contextWindow,
      modelName,
      this.provider,
      options?.reasoningEffort ?? REASONING_EFFORT_DEFAULT,
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
          const userContent = typeof msg.content === "string" ? msg.content : msg.content;
          return { role: "user", content: userContent as string | OpenAI.ChatCompletionContentPart[] };
        }
        case "assistant": {
          const assistantContent = msg.content
            ? typeof msg.content === "string"
              ? msg.content
              : msg.content
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
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
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
}
