import type {
  ChatOptions,
  ChatResponse,
  Message,
  ModelAdapter,
  ModelCapabilities,
  StreamChunk,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from "../types.js";
import { extractText, safeJsonParse } from "./adapter-utils.js";

export const ZHIPU_MODELS: Record<string, ModelCapabilities> = {
  "glm-5.1": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-5": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-5-turbo": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4.7": { tools: true, vision: true, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4.7-flashx": { tools: true, vision: false, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4.7-flash": { tools: true, vision: false, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4.6": { tools: true, vision: false, maxTokens: 128_000, contextWindow: 200_000 },
  "glm-4.5-air": { tools: true, vision: false, maxTokens: 96_000, contextWindow: 128_000 },
  "glm-4.5-airx": { tools: true, vision: false, maxTokens: 96_000, contextWindow: 128_000 },
  "glm-4-flash": { tools: true, vision: false, maxTokens: 4_096, contextWindow: 128_000 },
  "glm-4-plus": { tools: true, vision: false, maxTokens: 4_096, contextWindow: 128_000 },
  "glm-4": { tools: true, vision: true, maxTokens: 4_096, contextWindow: 128_000 },
  "glm-4v": { tools: false, vision: true, maxTokens: 4_096, contextWindow: 128_000 },
  "glm-3-turbo": { tools: false, vision: false, maxTokens: 4_096, contextWindow: 128_000 },
  "glm-turbo": { tools: false, vision: false, maxTokens: 4_096, contextWindow: 128_000 },
};

const DEFAULT_MODEL = "glm-5.1";

const GLM_ERROR_MAP: Record<string, string> = {
  "1301": "Content filtered by safety system. Rephrase your request.",
  "1215": "Invalid or expired API token. Check ZHIPU_API_KEY.",
  "1234": "Rate limited. Wait and retry.",
};

// GLM Coding Plan endpoint (for subscription-based coding tools)
export const ZHIPU_CODING_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";
// Regular pay-as-you-go API endpoint
export const ZHIPU_PAAS_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
// Anthropic-compatible endpoint (for Claude Code etc.)
export const ZHIPU_ANTHROPIC_BASE_URL = "https://open.bigmodel.cn/api/anthropic";

export class ZhipuAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "zhipu";
  readonly capabilities: ModelCapabilities;
  private apiKey: string;
  private baseUrl: string;
  private lastUsage: TokenUsage | undefined;

  constructor(config: { apiKey: string; baseUrl?: string; model?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? ZHIPU_PAAS_BASE_URL;
    this.id = config.model ?? DEFAULT_MODEL;
    this.capabilities = ZHIPU_MODELS[this.id] ?? ZHIPU_MODELS[DEFAULT_MODEL];
  }

  async chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature ?? 0.7,
    };
    if (options?.tools?.length) {
      body.tools = this.convertTools(options.tools);
    }
    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }
    if (options?.toolChoice) {
      body.tool_choice = options.toolChoice;
    }
    if (options?.thinking) {
      body.thinking = options.thinking;
    } else if (
      this.id.startsWith("glm-5") ||
      this.id.startsWith("glm-4.7") ||
      this.id.startsWith("glm-4.6")
    ) {
      body.thinking = { type: "enabled", clear_thinking: false };
    }
    if (options?.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
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
      model?: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_tokens_details?: {
          cached_tokens?: number;
        };
      };
    };

    const choice = data.choices[0];
    const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeJsonParse(tc.function.arguments),
    }));

    const inputTk = data.usage?.prompt_tokens ?? 0;
    const outputTk = data.usage?.completion_tokens ?? 0;
    // GLM returns cached tokens in `usage.prompt_tokens_details.cached_tokens`
    const cacheHit = data.usage?.prompt_tokens_details?.cached_tokens;

    return {
      content: choice?.message?.content ?? "",
      toolCalls,
      finishReason: choice?.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: {
        inputTokens: inputTk,
        outputTokens: outputTk,
        cacheReadTokens: cacheHit,
        contextWindow: this.capabilities.contextWindow,
        contextPercent:
          this.capabilities.contextWindow > 0
            ? Math.round((inputTk / this.capabilities.contextWindow) * 100)
            : null,
        modelName: data.model ?? this.id,
        provider: this.provider,
        thinkingEffort: options?.reasoningEffort,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions, signal?: AbortSignal): AsyncIterable<StreamChunk> {
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
      body.tool_stream = true;
    }
    if (options?.responseFormat) {
      body.response_format = options.responseFormat;
    }
    if (options?.toolChoice) {
      body.tool_choice = options.toolChoice;
    }
    if (options?.thinking) {
      body.thinking = options.thinking;
    } else if (
      this.id.startsWith("glm-5") ||
      this.id.startsWith("glm-4.7") ||
      this.id.startsWith("glm-4.6")
    ) {
      body.thinking = { type: "enabled", clear_thinking: false };
    }
    if (options?.reasoningEffort) {
      body.reasoning_effort = options.reasoningEffort;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
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
    let modelName = this.id;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheHitTokens = 0;

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
            model?: string;
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
            usage?: {
              prompt_tokens: number;
              completion_tokens: number;
              prompt_tokens_details?: {
                cached_tokens?: number;
              };
            };
          };

          const choice = parsed.choices?.[0];
          if (!choice) continue;

          if (parsed.model) {
            modelName = parsed.model;
          }

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
            cacheHitTokens = parsed.usage.prompt_tokens_details?.cached_tokens ?? 0;
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
          input: safeJsonParse(tc.arguments),
        },
      };
    }

    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheHitTokens > 0 ? cacheHitTokens : undefined,
      contextWindow: this.capabilities.contextWindow,
      contextPercent:
        this.capabilities.contextWindow > 0
          ? Math.round((inputTokens / this.capabilities.contextWindow) * 100)
          : null,
      modelName,
      provider: this.provider,
      thinkingEffort: options?.reasoningEffort,
    };
    this.lastUsage = usage;
    yield {
      type: "finish",
      finishReason: finishReason === "tool_calls" ? "tool-calls" : "stop",
      usage,
    };
  }

  private convertMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map((msg) => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: extractText(msg.content) };
        case "user":
          return { role: "user", content: extractText(msg.content) };
        case "assistant": {
          const result: Record<string, unknown> = {
            role: "assistant",
            content: msg.content ?? null,
          };
          if (msg.reasoningContent) {
            result.reasoning_content = msg.reasoningContent;
          }
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
            content: extractText(msg.content),
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
        ...(t.strict !== undefined ? { strict: t.strict } : {}),
      },
    }));
  }
}
