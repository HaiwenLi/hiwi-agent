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
