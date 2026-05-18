// ─── Message Types ────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  title?: string;
  metadata?: Record<string, unknown>;
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
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool-calls" | "max-tokens";
  usage: TokenUsage;
}

export type StreamChunk =
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "finish"; finishReason: string; usage: TokenUsage };

export interface ModelAdapter {
  readonly id: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;

  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk>;
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
  finishReason?: "completed" | "max-loops" | "interrupted" | "error";
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
