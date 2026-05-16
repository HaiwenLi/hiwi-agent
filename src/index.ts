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
export {
  AutoExtractor,
  type ExtractedFact,
  type AutoExtractorOptions,
} from "./memory/auto-extract.js";
export {
  SessionSummarizer,
  type SessionSummary as SessionSummaryGenerated,
} from "./memory/session-summary.js";
export { EntityLinker, type Entity, type LinkedMemories } from "./memory/entity-link.js";
export { KnowledgeBase, type KnowledgeEntry } from "./memory/knowledge-base.js";
export { UserProfileManager, type UserProfile } from "./memory/user-profile.js";

// Skills
export { SkillLoader, type Skill } from "./skills/loader.js";
export { SkillRegistry, type ListOptions as SkillListOptions } from "./skills/registry.js";
export {
  SkillExecutor,
  type SkillExecuteOptions,
  type SkillExecuteResult,
} from "./skills/executor.js";

// CLI
export { CommandRegistry, type Command, type CommandContext } from "./cli/commands.js";
export { REPL, type REPLDependencies } from "./cli/repl.js";
export { renderApp, type AppProps } from "./cli/app.js";
export { main } from "./cli/index.js";

// MCP
export { MCPServer, type MCPServerOptions } from "./mcp/server.js";
export { createMCPTools, type MCPTool, type MCPToolContext } from "./mcp/tools.js";
