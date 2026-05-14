// Core
export { AgentLoop, IterationBudget } from "./core/agent.js";
export { ToolRegistry, type ToolRegistryOptions } from "./core/tools.js";
export { loadConfig, resolveConfig, resolveApiKey } from "./core/config.js";

// Adapters
export { AnthropicAdapter } from "./adapters/anthropic.js";
export { OpenAICompatAdapter } from "./adapters/openai-compat.js";
export { OllamaAdapter } from "./adapters/ollama.js";
export { ProviderRegistry } from "./adapters/registry.js";
export { MockAdapter, type MockResponse } from "./adapters/mock.js";

// Types (re-export for convenience)
export type {
  Message,
  ToolCall,
  ToolResult,
  ChatResponse,
  StreamChunk,
  TokenUsage,
  ModelCapabilities,
  ChatOptions,
  ToolDefinition,
  ModelAdapter,
  Tool,
  ToolCapability,
  PermissionMode,
  AgentLoopEvent,
  AgentLoopEventType,
  AgentLoopConfig,
  AgentConfig,
  ProviderConfig,
  ModelInfo,
  ToolContext,
} from "./types.js";

// Memory
export { MemoryFileStore, type MemoryEntry } from "./memory/file-store.js";
export { Mem0Client, type Mem0SearchResult, type Mem0SdkClient } from "./memory/mem0-client.js";
export { MemoryManager, type MergedMemoryResult, type RecallOptions } from "./memory/manager.js";
export {
  SessionStore,
  type Session,
  type SessionMessage,
  type SessionSummary,
} from "./memory/session.js";
export {
  ContextCompactor,
  estimateTokens,
  shouldCompact,
  pruneToolOutputs,
  type CompactOptions,
  type CompactResult,
} from "./memory/compaction.js";

// Skills
export { SkillLoader, type Skill } from "./skills/loader.js";
export { SkillRegistry, type ListOptions as SkillListOptions } from "./skills/registry.js";
export { SkillExecutor, type SkillExecuteOptions, type SkillExecuteResult } from "./skills/executor.js";
