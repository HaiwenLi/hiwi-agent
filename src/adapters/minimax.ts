import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
} from "../types.js";

export const MINIMAX_MODELS: Record<string, ModelCapabilities> = {
  "abab6.5s-chat": { tools: true, vision: false, maxTokens: 4096, contextWindow: 245_000 },
  "abab6.5g-chat": { tools: true, vision: false, maxTokens: 4096, contextWindow: 128_000 },
  "abab6.5t-chat": { tools: false, vision: false, maxTokens: 4096, contextWindow: 16_384 },
  "abab5.5-chat": { tools: false, vision: false, maxTokens: 4096, contextWindow: 16_384 },
};

const DEFAULT_MODEL = "abab6.5s-chat";

export class MiniMaxAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "minimax";
  readonly capabilities: ModelCapabilities;
  private apiKey: string;
  private groupId?: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; groupId?: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.groupId = config.groupId;
    this.baseUrl = config.baseUrl ?? "https://api.minimax.chat/v1/text/chatcompletion_v2";
    this.id = config.model ?? DEFAULT_MODEL;
    this.capabilities = MINIMAX_MODELS[this.id] ?? MINIMAX_MODELS[DEFAULT_MODEL];
  }

  async chat(messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.id,
      messages: messages.map((m) => ({
        sender_type: m.role === "user" ? "USER" : "BOT",
        sender_name: m.role === "user" ? "User" : "Assistant",
        text: m.content,
      })),
      reply_constraints: { sender_type: "BOT", sender_name: "Assistant" },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMsg = "Unknown error";
      try {
        const errBody = await response.json() as { error?: { message?: string } };
        errorMsg = errBody.error?.message ?? errorMsg;
      } catch {
        // ignore
      }
      throw new Error(`MiniMax API error (${response.status}): ${errorMsg}`);
    }

    const data = await response.json() as {
      reply: string;
      usage?: { total_tokens: number };
    };

    return {
      content: data.reply ?? "",
      toolCalls: [],
      finishReason: "stop",
      usage: {
        inputTokens: data.usage?.total_tokens ? Math.floor(data.usage.total_tokens / 2) : 0,
        outputTokens: data.usage?.total_tokens ? Math.floor(data.usage.total_tokens / 2) : 0,
      },
    };
  }

  async *stream(_messages: Message[], _options?: ChatOptions): AsyncIterable<StreamChunk> {
    const body = JSON.stringify({
      model: this.id,
      messages: _messages.map((m) => ({
        sender_type: m.role === "user" ? "USER" : "BOT",
        sender_name: m.role === "user" ? "User" : "Assistant",
        text: m.content,
      })),
      stream: true,
      reply_constraints: { sender_type: "BOT", sender_name: "Assistant" },
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`MiniMax streaming error (${response.status})`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { text?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.text;
          if (content) {
            yield { type: "text-delta", text: content };
          }
        } catch {
          // skip invalid chunks
        }
      }
    }

    yield {
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}
