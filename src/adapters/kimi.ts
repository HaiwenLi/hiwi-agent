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

export const KIMI_MODELS: Record<string, ModelCapabilities> = {
  "kimi-k2.6": { tools: true, vision: true, maxTokens: 32_000, contextWindow: 262_144 },
  "kimi-k2.5": { tools: true, vision: true, maxTokens: 32_000, contextWindow: 262_144 },
  "kimi-k2-thinking": { tools: true, vision: false, maxTokens: 32_000, contextWindow: 262_144 },
};

const DEFAULT_MODEL = "kimi-k2.6";

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 16384,
  contextWindow: 128_000,
};

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
  cached_tokens?: number;
}): TokenUsage {
  return {
    inputTokens: raw.prompt_tokens ?? 0,
    outputTokens: raw.completion_tokens ?? 0,
    cacheReadTokens: raw.cached_tokens,
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
    provider: "kimi",
    thinkingEffort,
  };
}

export class KimiAdapter implements ModelAdapter {
  id: string;
  readonly provider = "kimi";
  capabilities: ModelCapabilities;
  private client: OpenAI;
  private lastUsage: TokenUsage | undefined;

  constructor(options: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.id = options.model ?? DEFAULT_MODEL;
    this.capabilities = KIMI_MODELS[this.id] ?? DEFAULT_CAPABILITIES;
    if (!options.apiKey) throw new Error("No API key configured for Kimi provider. Set KIMI_API_KEY or add apiKey to config.");
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? "https://api.moonshot.cn/v1",
    });
  }

  setModel(modelId: string): void {
    this.id = modelId;
    this.capabilities = KIMI_MODELS[modelId] ?? DEFAULT_CAPABILITIES;
  }

  private isKimiK26(): boolean {
    return this.id === "kimi-k2.6";
  }

  private getThinkingDefault(): Record<string, unknown> {
    if (this.isKimiK26()) {
      return { type: "enabled", keep: "all" };
    }
    return { type: "enabled" };
  }

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
    };

    params.extra_body = {};
    if (options?.thinking) {
      (params.extra_body as Record<string, unknown>).thinking = options.thinking;
    } else {
      (params.extra_body as Record<string, unknown>).thinking = this.getThinkingDefault();
    }
    if (options?.reasoningEffort) {
      (params.extra_body as Record<string, unknown>).reasoning_effort = options.reasoningEffort;
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

    const mergedReasoningContent = [reasoningContent, thinkContent].filter(Boolean).join("\n");

    return {
      content,
      reasoningContent: mergedReasoningContent || undefined,
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

    params.extra_body = {};
    if (options?.thinking) {
      (params.extra_body as Record<string, unknown>).thinking = options.thinking;
    } else {
      (params.extra_body as Record<string, unknown>).thinking = this.getThinkingDefault();
    }
    if (options?.reasoningEffort) {
      (params.extra_body as Record<string, unknown>).reasoning_effort = options.reasoningEffort;
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
        for (let ti = 0; ti < (delta.tool_calls as unknown[]).length; ti++) {
          const tc = (delta.tool_calls as unknown[])[ti] as Record<string, unknown>;
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
