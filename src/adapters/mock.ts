import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  ToolCall,
} from "../types.js";

export interface MockResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool-calls" | "max-tokens";
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 4096,
  contextWindow: 128_000,
};

export class MockAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;

  private responses: MockResponse[];
  private callIndex = 0;
  private streamDelay: number;

  constructor(
    responses: MockResponse[],
    options?: {
      id?: string;
      provider?: string;
      capabilities?: Partial<ModelCapabilities>;
      streamDelay?: number;
    },
  ) {
    this.responses = responses;
    this.id = options?.id ?? "mock-model";
    this.provider = options?.provider ?? "mock";
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...options?.capabilities };
    this.streamDelay = options?.streamDelay ?? 0;
  }

  async chat(messages: Message[], _options?: ChatOptions, _signal?: AbortSignal): Promise<ChatResponse> {
    const response = this.getCurrentResponse();

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason,
      usage: {
        inputTokens: messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0),
        outputTokens: response.content.length + response.toolCalls.length * 50,
      },
    };
  }

  async *stream(
    messages: Message[],
    _options?: ChatOptions,
    signal?: AbortSignal,
  ): AsyncIterable<StreamChunk> {
    const response = this.getCurrentResponse();

    if (signal?.aborted) return;

    if (response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        if (this.streamDelay > 0) {
          await new Promise((r) => setTimeout(r, this.streamDelay));
        }
        yield { type: "tool-call", toolCall: tc };
      }
    }

    if (response.content) {
      if (this.streamDelay > 0) {
        // Split into word-level chunks to simulate streaming
        const words = response.content.split(/(\s+)/);
        for (const word of words) {
          await new Promise((r) => setTimeout(r, this.streamDelay));
          yield { type: "text-delta", text: word };
        }
      } else {
        yield { type: "text-delta", text: response.content };
      }
    }

    yield {
      type: "finish",
      finishReason: response.finishReason,
      usage: {
        inputTokens: messages.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 0), 0),
        outputTokens: response.content.length,
      },
    };
  }

  private getCurrentResponse(): MockResponse {
    if (this.responses.length === 0) {
      return { content: "", toolCalls: [], finishReason: "stop" };
    }
    const idx = Math.min(this.callIndex, this.responses.length - 1);
    this.callIndex += 1;
    return this.responses[idx];
  }
}
