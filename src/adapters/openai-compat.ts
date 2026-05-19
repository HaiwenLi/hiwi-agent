import OpenAI from "openai";
import type {
  TokenUsage,
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  ToolDefinition,
} from "../types.js";

export const OPENAI_COMPAT_MODELS: Record<string, ModelCapabilities> = {
  "kimi-k2.6": { tools: true, vision: true, maxTokens: 33_000, contextWindow: 262_000 },
  "kimi-k2.5": { tools: true, vision: true, maxTokens: 33_000, contextWindow: 262_000 },
  "kimi-k2-thinking": { tools: true, vision: false, maxTokens: 33_000, contextWindow: 262_000 },
  "deepseek-v4-pro[1m]": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1000_000 },
  "deepseek-v4-pro": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1000_000 },
  "deepseek-v4-flash": { tools: true, vision: false, maxTokens: 384_000, contextWindow: 1000_000 },
  "gpt-4o": { tools: true, vision: true, maxTokens: 16384, contextWindow: 128_000 },
  "gpt-4o-mini": { tools: true, vision: true, maxTokens: 16384, contextWindow: 128_000 },
  "deepseek-v3": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
  "deepseek-r1": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
  "glm-4-plus": { tools: true, vision: true, maxTokens: 8192, contextWindow: 128_000 },
  "glm-4-flash": { tools: true, vision: true, maxTokens: 4096, contextWindow: 128_000 },
  "moonshot-v1-128k": { tools: true, vision: false, maxTokens: 8192, contextWindow: 200_000 },
  "abab-7": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 16384,
  contextWindow: 128_000,
};

export class OpenAICompatAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;
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
      apiKey: options.apiKey ?? "dummy",
      baseURL: options.baseUrl,
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
    });

    const choice = response.choices[0];
    const tc = choice.message.tool_calls ?? [];

    return {
      content: choice.message.content ?? "",
      toolCalls: tc.map((t) => ({
        id: t.id,
        name: t.function.name,
        input: JSON.parse(t.function.arguments),
      })),
      finishReason: choice.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      stream: true,
    });

    // Accumulate streaming tool call fragments
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = "stop";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as Record<string, unknown> | undefined;
      if ((delta as any)?.reasoning_content) {
        yield { type: "reasoning-delta", text: (delta as any).reasoning_content as string };
      }
      if (delta?.content) {
        yield { type: "text-delta", text: delta.content as string };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
          const idx = tc.index as number;
          let entry = toolCallMap.get(idx);
          if (!entry) {
            entry = { id: (tc.id as string) ?? "", name: (tc.function as any)?.name ?? "", arguments: "" };
            toolCallMap.set(idx, entry);
          }
          if (tc.id) entry.id = tc.id as string;
          if ((tc.function as any)?.name) entry.name = (tc.function as any).name;
          if ((tc.function as any)?.arguments) entry.arguments += (tc.function as any).arguments;
        }
      }
      if (chunk.choices[0]?.finish_reason) {
        finishReason = chunk.choices[0].finish_reason;
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    // Emit accumulated tool calls
    for (const [, tc] of toolCallMap) {
      yield {
        type: "tool-call",
        toolCall: {
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments || "{}"),
        },
      };
    }

    		this.lastUsage = { inputTokens, outputTokens };
		yield {
      type: "finish",
      finishReason: finishReason === "tool_calls" ? "tool-calls" : "stop",
      usage: { inputTokens, outputTokens },
    };
  }

  getUsage(): TokenUsage | undefined {
	    return this.lastUsage;
	  }

	  private convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.ChatCompletionMessageParam => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: msg.content };
        case "user":
          return { role: "user", content: msg.content };
        case "assistant":
          return {
            role: "assistant",
            content: msg.content || null,
            tool_calls: msg.toolCalls?.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          };
        case "tool":
          return {
            role: "tool",
            content: msg.content,
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
      },
    }));
  }
}
