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

export const DEEPSEEK_MODELS: Record<string, ModelCapabilities> = {
  "deepseek-v4-pro": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1_000_000 },
  "deepseek-v4-flash": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1_000_000 },
  "deepseek-v4-pro[1m]": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1_000_000 },
};

const DEFAULT_MODEL = "deepseek-v4-pro";

const THINKING_DEFAULT = { type: "enabled" as const };
const REASONING_EFFORT_DEFAULT = "high";

function stripThinkTags(text: string): { thinkContent: string; cleanContent: string } {
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

function endsWithPartialTag(buffer: string, tag: string): boolean {
  for (let len = 1; len < tag.length; len++) {
    if (buffer.endsWith(tag.substring(0, len))) return true;
  }
  return false;
}

function buildUsage(raw: {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}): TokenUsage {
  return {
    inputTokens: raw.prompt_tokens ?? 0,
    outputTokens: raw.completion_tokens ?? 0,
    cacheReadTokens: raw.prompt_cache_hit_tokens,
    cacheWriteTokens: raw.prompt_cache_miss_tokens,
  };
}

function enrichUsage(
  usage: TokenUsage,
  contextWindow: number,
  modelName: string,
  thinkingEffort?: string,
): TokenUsage {
  return {
    ...usage,
    contextWindow,
    contextPercent: contextWindow > 0 ? Math.round((usage.inputTokens / contextWindow) * 100) : null,
    modelName,
    provider: "deepseek",
    thinkingEffort,
  };
}

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
        input: (() => { try { return JSON.parse(t.function.arguments); } catch { return {}; } })(),
      })),
      finishReason: choice.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: enrichUsage(
        buildUsage(response.usage ?? {}),
        this.capabilities.contextWindow,
        response.model,
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
    let thinkMode = false;
    let thinkBuffer = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
      if ((delta as any)?.reasoning_content) {
        yield { type: "reasoning-delta", text: (delta as any).reasoning_content as string };
      }
      if (delta?.content) {
        thinkBuffer += delta.content as string;
        while (thinkBuffer) {
          if (thinkMode) {
            const closeIdx = thinkBuffer.indexOf("</think>");
            if (closeIdx >= 0) {
              yield { type: "reasoning-delta", text: thinkBuffer.substring(0, closeIdx) };
              thinkBuffer = thinkBuffer.substring(closeIdx + 8);
              thinkMode = false;
            } else if (endsWithPartialTag(thinkBuffer, "</think>")) {
              break;
            } else {
              yield { type: "reasoning-delta", text: thinkBuffer };
              thinkBuffer = "";
            }
          } else {
            const openIdx = thinkBuffer.indexOf("<think>");
            if (openIdx >= 0) {
              if (openIdx > 0) {
                yield { type: "text-delta", text: thinkBuffer.substring(0, openIdx) };
              }
              thinkBuffer = thinkBuffer.substring(openIdx + 7);
              thinkMode = true;
            } else if (endsWithPartialTag(thinkBuffer, "<think>")) {
              break;
            } else {
              yield { type: "text-delta", text: thinkBuffer };
              thinkBuffer = "";
            }
          }
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
      }
    }

    if (thinkBuffer) {
      yield { type: thinkMode ? "reasoning-delta" : "text-delta", text: thinkBuffer };
    }

    for (const [, tc] of toolCallMap) {
      yield {
        type: "tool-call",
        toolCall: {
          id: tc.id,
          name: tc.name,
          input: (() => { try { return JSON.parse(tc.arguments || "{}"); } catch { return {}; } })(),
        },
      };
    }

    const usage = enrichUsage(
      buildUsage({ prompt_tokens: inputTokens, completion_tokens: outputTokens }),
      this.capabilities.contextWindow,
      modelName,
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
