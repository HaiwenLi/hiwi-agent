import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  ToolDefinition,
} from "../types.js";

const OLLAMA_CAPABILITIES: Record<string, ModelCapabilities> = {
  llama3: { tools: true, vision: false, maxTokens: 8192, contextWindow: 8192 },
  "llama3.1": { tools: true, vision: false, maxTokens: 32768, contextWindow: 128_000 },
  "qwen2.5": { tools: true, vision: false, maxTokens: 8192, contextWindow: 32768 },
  mistral: { tools: true, vision: false, maxTokens: 8192, contextWindow: 32768 },
  codellama: { tools: false, vision: false, maxTokens: 16384, contextWindow: 16384 },
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

  constructor(options: { baseUrl?: string; model?: string }) {
    this.id = options.model ?? "llama3";
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
    this.capabilities = OLLAMA_CAPABILITIES[this.id] ?? DEFAULT_CAPABILITIES;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
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

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as {
        message: {
          role: string;
          content: string;
          tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
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
        finishReason: "stop",
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
        },
      };
    } catch (error) {
      throw new Error(`Ollama error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let totalOutput = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as {
              message?: { content?: string };
              done?: boolean;
              prompt_eval_count?: number;
              eval_count?: number;
            };
            if (chunk.message?.content) {
              totalOutput += chunk.message.content.length;
              yield { type: "text-delta", text: chunk.message.content };
            }
            if (chunk.done) {
              yield {
                type: "finish",
                finishReason: "stop",
                usage: {
                  inputTokens: chunk.prompt_eval_count ?? 0,
                  outputTokens: chunk.eval_count ?? totalOutput,
                },
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

  private convertMessages(messages: Message[]): Array<{ role: string; content: string }> {
    return messages
      .filter((m) => m.role !== "tool")
      .map((m) => ({ role: m.role, content: m.content }));
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
