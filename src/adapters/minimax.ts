import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  ToolCall,
  ToolDefinition,
} from "../types.js";

export const MINIMAX_MODELS: Record<string, ModelCapabilities> = {
  "MiniMax-M2.7": { tools: true, vision: true, maxTokens: 16384, contextWindow: 1_000_000 },
  "MiniMax-M2.7-highspeed": { tools: true, vision: false, maxTokens: 16384, contextWindow: 1_000_000 },
  "MiniMax-M2.5": { tools: true, vision: true, maxTokens: 16384, contextWindow: 1_000_000 },
  "MiniMax-M2.1": { tools: true, vision: false, maxTokens: 8192, contextWindow: 245_000 },
  "abab6.5s-chat": { tools: true, vision: false, maxTokens: 4096, contextWindow: 245_000 },
  "abab6.5g-chat": { tools: true, vision: false, maxTokens: 4096, contextWindow: 128_000 },
};

const DEFAULT_MODEL = "MiniMax-M2.7";

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
    this.baseUrl = config.baseUrl ?? "https://api.minimaxi.com/v1/chat/completions";
    this.id = config.model ?? DEFAULT_MODEL;
    this.capabilities = MINIMAX_MODELS[this.id] ?? MINIMAX_MODELS[DEFAULT_MODEL];
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

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMsg = "Unknown error";
      try {
        const errBody = (await response.json()) as { error?: { message?: string } };
        errorMsg = errBody.error?.message ?? errorMsg;
      } catch {
        // ignore parse errors
      }
      throw new Error(`MiniMax API error (${response.status}): ${errorMsg}`);
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
    };
    if (options?.tools?.length) {
      body.tools = this.convertTools(options.tools);
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`MiniMax streaming error (${response.status})`);
    }

    if (!response.body) throw new Error("No response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const toolCallMap = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
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

          if (delta?.content) {
            yield { type: "text-delta", text: delta.content };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  arguments: "",
                });
              }
              const entry = toolCallMap.get(idx)!;
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
