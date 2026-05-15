import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
} from "../types.js";

export const ZHIPU_MODELS: Record<string, ModelCapabilities> = {
  "glm-4-plus": { tools: true, vision: true, maxTokens: 4096, contextWindow: 128_000 },
  "glm-4-flash": { tools: true, vision: false, maxTokens: 4096, contextWindow: 128_000 },
  "glm-4": { tools: true, vision: true, maxTokens: 4096, contextWindow: 128_000 },
  "glm-4v": { tools: false, vision: true, maxTokens: 4096, contextWindow: 8_192 },
  "glm-3-turbo": { tools: true, vision: false, maxTokens: 4096, contextWindow: 32_000 },
};

const DEFAULT_MODEL = "glm-4-flash";

const GLM_ERROR_MAP: Record<string, string> = {
  "1301": "Content filtered by safety system. Rephrase your request.",
  "1215": "Invalid or expired API token. Check ZHIPU_API_KEY.",
  "1234": "Rate limited. Wait and retry.",
};

export class ZhipuAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "zhipu";
  readonly capabilities: ModelCapabilities;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://open.bigmodel.cn/api/paas/v4";
    this.id = config.model ?? DEFAULT_MODEL;
    this.capabilities = ZHIPU_MODELS[this.id] ?? ZHIPU_MODELS[DEFAULT_MODEL];
  }

  async chat(messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.id,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: _options?.maxTokens ?? this.capabilities.maxTokens,
        temperature: _options?.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      let errorCode = "";
      let errorMsg = "";
      try {
        const errBody = await response.json() as { error?: { code?: string; message?: string } };
        errorCode = errBody.error?.code ?? "";
        errorMsg = errBody.error?.message ?? "";
      } catch {
        // ignore parse errors
      }

      const friendly = GLM_ERROR_MAP[errorCode];
      throw new Error(friendly ?? `Zhipu API error (${response.status}): ${errorMsg || "Unknown error"}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? "",
      toolCalls: [],
      finishReason: "stop",
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(_messages: Message[], _options?: ChatOptions): AsyncIterable<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.id,
        messages: _messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: _options?.maxTokens ?? this.capabilities.maxTokens,
        temperature: _options?.temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Zhipu streaming error (${response.status})`);
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
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens: number; completion_tokens: number };
          };
          const content = parsed.choices?.[0]?.delta?.content;
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
