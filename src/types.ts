// ─── Message Types ────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type TextContentPart = { type: "text"; text: string };
export type ImageContentPart = {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" | "auto" };
};
export type ContentPart = TextContentPart | ImageContentPart;

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  title?: string;
  metadata?: Record<string, unknown>;
  contentParts?: ContentPart[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  contextPercent?: number | null;
  contextWindow?: number;
  modelName?: string;
  provider?: string;
  thinkingEffort?: string;
}

export interface StatusBarData {
  tokens: TokenUsage;
  visible: boolean;
}

// ─── Model Adapter Types ──────────────────────────────────────

export interface ModelCapabilities {
  tools: boolean;
  vision: boolean;
  maxTokens: number;
  contextWindow: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  strict?: boolean;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  thinking?: { type: string; [key: string]: unknown };
  reasoningEffort?: string;
  responseFormat?: {
    type: "text" | "json_object" | "json_schema";
    json_schema?: { name: string; strict: boolean; schema: Record<string, unknown> };
  };
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool-calls" | "max-tokens";
  usage: TokenUsage;
  reasoningContent?: string;
}

export type StreamChunk =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "finish"; finishReason: string; usage: TokenUsage };

export interface ModelAdapter {
  id: string;
  readonly provider: string;
  capabilities: ModelCapabilities;

  chat(messages: Message[], options?: ChatOptions, signal?: AbortSignal): Promise<ChatResponse>;
  stream(messages: Message[], options?: ChatOptions, signal?: AbortSignal): AsyncIterable<StreamChunk>;
  getUsage?(): TokenUsage | undefined;
  setModel?(modelId: string): void;
}

// ─── Tool System Types ────────────────────────────────────────

export type ToolCapability =
  | "ReadOnly"
  | "WriteFiles"
  | "ExecCode"
  | "Network"
  | "NetworkAccess"
  | "UserInteraction"
  | "StateUpdate";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  capabilities: ToolCapability[];
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface PermissionRequest {
  tool: string;
  capability: string;
}

export interface QuestionPrompt {
  question: string;
  options?: Array<{ label: string; description?: string }>;
}

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  abort?: AbortSignal;
  askPermission?: (req: PermissionRequest) => Promise<boolean>;
  askUserQuestions?: (questions: QuestionPrompt[]) => Promise<Record<string, string>>;
}

export type PermissionMode = "normal" | "auto" | "yolo";

// ─── Agent Loop Types ─────────────────────────────────────────

export type AgentLoopEventType =
  | "text-delta"
  | "reasoning-delta"
  | "tool-call"
  | "tool-result"
  | "step-start"
  | "step-finish"
  | "compaction"
  | "finish"
  | "messages"
  | "error";

export interface AgentLoopEvent {
  type: AgentLoopEventType;
  iteration?: number;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: unknown;
  toolResult?: ToolResult;
  finishReason?: "completed" | "max-loops" | "interrupted" | "error" | "paused";
  usage?: TokenUsage;
  messages?: Message[];
}

export interface AgentLoopConfig {
  maxLoops: number;
  maxOutputTokensPerTurn: number;
  budgetTotal: number;
  refundableTools: string[];
  streaming: boolean;
  interruptible: boolean;
  thinkingEffort?: string;
}

// ─── Config Types ─────────────────────────────────────────────

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  models?: string[];
  /** For mem0 OSS (self-hosted) mode — embbedder, vectorStore, llm config */
  oss?: Record<string, unknown>;
}

export interface SystemPromptConfig {
  providerVariant?: "auto" | "anthropic" | "gpt" | "default";
}

export interface AgentConfig {
  activeProvider: string;
  activeModel: string;
  providers: Record<string, ProviderConfig>;
  agent: AgentLoopConfig;
  systemPrompt?: SystemPromptConfig;
}

// ─── Model Info (for listing) ─────────────────────────────────

export interface ModelEntry {
  id: string;
  label?: string;
  tier?: "fast" | "standard" | "premium";
  tags?: string[];
}

export interface ModelInfo {
  id: string;
  provider: string;
  capabilities: ModelCapabilities;
}
