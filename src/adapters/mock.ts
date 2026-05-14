import type {
  ModelAdapter,
  ModelCapabilities,
  Message,
  ChatOptions,
  ChatResponse,
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

  constructor(
    responses: MockResponse[],
    options?: {
      id?: string;
      provider?: string;
      capabilities?: Partial<ModelCapabilities>;
    },
  ) {
    this.responses = responses;
    this.id = options?.id ?? "mock-model";
    this.provider = options?.provider ?? "mock";
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...options?.capabilities };
  }

  async chat(messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
    const response = this.getCurrentResponse();

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason,
      usage: {
        inputTokens: messages.reduce((sum, m) => sum + m.content.length, 0),
        outputTokens: response.content.length + response.toolCalls.length * 50,
      },
    };
  }

  async *stream(messages: Message[], _options?: ChatOptions): AsyncIterable<StreamChunk> {
    const response = this.getCurrentResponse();

    if (response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        yield { type: "tool-call", toolCall: tc };
      }
    }

    const words = response.content.split(" ");
    for (let i = 0; i < words.length; i++) {
      const text = i === 0 ? words[i] : ` ${words[i]}`;
      yield { type: "text-delta", text };
    }

    yield {
      type: "finish",
      finishReason: response.finishReason,
      usage: {
        inputTokens: messages.reduce((sum, m) => sum + m.content.length, 0),
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
