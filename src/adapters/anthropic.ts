import Anthropic from "@anthropic-ai/sdk";
import type {
  TokenUsage,
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  ToolCall,
  ToolDefinition,
} from "../types.js";

export const ANTHROPIC_MODELS: Record<string, ModelCapabilities> = {
  "claude-sonnet-4-6": { tools: true, vision: true, maxTokens: 16384, contextWindow: 200_000 },
  "claude-opus-4-7": { tools: true, vision: true, maxTokens: 32768, contextWindow: 200_000 },
  "claude-haiku-4-5": { tools: true, vision: true, maxTokens: 8192, contextWindow: 200_000 },
};

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class AnthropicAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "anthropic";
  readonly capabilities: ModelCapabilities;
  private client: Anthropic;
	private lastUsage: TokenUsage | undefined;

  constructor(options: { apiKey: string; model?: string }) {
    this.id = options.model ?? DEFAULT_MODEL;
    this.capabilities = ANTHROPIC_MODELS[this.id] ?? ANTHROPIC_MODELS[DEFAULT_MODEL];
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const { system, convertedMessages } = this.convertMessages(messages);
    const response = await this.client.messages.create({
      model: options?.model ?? this.id,
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      system: system ?? undefined,
      messages: convertedMessages,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      temperature: options?.temperature,
    });

    const textParts = response.content.filter((b) => b.type === "text");
    const toolParts = response.content.filter((b) => b.type === "tool_use");

    return {
      content: textParts.map((b) => b.text).join(""),
      toolCalls: toolParts.map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      })),
      finishReason: response.stop_reason === "tool_use" ? "tool-calls" : "stop",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const { system, convertedMessages } = this.convertMessages(messages);
    const stream = this.client.messages.stream({
      model: options?.model ?? this.id,
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      system: system ?? undefined,
      messages: convertedMessages,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      temperature: options?.temperature,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text-delta", text: event.delta.text };
      } else if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
        yield { type: "reasoning-delta", text: (event.delta as any).thinking as string };
      } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        yield {
          type: "tool-call",
          toolCall: {
            id: event.content_block.id,
            name: event.content_block.name,
            input: event.content_block.input as Record<string, unknown>,
          },
        };
      }
    }

    const finalMessage = await stream.finalMessage();
    this.lastUsage = {
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
    };
    yield {
      type: "finish",
      finishReason: finalMessage.stop_reason === "tool_use" ? "tool-calls" : "stop",
      usage: this.lastUsage,
    };
  }

  getUsage(): TokenUsage | undefined {
	    return this.lastUsage;
	  }

	  private convertMessages(messages: Message[]): {
    system: string | null;
    convertedMessages: Anthropic.MessageParam[];
  } {
    let system: string | null = null;
    const converted: Anthropic.MessageParam[] = [];
    const toolResults = new Map<string, string>();

    for (const msg of messages) {
      if (msg.role === "tool" && msg.toolCallId) {
        toolResults.set(msg.toolCallId, msg.content);
      }
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        system = (system ?? "") + msg.content;
        continue;
      }

      if (msg.role === "tool") {
        continue;
      }

      if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        converted.push({ role: "assistant", content });
        continue;
      }

      converted.push({ role: "user", content: msg.content });
    }

    const assistantMsgs = messages.filter((m) => m.role === "assistant" && m.toolCalls?.length);
    for (const am of assistantMsgs) {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tc of am.toolCalls ?? []) {
        results.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: toolResults.get(tc.id) ?? "",
        });
      }
      if (results.length > 0) {
        converted.push({ role: "user", content: results });
      }
    }

    return { system, convertedMessages: converted };
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }
}
