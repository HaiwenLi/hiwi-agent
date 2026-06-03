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
import { safeJsonParse } from "./adapter-utils.js";

export const OPENAI_MODELS: Record<string, ModelCapabilities> = {
  "gpt-4o": { tools: true, vision: true, maxTokens: 16_384, contextWindow: 128_000 },
  "gpt-4o-mini": { tools: true, vision: true, maxTokens: 16_384, contextWindow: 128_000 },
};

const DEFAULT_MODEL = "gpt-4o";

function buildUsage(raw: {
  prompt_tokens?: number;
  completion_tokens?: number;
}): TokenUsage {
  return {
    inputTokens: raw.prompt_tokens ?? 0,
    outputTokens: raw.completion_tokens ?? 0,
  };
}

export class OpenAIAdapter implements ModelAdapter {
  id: string;
  readonly provider = "openai";
  capabilities: ModelCapabilities;
  private client: OpenAI;
  private lastUsage: TokenUsage | undefined;

  constructor(options: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.id = options.model ?? DEFAULT_MODEL;
    this.capabilities = OPENAI_MODELS[this.id] ?? OPENAI_MODELS[DEFAULT_MODEL];
    if (!options.apiKey) throw new Error("No API key configured for OpenAI provider. Set OPENAI_API_KEY or add apiKey to config.");
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
    });
  }

  setModel(modelId: string): void {
    this.id = modelId;
    this.capabilities = OPENAI_MODELS[modelId] ?? OPENAI_MODELS[DEFAULT_MODEL];
  }

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
    };

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

    return {
      content: choice.message.content ?? "",
      toolCalls: tc.map((t) => ({
        id: t.id,
        name: t.function.name,
        input: safeJsonParse(t.function.arguments),
      })),
      finishReason: choice.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        contextWindow: this.capabilities.contextWindow,
        contextPercent:
          this.capabilities.contextWindow > 0
            ? Math.round(((response.usage?.prompt_tokens ?? 0) / this.capabilities.contextWindow) * 100)
            : null,
        modelName: response.model,
        provider: this.provider,
      },
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

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
      if (delta?.content) {
        yield { type: "text-delta", text: delta.content as string };
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

    const usage = {
      inputTokens,
      outputTokens,
      contextWindow: this.capabilities.contextWindow,
      contextPercent:
        this.capabilities.contextWindow > 0
          ? Math.round((inputTokens / this.capabilities.contextWindow) * 100)
          : null,
      modelName,
      provider: this.provider,
    };
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
          return {
            role: "user",
            content: userContent as string | OpenAI.ChatCompletionContentPart[],
          };
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
