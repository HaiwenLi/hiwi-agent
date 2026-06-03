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

export const OLLAMA_MODELS: Record<string, ModelCapabilities> = {
  llama3: { tools: true, vision: false, maxTokens: 8192, contextWindow: 8192 },
  "llama3.1": { tools: true, vision: false, maxTokens: 32768, contextWindow: 128_000 },
  "qwen2.5": { tools: true, vision: false, maxTokens: 8192, contextWindow: 32768 },
  mistral: { tools: true, vision: false, maxTokens: 8192, contextWindow: 32768 },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 8192,
  contextWindow: 8192,
};

export class OllamaAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "ollama";
  readonly capabilities: ModelCapabilities;
  private baseUrl: string;
  private lastUsage: TokenUsage | undefined;

  constructor(options: { baseUrl?: string; model?: string }) {
    this.id = options.model ?? "llama3";
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
    this.capabilities = OLLAMA_MODELS[this.id] ?? DEFAULT_CAPABILITIES;
  }

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    try {
      const body: Record<string, unknown> = {
        model: options?.model ?? this.id,
        messages: this.convertMessages(messages),
        stream: false,
        options: {
          num_predict: options?.maxTokens ?? this.capabilities.maxTokens,
          temperature: options?.temperature,
        },
      };

      if (options?.tools?.length) {
        body.tools = this.convertTools(options.tools);
      }

      if (options?.responseFormat) {
        body.format = options.responseFormat.type === "json_object" ? "json" : undefined;
      }

      if (options?.toolChoice) {
        body.tool_choice = options.toolChoice;
      }

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as {
        message: {
          role: string;
          content: string;
          tool_calls?: Array<{
            function: {
              name: string;
              arguments: Record<string, unknown>;
            };
          }>;
        };
        done: boolean;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        content: data.message.content,
        toolCalls: (data.message.tool_calls ?? []).map((tc, i) => ({
          id: `ollama-tc-${i}`,
          name: tc.function.name,
          input: tc.function.arguments,
        })),
        finishReason: data.message.tool_calls?.length ? "tool-calls" : "stop",
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
        },
      };
    } catch (error) {
      throw new Error(`Ollama error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *stream(messages: Message[], options?: ChatOptions, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      stream: true,
    };
    if (options?.tools?.length) {
      body.tools = this.convertTools(options.tools);
    }

    if (options?.responseFormat) {
      body.format = options.responseFormat.type === "json_object" ? "json" : undefined;
    }

    if (options?.toolChoice) {
      body.tool_choice = options.toolChoice;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // Accumulate streaming tool call fragments
    const toolCallMap = new Map<number, { name: string; arguments: string }>();
    let hasToolCalls = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as {
              message?: {
                content?: string;
                tool_calls?: Array<{
                  function: { name?: string; arguments?: Record<string, unknown> };
                }>;
              };
              done?: boolean;
              prompt_eval_count?: number;
              eval_count?: number;
            };

            // Reasoning content (thinking) — some Ollama-compatible servers include this
            const reasoningContent =
              (chunk.message as any)?.reasoning_content ?? (chunk as any).reasoning_content;
            if (reasoningContent) {
              yield { type: "reasoning-delta", text: reasoningContent as string };
            }
            if (chunk.message?.content) {
              yield { type: "text-delta", text: chunk.message.content };
            }

            // Ollama can emit tool_calls in streaming chunks
            if (chunk.message?.tool_calls) {
              for (let i = 0; i < chunk.message.tool_calls.length; i++) {
                const tc = chunk.message.tool_calls[i];
                let entry = toolCallMap.get(i);
                if (!entry) {
                  entry = { name: "", arguments: "" };
                  toolCallMap.set(i, entry);
                }
                if (tc.function.name) entry.name = tc.function.name;
                if (tc.function.arguments) {
                  entry.arguments += JSON.stringify(tc.function.arguments);
                }
              }
              hasToolCalls = true;
            }

            if (chunk.done) {
              // Emit accumulated tool calls
              for (const [, tc] of toolCallMap) {
                yield {
                  type: "tool-call",
                  toolCall: {
                    id: `ollama-tc-${toolCallMap.size}`,
                    name: tc.name,
                    input: JSON.parse(tc.arguments || "{}"),
                  },
                };
              }

              this.lastUsage = {
                inputTokens: chunk.prompt_eval_count ?? 0,
                outputTokens: chunk.eval_count ?? 0,
              };
              yield {
                type: "finish",
                finishReason: hasToolCalls ? "tool-calls" : "stop",
                usage: this.lastUsage,
              };
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getUsage(): TokenUsage | undefined {
    return this.lastUsage;
  }

  private convertMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map((msg) => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: this.extractText(msg.content) };
        case "user": {
          const result: Record<string, unknown> = {
            role: "user",
            content: this.extractText(msg.content),
          };
          const images = this.extractImages(msg.content);
          if (images.length) {
            result.images = images;
          }
          return result;
        }
        case "assistant": {
          const result: Record<string, unknown> = {
            role: "assistant",
            content: this.extractText(msg.content) || "",
          };
          if (msg.toolCalls?.length) {
            result.tool_calls = msg.toolCalls.map((tc) => ({
              function: { name: tc.name, arguments: tc.input },
            }));
          }
          return result;
        }
        case "tool":
          return {
            role: "tool",
            content: msg.content,
          };
      }
    });
  }

  private extractText(content: string | ContentPart[]): string {
    if (typeof content === "string") return content;
    return content
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }

  private extractImages(content: string | ContentPart[]): string[] {
    if (typeof content === "string") return [];
    return content
      .filter((p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url")
      .map((p) => {
        const url = p.image_url.url;
        return url.startsWith("data:") ? url.replace(/^data:image\/[^;]+;base64,/, "") : url;
      });
  }

  private convertTools(tools: ToolDefinition[]): Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }
}
