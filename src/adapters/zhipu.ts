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

export const ZHIPU_MODELS: Record<string, ModelCapabilities> = {
  "glm-5": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-5.1": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-turbo": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4-plus": { tools: true, vision: true, maxTokens: 4096, contextWindow: 200_000 },
  "glm-4-flash": { tools: true, vision: false, maxTokens: 4096, contextWindow: 200_000 },
  "glm-4": { tools: true, vision: true, maxTokens: 4096, contextWindow: 200_000 },
  "glm-4.7": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4v": { tools: false, vision: true, maxTokens: 4096, contextWindow: 200_000 },
  "glm-3-turbo": { tools: true, vision: false, maxTokens: 4096, contextWindow: 200_000 },
};

const DEFAULT_MODEL = "glm-5";

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
  private lastUsage: TokenUsage | undefined;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://open.bigmodel.cn/api/paas/v4";
    this.id = config.model ?? DEFAULT_MODEL;
    this.capabilities = ZHIPU_MODELS[this.id] ?? ZHIPU_MODELS[DEFAULT_MODEL];
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature ?? 0.7,
    };
    if (options?.tools?.length) {
      body.tools = this.convertTools(options.tools);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorCode = "";
      let errorMsg = "";
      try {
        const errBody = (await response.json()) as { error?: { code?: string; message?: string } };
        errorCode = errBody.error?.code ?? "";
        errorMsg = errBody.error?.message ?? "";
      } catch {
        // ignore parse errors
      }
      const friendly = GLM_ERROR_MAP[errorCode];
      throw new Error(
        friendly ?? `Zhipu API error (${response.status}): ${errorMsg || "Unknown error"}`,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));

    return {
      content: choice?.message?.content ?? "",
      toolCalls,
      finishReason: choice?.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (options?.tools?.length) {
      body.tools = this.convertTools(options.tools);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Zhipu streaming error (${response.status})`);
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Accumulate streaming tool call fragments
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = "stop";
    let inputTokens = 0;
    let outputTokens = 0;

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
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  type?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
              finish_reason?: string | null;
            }>;
            usage?: { prompt_tokens: number; completion_tokens: number };
          };

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // Reasoning content (thinking)
          if ((delta as any).reasoning_content) {
            yield { type: "reasoning-delta", text: (delta as any).reasoning_content };
          }

          // Text content
          if (delta?.content) {
            yield { type: "text-delta", text: delta.content };
          }

          // Tool call fragments — accumulate then emit complete tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              let entry = toolCallMap.get(idx);
              if (!entry) {
                entry = {
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  arguments: "",
                };
                toolCallMap.set(idx, entry);
              }
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.arguments += tc.function.arguments;
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          if (parsed.usage) {
            inputTokens = parsed.usage.prompt_tokens;
            outputTokens = parsed.usage.completion_tokens;
          }
        } catch {
          // skip invalid chunks
        }
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

  private convertMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map((msg) => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: msg.content };
        case "user":
          return { role: "user", content: msg.content };
        case "assistant": {
          const result: Record<string, unknown> = {
            role: "assistant",
            content: msg.content || null,
          };
          if (msg.toolCalls?.length) {
            result.tool_calls = msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.input),
              },
            }));
          }
          return result;
        }
        case "tool":
          return {
            role: "tool",
            content: msg.content,
            tool_call_id: msg.toolCallId ?? "",
          };
      }
    });
  }

  getUsage(): TokenUsage | undefined {
	    return this.lastUsage;
	  }

	  private convertTools(tools: ToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}
