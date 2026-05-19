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

export const MINIMAX_MODELS: Record<string, ModelCapabilities> = {
  "MiniMax-M2.7": { tools: true, vision: true, maxTokens: 131_000, contextWindow: 205_000 },
  "MiniMax-M2.7-highspeed": {
    tools: true,
    vision: true,
    maxTokens: 131_000,
    contextWindow: 205_000,
  },
  "MiniMax-M2.5": { tools: true, vision: true, maxTokens: 131_000, contextWindow: 205_000 },
  "MiniMax-M2.1": { tools: true, vision: false, maxTokens: 8192, contextWindow: 200_000 },
  "abab6.5s-chat": { tools: true, vision: false, maxTokens: 4096, contextWindow: 200_000 },
  "abab6.5g-chat": { tools: true, vision: false, maxTokens: 4096, contextWindow: 200_000 },
};

const DEFAULT_MODEL = "MiniMax-M2.7";

export class MiniMaxAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "minimax";
  readonly capabilities: ModelCapabilities;
  private apiKey: string;
  private groupId?: string;
  private baseUrl: string;
  private lastUsage: TokenUsage | undefined;

  constructor(config: { apiKey: string; groupId?: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.groupId = config.groupId;
    // Normalize baseUrl - strip trailing /v1 variants to avoid double paths
    let base = config.baseUrl ?? "https://api.minimaxi.com/v1";
    if (base.endsWith("/v1") || base.endsWith("/v1/")) {
      base = base.replace(/\/v1\/?$/, "");
    }
    this.baseUrl = base + "/v1/chat/completions";
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
      stream_options: { include_usage: true },
    };
    if (options?.tools?.length) {
      body.tools = this.convertTools(options.tools);
    }

    if (process.env.DEBUG) {
      console.error("[MiniMax] Request:", JSON.stringify(body, null, 2));
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

    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason = "stop";
    let inputTokens = 0;
    let outputTokens = 0;
    let totalContentLen = 0; // for fallback token estimation
    // MiniMax returns thinking content as <think> XML tags within the content field
    let inThinkTag = false;
    const THINK_OPEN = "<think>";
    const THINK_CLOSE = "</think>";

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
          if (process.env.DEBUG) {
            process.stdout.write("[MiniMax] Raw chunk: " + data + "\n");
          }

          let parsed: {
            choices?: Array<{
              delta?: {
                content?: string;
                role?: string;
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
          try {
            parsed = JSON.parse(data);
          } catch (parseErr) {
            console.error("[MiniMax] JSON parse error on data:", data.slice(0, 200));
            console.error("[MiniMax] Parse error:", parseErr.message);
            throw parseErr;
          }

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;

          // Reasoning content (thinking) from dedicated field
          if ((delta as any).reasoning_content) {
            yield { type: "reasoning-delta", text: (delta as any).reasoning_content };
          }

          if (delta?.content) {
            totalContentLen += delta.content.length;
            // MiniMax returns thinking as <think> XML tags within content.
            // Parse and route: thinking inside tags → reasoning-delta, rest → text-delta.
            let text = delta.content;
            while (text.length > 0) {
              if (inThinkTag) {
                const closeIdx = text.indexOf(THINK_CLOSE);
                if (closeIdx !== -1) {
                  if (closeIdx > 0) {
                    yield { type: "reasoning-delta", text: text.slice(0, closeIdx) };
                  }
                  text = text.slice(closeIdx + THINK_CLOSE.length);
                  inThinkTag = false;
                } else {
                  yield { type: "reasoning-delta", text };
                  text = "";
                }
              } else {
                const openIdx = text.indexOf(THINK_OPEN);
                if (openIdx !== -1) {
                  if (openIdx > 0) {
                    yield { type: "text-delta", text: text.slice(0, openIdx) };
                  }
                  const afterOpen = text.slice(openIdx + THINK_OPEN.length);
                  const closeIdx = afterOpen.indexOf(THINK_CLOSE);
                  if (closeIdx !== -1) {
                    // Complete think block in this chunk
                    if (closeIdx > 0) {
                      yield { type: "reasoning-delta", text: afterOpen.slice(0, closeIdx) };
                    }
                    text = afterOpen.slice(closeIdx + THINK_CLOSE.length);
                    // inThinkTag stays false
                  } else {
                    // Think block continues across chunks
                    inThinkTag = true;
                    text = afterOpen;
                  }
                } else {
                  yield { type: "text-delta", text };
                  text = "";
                }
              }
            }
          }

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
        } catch (err) {
          console.error("[MiniMax] Stream processing error:", err instanceof Error ? err.message : String(err), "Data was:", data?.slice(0, 200));
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
