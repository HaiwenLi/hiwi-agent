import Anthropic from "@anthropic-ai/sdk";
import { buildNormalizedUsage, enrichUsage } from "./adapter-utils.js";
import type {
  ChatOptions,
  ChatResponse,
  ContentPart,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  TokenUsage,
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

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    const { system, convertedMessages } = this.convertMessages(messages);
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      system: system ?? undefined,
      messages: convertedMessages,
      tools: options?.toolChoice === "none" ? undefined : (options?.tools ? this.convertTools(options.tools) : undefined),
      temperature: options?.temperature,
    };
    if (options?.responseFormat?.type === "json_object") {
      params.response_format = { type: "json_object" };
    }
    if (options?.toolChoice && options.toolChoice !== "none") {
      params.tool_choice = this.convertToolChoice(options.toolChoice);
    }
    if (options?.thinking) {
      params.thinking = options.thinking;
    }
    const response = await this.client.messages.create(
      params as unknown as Anthropic.MessageCreateParamsNonStreaming,
      { signal },
    );

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
      usage: enrichUsage(
        buildNormalizedUsage("anthropic", {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_read_input_tokens: (response.usage as any).cache_read_input_tokens,
          cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
        }),
        this.capabilities.contextWindow,
        response.model,
        this.provider,
      ),
    };
  }

  async *stream(messages: Message[], options?: ChatOptions, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const { system, convertedMessages } = this.convertMessages(messages);
    const params: Record<string, unknown> = {
      model: options?.model ?? this.id,
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      system: system ?? undefined,
      messages: convertedMessages,
      tools: options?.toolChoice === "none" ? undefined : (options?.tools ? this.convertTools(options.tools) : undefined),
      temperature: options?.temperature,
    };
    if (options?.responseFormat?.type === "json_object") {
      params.response_format = { type: "json_object" };
    }
    if (options?.toolChoice && options.toolChoice !== "none") {
      params.tool_choice = this.convertToolChoice(options.toolChoice);
    }
    if (options?.thinking) {
      params.thinking = options.thinking;
    }
    const stream = this.client.messages.stream(
      params as unknown as Anthropic.MessageCreateParamsStreaming,
      { signal },
    );

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
    const baseUsage = buildNormalizedUsage("anthropic", {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
      cache_read_input_tokens: (finalMessage.usage as any).cache_read_input_tokens,
      cache_creation_input_tokens: (finalMessage.usage as any).cache_creation_input_tokens,
    });
    const enrichedUsage = enrichUsage(baseUsage, this.capabilities.contextWindow, finalMessage.model, this.provider);
    this.lastUsage = enrichedUsage;
    yield {
      type: "finish",
      finishReason: finalMessage.stop_reason === "tool_use" ? "tool-calls" : "stop",
      usage: enrichedUsage,
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
        toolResults.set(msg.toolCallId, typeof msg.content === "string" ? msg.content : "");
      }
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        system = (system ?? "") + (typeof msg.content === "string" ? msg.content : "");
        continue;
      }

      if (msg.role === "tool") {
        continue;
      }

      if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.reasoningContent) {
          content.push({
            type: "thinking" as any,
            thinking: msg.reasoningContent,
          } as unknown as Anthropic.ContentBlockParam);
        }
        if (msg.content) {
          content.push({ type: "text", text: typeof msg.content === "string" ? msg.content : "" });
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

        // Emit tool_result immediately after the assistant tool_use message
        // (Anthropic API requires tool_result to directly follow tool_use)
        if (msg.toolCalls?.length) {
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tc of msg.toolCalls) {
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

        continue;
      }

      if (typeof msg.content === "string") {
        converted.push({ role: "user", content: msg.content });
      } else {
        const blocks: Anthropic.ContentBlockParam[] = msg.content.map((p) => {
          if (p.type === "text") return { type: "text", text: p.text } as Anthropic.TextBlockParam;
          const match = p.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: match[2],
              },
            } as Anthropic.ImageBlockParam;
          }
          return { type: "text", text: `[Image: ${p.image_url.url}]` } as Anthropic.TextBlockParam;
        });
        converted.push({ role: "user", content: blocks });
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

  private convertToolChoice(toolChoice: ChatOptions["toolChoice"]): Anthropic.ToolChoice {
    if (!toolChoice) return { type: "auto" };
    if (typeof toolChoice === "string") {
      switch (toolChoice) {
        case "auto":
          return { type: "auto" };
        case "required":
          return { type: "any" };
        case "none":
          // Anthropic has no "none" type — return auto but caller should omit tools
          return { type: "auto" };
      }
    }
    return { type: "tool", name: toolChoice.function.name };
  }
}
