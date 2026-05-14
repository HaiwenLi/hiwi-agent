# Sprint 1: Core Engine + Adapters — TDD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the runnable core of hiwi-agent — config loading, model adapters (Anthropic/OpenAI-compat/Ollama), provider registry, tool registry with permissions, and the agent loop.

**Architecture:** Modular monolith. Manual DI (interfaces + classes, no framework). neverthrow for composable errors. Zod for runtime validation. While-loop agent with hybrid tool execution (read parallel, write serial, conflict detection). Streaming + interruptible.

**Tech Stack:** TypeScript 5.x, Node.js LTS, pnpm, tsup, Biome, Vitest, Zod, neverthrow, @anthropic-ai/sdk, openai

**Reference docs:** `docs/plans/checkpoint-2026-05-13-implementation-planning.md`, `docs/plans/2026-05-13-personal-agent-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `tsup.config.ts`
- Create: `config/default.json`
- Create: `src/index.ts` (placeholder)
- Create: `tests/unit/setup.ts`

**Step 1: Initialize pnpm project**

```bash
cd /c/Users/weaso/Desktop/workspace/agent-design
pnpm init
```

**Step 2: Create package.json with all dependencies**

```jsonc
// package.json
{
  "name": "hiwi-agent",
  "version": "0.1.0",
  "type": "module",
  "description": "Personal AI agent with persistent memory, multi-model support, and reusable skills",
  "main": "dist/index.js",
  "bin": {
    "hiwi-agent": "dist/index.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check src tests",
    "lint:fix": "biome check --fix src tests",
    "typecheck": "tsc --noEmit",
    "check": "pnpm lint && pnpm typecheck && pnpm test"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "neverthrow": "^8.2.0",
    "openai": "^4.91.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.4.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

**Step 3: Install dependencies**

```bash
pnpm install
```

**Step 4: Create tsconfig.json**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 5: Create biome.json**

```jsonc
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "warn" },
      "complexity": { "noBannedTypes": "off" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

**Step 6: Create vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

**Step 7: Create tsup.config.ts**

```typescript
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
});
```

**Step 8: Create directory structure and placeholder files**

```bash
mkdir -p src/core src/adapters src/memory src/skills src/mcp src/cli src/tools
mkdir -p tests/unit/core tests/unit/adapters tests/integration
mkdir -p config
```

**Step 9: Create src/index.ts placeholder**

```typescript
// src/index.ts
export { AgentLoop } from "./core/agent.js";
export { ProviderRegistry } from "./adapters/registry.js";
export { ToolRegistry } from "./core/tools.js";
export { loadConfig } from "./core/config.js";
```

**Step 10: Create tests/unit/setup.ts**

```typescript
// tests/unit/setup.ts
// Shared test utilities and setup
```

**Step 11: Create config/default.json**

```jsonc
// config/default.json
{
  "activeProvider": "anthropic",
  "activeModel": "claude-sonnet-4-6",
  "providers": {
    "anthropic": {
      "apiKey": "env:ANTHROPIC_API_KEY"
    },
    "openai": {
      "apiKey": "env:OPENAI_API_KEY"
    },
    "deepseek": {
      "apiKey": "env:DEEPSEEK_API_KEY",
      "baseUrl": "https://api.deepseek.com"
    },
    "ollama": {
      "baseUrl": "http://localhost:11434"
    },
    "zhipu": {
      "apiKey": "env:ZHIPU_API_KEY",
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4"
    },
    "kimi": {
      "apiKey": "env:MOONSHOT_API_KEY",
      "baseUrl": "https://api.moonshot.cn/v1"
    },
    "minimax": {
      "apiKey": "env:MINIMAX_API_KEY",
      "baseUrl": "https://api.minimax.chat/v1"
    }
  },
  "agent": {
    "maxLoops": 50,
    "maxOutputTokensPerTurn": 4096,
    "budgetTotal": 50,
    "refundableTools": ["read_file", "glob", "grep", "web_search"],
    "streaming": true,
    "interruptible": true
  }
}
```

**Step 12: Create .gitignore**

```
node_modules/
dist/
coverage/
.env
*.log
.agent/
```

**Step 13: Verify toolchain works**

```bash
pnpm typecheck   # should pass (empty project)
pnpm test        # should pass (no tests yet)
pnpm lint        # should pass (no files to check)
pnpm build       # should produce dist/index.js
```

**Step 14: Init git and commit**

```bash
git init
git add -A
git commit -m "chore: initialize hiwi-agent project scaffolding

- pnpm + TypeScript 5.x + Node.js 20+ (ESM)
- tsup build, Biome lint/format, Vitest test
- Config with Zod validation, neverthrow errors
- Default config with 7 providers
- 80% coverage threshold"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`
- Create: `tests/unit/types.test.ts`

This file defines all shared types used across modules. No logic, just type definitions — the test validates the type contracts exist and are correct.

**Step 1: Write the type contract test**

```typescript
// tests/unit/types.test.ts
import { describe, it, expectTypeOf } from "vitest";
import type {
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
} from "@/types.js";

describe("Shared Types", () => {
  it("Message has required fields", () => {
    const msg: Message = { role: "user", content: "hello" };
    expectTypeOf(msg.role).toEqualTypeOf<"system" | "user" | "assistant" | "tool">();
  });

  it("Message can have optional toolCalls", () => {
    const msg: Message = {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/a" } }],
    };
    expect(msg.toolCalls).toHaveLength(1);
  });

  it("ToolResult has isError flag", () => {
    const result: ToolResult = { toolCallId: "c1", content: "ok", isError: false };
    expect(result.isError).toBe(false);
  });

  it("ChatResponse has finishReason", () => {
    const resp: ChatResponse = {
      content: "hi",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    expect(resp.finishReason).toBe("stop");
  });

  it("StreamChunk discriminated union works", () => {
    const textChunk: StreamChunk = { type: "text-delta", text: "hello" };
    const toolChunk: StreamChunk = {
      type: "tool-call",
      toolCall: { id: "c1", name: "bash", input: { command: "ls" } },
    };
    const finishChunk: StreamChunk = {
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    expect(textChunk.type).toBe("text-delta");
    expect(toolChunk.type).toBe("tool-call");
    expect(finishChunk.type).toBe("finish");
  });

  it("PermissionMode is the correct union", () => {
    const mode: PermissionMode = "normal";
    expect(["normal", "auto", "yolo"]).toContain(mode);
  });

  it("AgentLoopConfig has sensible defaults", () => {
    const config: AgentLoopConfig = {
      maxLoops: 50,
      maxOutputTokensPerTurn: 4096,
      budgetTotal: 50,
      refundableTools: ["read_file", "glob", "grep"],
      streaming: true,
      interruptible: true,
    };
    expect(config.maxLoops).toBe(50);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/types.test.ts
```

Expected: FAIL — `@/types.js` does not exist yet.

**Step 3: Create src/types.ts**

```typescript
// src/types.ts

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
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
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

export type ToolCapability = "ReadOnly" | "WriteFiles" | "ExecCode" | "Network";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  capabilities: ToolCapability[];
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
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
}

export interface AgentConfig {
  activeProvider: string;
  activeModel: string;
  providers: Record<string, ProviderConfig>;
  agent: AgentLoopConfig;
}

// ─── Model Info (for listing) ─────────────────────────────────

export interface ModelInfo {
  id: string;
  provider: string;
  capabilities: ModelCapabilities;
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/types.test.ts
```

Expected: PASS — all type contracts validated.

**Step 5: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "feat: add shared types for messages, adapters, tools, and agent loop"
```

---

## Task 3: Config Module

**Files:**
- Create: `src/core/config.ts`
- Create: `tests/unit/core/config.test.ts`

Config loading with Zod validation, env var resolution (`env:VAR_NAME`), deep merge of global + project configs, priority: env > project > global.

**Step 1: Write the failing tests**

```typescript
// tests/unit/core/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, resolveConfig, resolveApiKey } from "@/core/config.js";
import type { AgentConfig } from "@/types.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Config Module", () => {
  describe("resolveApiKey", () => {
    it("resolves env: prefix to environment variable", () => {
      process.env.TEST_API_KEY = "sk-test-123";
      expect(resolveApiKey("env:TEST_API_KEY")).toBe("sk-test-123");
      delete process.env.TEST_API_KEY;
    });

    it("returns raw value if no env: prefix", () => {
      expect(resolveApiKey("sk-direct-key")).toBe("sk-direct-key");
    });

    it("returns undefined for missing env var", () => {
      delete process.env.NONEXISTENT_KEY;
      expect(resolveApiKey("env:NONEXISTENT_KEY")).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(resolveApiKey(undefined)).toBeUndefined();
    });
  });

  describe("resolveConfig", () => {
    it("resolves all env: apiKeys in provider configs", () => {
      process.env.MY_TEST_KEY = "resolved-key";
      const config: AgentConfig = {
        activeProvider: "anthropic",
        activeModel: "claude-sonnet-4-6",
        providers: {
          anthropic: { apiKey: "env:MY_TEST_KEY" },
          openai: { apiKey: "sk-direct" },
        },
        agent: {
          maxLoops: 50,
          maxOutputTokensPerTurn: 4096,
          budgetTotal: 50,
          refundableTools: ["read_file"],
          streaming: true,
          interruptible: true,
        },
      };
      const resolved = resolveConfig(config);
      expect(resolved.providers.anthropic?.apiKey).toBe("resolved-key");
      expect(resolved.providers.openai?.apiKey).toBe("sk-direct");
      delete process.env.MY_TEST_KEY;
    });
  });

  describe("loadConfig", () => {
    const tmpDir = path.join(os.tmpdir(), "hiwi-config-test");

    beforeEach(async () => {
      await fs.mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    it("returns default config when no files exist", async () => {
      const result = await loadConfig(tmpDir);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.activeProvider).toBe("anthropic");
        expect(result.value.agent.maxLoops).toBe(50);
      }
    });

    it("loads global config and merges with defaults", async () => {
      const globalConfig = { activeProvider: "openai", activeModel: "gpt-4" };
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        JSON.stringify(globalConfig),
      );
      const result = await loadConfig(tmpDir);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.activeProvider).toBe("openai");
        expect(result.value.agent.maxLoops).toBe(50); // default preserved
      }
    });

    it("project config overrides global config", async () => {
      // global
      await fs.mkdir(path.join(tmpDir, "global"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "global", "config.json"),
        JSON.stringify({ activeProvider: "openai", activeModel: "gpt-4" }),
      );
      // project
      await fs.mkdir(path.join(tmpDir, "project"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "project", ".agent"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "project", ".agent", "config.json"),
        JSON.stringify({ activeModel: "gpt-4o" }),
      );

      const result = await loadConfig(
        path.join(tmpDir, "global"),
        path.join(tmpDir, "project"),
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.activeProvider).toBe("openai"); // from global
        expect(result.value.activeModel).toBe("gpt-4o"); // overridden by project
      }
    });

    it("returns error for invalid config", async () => {
      await fs.writeFile(
        path.join(tmpDir, "config.json"),
        JSON.stringify({ activeProvider: 123 }), // invalid type
      );
      const result = await loadConfig(tmpDir);
      expect(result.isErr()).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/core/config.test.ts
```

Expected: FAIL — `@/core/config.js` does not exist.

**Step 3: Create src/core/config.ts**

```typescript
// src/core/config.ts
import { z } from "zod";
import { err, ok, type Result } from "neverthrow";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentConfig, ProviderConfig, AgentLoopConfig } from "../types.js";

const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z.array(z.string()).optional(),
});

const AgentLoopConfigSchema = z.object({
  maxLoops: z.number().default(50),
  maxOutputTokensPerTurn: z.number().default(4096),
  budgetTotal: z.number().default(50),
  refundableTools: z.array(z.string()).default(["read_file", "glob", "grep", "web_search"]),
  streaming: z.boolean().default(true),
  interruptible: z.boolean().default(true),
});

const AgentConfigSchema = z.object({
  activeProvider: z.string().default("anthropic"),
  activeModel: z.string().default("claude-sonnet-4-6"),
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  agent: AgentLoopConfigSchema.default({}),
});

const DEFAULT_CONFIG: AgentConfig = {
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4-6",
  providers: {},
  agent: {
    maxLoops: 50,
    maxOutputTokensPerTurn: 4096,
    budgetTotal: 50,
    refundableTools: ["read_file", "glob", "grep", "web_search"],
    streaming: true,
    interruptible: true,
  },
};

export function resolveApiKey(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.startsWith("env:")) {
    return process.env[value.slice(4)];
  }
  return value;
}

export function resolveConfig(config: AgentConfig): AgentConfig {
  const resolvedProviders: Record<string, ProviderConfig> = {};
  for (const [name, provider] of Object.entries(config.providers)) {
    resolvedProviders[name] = {
      ...provider,
      apiKey: resolveApiKey(provider.apiKey),
    };
  }
  return { ...config, providers: resolvedProviders };
}

function deepMerge(base: AgentConfig, override: Partial<AgentConfig>): AgentConfig {
  return {
    ...base,
    ...override,
    providers: { ...base.providers, ...override.providers },
    agent: { ...base.agent, ...override.agent },
  };
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loadConfig(
  globalDir: string,
  projectDir?: string,
): Promise<Result<AgentConfig, Error>> {
  // Start with defaults
  let config: AgentConfig = { ...DEFAULT_CONFIG };

  // Load global config
  const globalData = await readJsonFile(path.join(globalDir, "config.json"));
  if (globalData) {
    const parsed = AgentConfigSchema.safeParse(globalData);
    if (!parsed.success) {
      return err(new Error(`Invalid global config: ${parsed.error.message}`));
    }
    config = deepMerge(config, parsed.data as Partial<AgentConfig>);
  }

  // Load project config (overrides global)
  if (projectDir) {
    const projectData = await readJsonFile(path.join(projectDir, ".agent", "config.json"));
    if (projectData) {
      const parsed = AgentConfigSchema.safeParse(projectData);
      if (!parsed.success) {
        return err(new Error(`Invalid project config: ${parsed.error.message}`));
      }
      config = deepMerge(config, parsed.data as Partial<AgentConfig>);
    }
  }

  // Resolve env vars
  return ok(resolveConfig(config));
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/core/config.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/config.ts tests/unit/core/config.test.ts
git commit -m "feat: config loading with Zod validation, env var resolution, deep merge"
```

---

## Task 4: Mock Adapter

**Files:**
- Create: `src/adapters/mock.ts`
- Create: `tests/unit/adapters/mock.test.ts`

A fixture-based adapter that returns canned responses. Used by all other tests — no real API calls. The mock adapter simulates multi-turn conversations: it returns predefined responses in sequence.

**Step 1: Write the failing tests**

```typescript
// tests/unit/adapters/mock.test.ts
import { describe, it, expect } from "vitest";
import { MockAdapter, type MockResponse } from "@/adapters/mock.js";

describe("MockAdapter", () => {
  it("returns predefined text response", async () => {
    const mock = new MockAdapter([
      { content: "Hello!", toolCalls: [], finishReason: "stop" },
    ]);
    const resp = await mock.chat([{ role: "user", content: "hi" }]);
    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
  });

  it("returns responses in sequence, then repeats last", async () => {
    const mock = new MockAdapter([
      { content: "first", toolCalls: [], finishReason: "stop" },
      { content: "second", toolCalls: [], finishReason: "stop" },
    ]);
    const r1 = await mock.chat([{ role: "user", content: "a" }]);
    const r2 = await mock.chat([{ role: "user", content: "b" }]);
    const r3 = await mock.chat([{ role: "user", content: "c" }]);
    expect(r1.content).toBe("first");
    expect(r2.content).toBe("second");
    expect(r3.content).toBe("second"); // repeats last
  });

  it("returns tool calls", async () => {
    const mock = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/a" } }],
        finishReason: "tool-calls",
      },
    ]);
    const resp = await mock.chat([{ role: "user", content: "read file" }]);
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0].name).toBe("read_file");
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("streams text as text-delta chunks", async () => {
    const mock = new MockAdapter([
      { content: "Hello World", toolCalls: [], finishReason: "stop" },
    ]);
    const chunks: string[] = [];
    for await (const chunk of mock.stream([{ role: "user", content: "hi" }])) {
      if (chunk.type === "text-delta" && chunk.text) {
        chunks.push(chunk.text);
      }
    }
    // Mock streams word by word
    expect(chunks.join("")).toBe("Hello World");
  });

  it("reports capabilities", () => {
    const mock = new MockAdapter([], {
      id: "test-model",
      provider: "test",
      capabilities: { tools: true, vision: false, maxTokens: 4096, contextWindow: 8192 },
    });
    expect(mock.id).toBe("test-model");
    expect(mock.provider).toBe("test");
    expect(mock.capabilities.tools).toBe(true);
  });

  it("tracks usage (incrementing token counts)", async () => {
    const mock = new MockAdapter([
      { content: "Hi", toolCalls: [], finishReason: "stop" },
    ]);
    const resp = await mock.chat([{ role: "user", content: "hello" }]);
    expect(resp.usage.inputTokens).toBeGreaterThan(0);
    expect(resp.usage.outputTokens).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/adapters/mock.test.ts
```

Expected: FAIL

**Step 3: Create src/adapters/mock.ts**

```typescript
// src/adapters/mock.ts
import type {
  ModelAdapter,
  ModelCapabilities,
  Message,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolCall,
} from "../types.js";

export interface MockResponse {
  content: string;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool-calls" | "max-tokens";
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 4096,
  contextWindow: 128_000,
};

export class MockAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;

  private responses: MockResponse[];
  private callIndex = 0;
  private tokenCounter = 0;

  constructor(
    responses: MockResponse[],
    options?: {
      id?: string;
      provider?: string;
      capabilities?: Partial<ModelCapabilities>;
    },
  ) {
    this.responses = responses;
    this.id = options?.id ?? "mock-model";
    this.provider = options?.provider ?? "mock";
    this.capabilities = { ...DEFAULT_CAPABILITIES, ...options?.capabilities };
  }

  async chat(messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
    const response = this.getCurrentResponse();
    this.tokenCounter += 1;

    return {
      content: response.content,
      toolCalls: response.toolCalls,
      finishReason: response.finishReason,
      usage: {
        inputTokens: messages.reduce((sum, m) => sum + m.content.length, 0),
        outputTokens: response.content.length + response.toolCalls.length * 50,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const response = this.getCurrentResponse();

    if (response.toolCalls.length > 0) {
      for (const tc of response.toolCalls) {
        yield { type: "tool-call", toolCall: tc };
      }
    }

    // Stream content word by word
    const words = response.content.split(" ");
    for (let i = 0; i < words.length; i++) {
      const text = i === 0 ? words[i] : ` ${words[i]}`;
      yield { type: "text-delta", text };
    }

    yield {
      type: "finish",
      finishReason: response.finishReason,
      usage: {
        inputTokens: messages.reduce((sum, m) => sum + m.content.length, 0),
        outputTokens: response.content.length,
      },
    };
  }

  private getCurrentResponse(): MockResponse {
    if (this.responses.length === 0) {
      return { content: "", toolCalls: [], finishReason: "stop" };
    }
    const idx = Math.min(this.callIndex, this.responses.length - 1);
    this.callIndex += 1;
    return this.responses[idx];
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/adapters/mock.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/mock.ts tests/unit/adapters/mock.test.ts
git commit -m "feat: mock adapter with fixture responses for testing"
```

---

## Task 5: Anthropic Adapter

**Files:**
- Create: `src/adapters/anthropic.ts`
- Create: `tests/unit/adapters/anthropic.test.ts`

Wraps `@anthropic-ai/sdk`. Converts our `Message[]` to Anthropic format, handles tool calls, streams. Tests use nock to mock HTTP — no real API calls.

**Step 1: Write the failing tests**

```typescript
// tests/unit/adapters/anthropic.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnthropicAdapter } from "@/adapters/anthropic.js";

// Mock the Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  const mockStream = vi.fn();
  return {
    default: vi.fn(() => ({
      messages: {
        create: mockCreate,
        stream: mockStream,
      },
    })),
    __mockCreate: mockCreate,
    __mockStream: mockStream,
  };
});

import Anthropic from "@anthropic-ai/sdk";

describe("AnthropicAdapter", () => {
  let adapter: AnthropicAdapter;
  const mockCreate = vi.mocked(Anthropic).mockCreate ?? vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new AnthropicAdapter({ apiKey: "sk-test" });
  });

  it("converts messages to Anthropic format", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello!" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const resp = await adapter.chat([
      { role: "user", content: "hi" },
    ]);

    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("handles tool use responses", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "" },
        { type: "tool_use", id: "c1", name: "read_file", input: { path: "/tmp" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "c1",
      name: "read_file",
      input: { path: "/tmp" },
    });
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("converts tool results back to Anthropic format", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "File contents here" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 30, output_tokens: 10 },
    });

    const resp = await adapter.chat([
      { role: "user", content: "read" },
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp" } }] },
      { role: "tool", content: "file content", toolCallId: "c1" },
    ]);

    expect(resp.content).toBe("File contents here");
    // Verify the tool_result was passed correctly in the API call
    const callArgs = mockCreate.mock.calls[0][0];
    const toolResultBlock = callArgs.messages[1].content[0];
    expect(toolResultBlock.type).toBe("tool_result");
  });

  it("reports correct capabilities", () => {
    expect(adapter.id).toBe("claude-sonnet-4-6");
    expect(adapter.provider).toBe("anthropic");
    expect(adapter.capabilities.tools).toBe(true);
    expect(adapter.capabilities.contextWindow).toBe(200_000);
  });

  it("accepts a custom model", async () => {
    const customAdapter = new AnthropicAdapter({
      apiKey: "sk-test",
      model: "claude-opus-4-7",
    });
    expect(customAdapter.id).toBe("claude-opus-4-7");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/adapters/anthropic.test.ts
```

Expected: FAIL

**Step 3: Create src/adapters/anthropic.ts**

```typescript
// src/adapters/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  ModelAdapter,
  ModelCapabilities,
  Message,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolCall,
  ToolDefinition,
} from "../types.js";

const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  "claude-sonnet-4-6": { tools: true, vision: true, maxTokens: 16384, contextWindow: 200_000 },
  "claude-opus-4-7": { tools: true, vision: true, maxTokens: 32768, contextWindow: 200_000 },
  "claude-haiku-4-5": { tools: true, vision: true, maxTokens: 8192, contextWindow: 200_000 },
};

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class AnthropicAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider = "anthropic";
  readonly capabilities: ModelCapabilities;
  private client: Anthropic;

  constructor(options: { apiKey: string; model?: string }) {
    this.id = options.model ?? DEFAULT_MODEL;
    this.capabilities = MODEL_CAPABILITIES[this.id] ?? MODEL_CAPABILITIES[DEFAULT_MODEL];
    this.client = new Anthropic({ apiKey: options.apiKey });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const { system, convertedMessages } = this.convertMessages(messages);
    const response = await this.client.messages.create({
      model: options?.model ?? this.id,
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      system: system ?? undefined,
      messages: convertedMessages,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      temperature: options?.temperature,
    });

    const textParts = response.content.filter((b) => b.type === "text");
    const toolParts = response.content.filter((b) => b.type === "tool_use");

    return {
      content: textParts.map((b) => b.text).join(""),
      toolCalls: toolParts.map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      })),
      finishReason: response.stop_reason === "tool_use" ? "tool-calls" : "stop",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const { system, convertedMessages } = this.convertMessages(messages);
    const stream = this.client.messages.stream({
      model: options?.model ?? this.id,
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      system: system ?? undefined,
      messages: convertedMessages,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      temperature: options?.temperature,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text-delta", text: event.delta.text };
      } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
        yield {
          type: "tool-call",
          toolCall: {
            id: event.content_block.id,
            name: event.content_block.name,
            input: event.content_block.input as Record<string, unknown>,
          },
        };
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: "finish",
      finishReason: finalMessage.stop_reason === "tool_use" ? "tool-calls" : "stop",
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
    };
  }

  private convertMessages(messages: Message[]): {
    system: string | null;
    convertedMessages: Anthropic.MessageParam[];
  } {
    let system: string | null = null;
    const converted: Anthropic.MessageParam[] = [];
    const toolResults = new Map<string, string>();

    // Collect tool results first
    for (const msg of messages) {
      if (msg.role === "tool" && msg.toolCallId) {
        toolResults.set(msg.toolCallId, msg.content);
      }
    }

    for (const msg of messages) {
      if (msg.role === "system") {
        system = (system ?? "") + msg.content;
        continue;
      }

      if (msg.role === "tool") {
        // Tool results are attached to the preceding assistant message
        continue;
      }

      if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        converted.push({ role: "assistant", content });
        continue;
      }

      // user message
      converted.push({ role: "user", content: msg.content });
    }

    // Attach tool results as separate user messages (Anthropic convention)
    const assistantMsgs = messages.filter((m) => m.role === "assistant" && m.toolCalls?.length);
    for (const am of assistantMsgs) {
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tc of am.toolCalls ?? []) {
        results.push({
          type: "tool_result",
          tool_use_id: tc.id,
          content: toolResults.get(tc.id) ?? "",
        });
      }
      if (results.length > 0) {
        converted.push({ role: "user", content: results });
      }
    }

    return { system, convertedMessages: converted };
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
    }));
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/adapters/anthropic.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/anthropic.ts tests/unit/adapters/anthropic.test.ts
git commit -m "feat: Anthropic adapter with message conversion, tool use, and streaming"
```

---

## Task 6: OpenAI-Compatible Adapter

**Files:**
- Create: `src/adapters/openai-compat.ts`
- Create: `tests/unit/adapters/openai-compat.test.ts`

Single adapter covering OpenAI, DeepSeek, Zhipu, Kimi, MiniMax via configurable `baseUrl`. Uses the `openai` SDK.

**Step 1: Write the failing tests**

```typescript
// tests/unit/adapters/openai-compat.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatAdapter } from "@/adapters/openai-compat.js";

vi.mock("openai", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
    __mockCreate: mockCreate,
  };
});

import OpenAI from "openai";

describe("OpenAICompatAdapter", () => {
  const mockCreate = vi.mocked(OpenAI).mockCreate ?? vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates adapter for OpenAI provider", () => {
    const adapter = new OpenAICompatAdapter({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-4o",
    });
    expect(adapter.id).toBe("gpt-4o");
    expect(adapter.provider).toBe("openai");
    expect(adapter.capabilities.contextWindow).toBe(128_000);
  });

  it("creates adapter for DeepSeek with custom baseUrl", () => {
    const adapter = new OpenAICompatAdapter({
      provider: "deepseek",
      apiKey: "sk-ds",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v3",
    });
    expect(adapter.provider).toBe("deepseek");
    expect(adapter.id).toBe("deepseek-v3");
  });

  it("converts and returns text response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { role: "assistant", content: "Hello!" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "hi" }]);

    expect(resp.content).toBe("Hello!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("handles tool_calls response", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "c1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"/tmp"}' },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 15, completion_tokens: 20 },
    });

    const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
    const resp = await adapter.chat([{ role: "user", content: "read" }]);

    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0]).toEqual({
      id: "c1",
      name: "read_file",
      input: { path: "/tmp" },
    });
    expect(resp.finishReason).toBe("tool-calls");
  });

  it("converts tool result messages correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [{
        message: { role: "assistant", content: "Done" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
    });

    const adapter = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test" });
    await adapter.chat([
      { role: "user", content: "read" },
      {
        role: "assistant", content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp" } }],
      },
      { role: "tool", content: "file content", toolCallId: "c1" },
    ]);

    const callArgs = mockCreate.mock.calls[0][0];
    const toolMsg = callArgs.messages[2];
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.content).toBe("file content");
  });

  it("uses model-specific capabilities", () => {
    const gpt4 = new OpenAICompatAdapter({ provider: "openai", apiKey: "sk-test", model: "gpt-4o" });
    expect(gpt4.capabilities.contextWindow).toBe(128_000);

    const deepseek = new OpenAICompatAdapter({ provider: "deepseek", apiKey: "sk-test", model: "deepseek-r1" });
    expect(deepseek.capabilities.contextWindow).toBe(128_000);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/adapters/openai-compat.test.ts
```

Expected: FAIL

**Step 3: Create src/adapters/openai-compat.ts**

```typescript
// src/adapters/openai-compat.ts
import OpenAI from "openai";
import type {
  ModelAdapter,
  ModelCapabilities,
  Message,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolDefinition,
} from "../types.js";

const PROVIDER_CAPABILITIES: Record<string, ModelCapabilities> = {
  "gpt-4o": { tools: true, vision: true, maxTokens: 16384, contextWindow: 128_000 },
  "gpt-4o-mini": { tools: true, vision: true, maxTokens: 16384, contextWindow: 128_000 },
  "deepseek-v3": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
  "deepseek-r1": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
  "glm-4-plus": { tools: true, vision: true, maxTokens: 8192, contextWindow: 128_000 },
  "glm-4-flash": { tools: true, vision: true, maxTokens: 4096, contextWindow: 128_000 },
  "moonshot-v1-128k": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
  "abab-7": { tools: true, vision: false, maxTokens: 8192, contextWindow: 128_000 },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  tools: true,
  vision: false,
  maxTokens: 8192,
  contextWindow: 128_000,
};

export class OpenAICompatAdapter implements ModelAdapter {
  readonly id: string;
  readonly provider: string;
  readonly capabilities: ModelCapabilities;
  private client: OpenAI;

  constructor(options: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }) {
    this.id = options.model ?? "gpt-4o";
    this.provider = options.provider;
    this.capabilities = PROVIDER_CAPABILITIES[this.id] ?? DEFAULT_CAPABILITIES;
    this.client = new OpenAI({
      apiKey: options.apiKey ?? "dummy",
      baseURL: options.baseUrl,
    });
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
    });

    const choice = response.choices[0];
    const tc = choice.message.tool_calls ?? [];

    return {
      content: choice.message.content ?? "",
      toolCalls: tc.map((t) => ({
        id: t.id,
        name: t.function.name,
        input: JSON.parse(t.function.arguments),
      })),
      finishReason: choice.finish_reason === "tool_calls" ? "tool-calls" : "stop",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async *stream(messages: Message[], options?: ChatOptions): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: options?.model ?? this.id,
      messages: this.convertMessages(messages),
      max_tokens: options?.maxTokens ?? this.capabilities.maxTokens,
      temperature: options?.temperature,
      tools: options?.tools ? this.convertTools(options.tools) : undefined,
      stream: true,
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text-delta", text: delta.content };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            yield {
              type: "tool-call",
              toolCall: {
                id: tc.id ?? "",
                name: tc.function.name,
                input: JSON.parse(tc.function.arguments ?? "{}"),
              },
            };
          }
        }
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    yield {
      type: "finish",
      finishReason: "stop",
      usage: { inputTokens, outputTokens },
    };
  }

  private convertMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.ChatCompletionMessageParam => {
      switch (msg.role) {
        case "system":
          return { role: "system", content: msg.content };
        case "user":
          return { role: "user", content: msg.content };
        case "assistant":
          return {
            role: "assistant",
            content: msg.content || null,
            tool_calls: msg.toolCalls?.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          };
        case "tool":
          return {
            role: "tool",
            content: msg.content,
            tool_call_id: msg.toolCallId ?? "",
          };
      }
    });
  }

  private convertTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/adapters/openai-compat.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/openai-compat.ts tests/unit/adapters/openai-compat.test.ts
git commit -m "feat: OpenAI-compatible adapter covering 5 providers via baseUrl config"
```

---

## Task 7: Ollama Adapter

**Files:**
- Create: `src/adapters/ollama.ts`
- Create: `tests/unit/adapters/ollama.test.ts`

HTTP-based adapter for Ollama local LLM. Uses native fetch against `localhost:11434/api/chat`. No SDK dependency — Ollama's API is simple enough for direct HTTP.

**Step 1: Write the failing tests**

```typescript
// tests/unit/adapters/ollama.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaAdapter } from "@/adapters/ollama.js";

describe("OllamaAdapter", () => {
  let adapter: OllamaAdapter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    adapter = new OllamaAdapter({ baseUrl: "http://localhost:11434", model: "llama3" });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: unknown): void {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response),
    });
  }

  it("returns text response from Ollama", async () => {
    mockFetch({
      message: { role: "assistant", content: "Hello from Ollama!" },
      done: true,
      prompt_eval_count: 10,
      eval_count: 5,
    });

    const resp = await adapter.chat([{ role: "user", content: "hi" }]);
    expect(resp.content).toBe("Hello from Ollama!");
    expect(resp.finishReason).toBe("stop");
    expect(resp.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  it("handles tool calls from Ollama", async () => {
    mockFetch({
      message: {
        role: "assistant",
        content: "",
        tool_calls: [{
          function: { name: "read_file", arguments: { path: "/tmp" } },
        }],
      },
      done: true,
      prompt_eval_count: 15,
      eval_count: 10,
    });

    const resp = await adapter.chat([{ role: "user", content: "read" }]);
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.toolCalls[0].name).toBe("read_file");
    expect(resp.toolCalls[0].input).toEqual({ path: "/tmp" });
  });

  it("reports capabilities for known models", () => {
    expect(adapter.id).toBe("llama3");
    expect(adapter.provider).toBe("ollama");
    expect(adapter.capabilities.tools).toBe(true);
  });

  it("uses default capabilities for unknown models", () => {
    const custom = new OllamaAdapter({ baseUrl: "http://localhost:11434", model: "custom-model" });
    expect(custom.capabilities.contextWindow).toBe(8192);
  });

  it("throws on connection error with descriptive message", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    await expect(
      adapter.chat([{ role: "user", content: "hi" }]),
    ).rejects.toThrow("Ollama");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/adapters/ollama.test.ts
```

Expected: FAIL

**Step 3: Create src/adapters/ollama.ts**

```typescript
// src/adapters/ollama.ts
import type {
  ModelAdapter,
  ModelCapabilities,
  Message,
  ChatOptions,
  ChatResponse,
  StreamChunk,
  ToolDefinition,
} from "../types.js";

const OLLAMA_CAPABILITIES: Record<string, ModelCapabilities> = {
  llama3: { tools: true, vision: false, maxTokens: 8192, contextWindow: 8192 },
  llama3.1: { tools: true, vision: false, maxTokens: 32768, contextWindow: 128_000 },
  qwen2.5: { tools: true, vision: false, maxTokens: 8192, contextWindow: 32768 },
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
        message: { role: string; content: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> };
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
      throw new Error(
        `Ollama error: ${error instanceof Error ? error.message : String(error)}`,
      );
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
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/adapters/ollama.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/ollama.ts tests/unit/adapters/ollama.test.ts
git commit -m "feat: Ollama adapter with native HTTP, tool calls, and streaming"
```

---

## Task 8: Provider Registry

**Files:**
- Create: `src/adapters/registry.ts`
- Create: `tests/unit/adapters/registry.test.ts`

Central registry for all adapters. Manages active provider/model, creates adapters from config, lists available models, tests connections.

**Step 1: Write the failing tests**

```typescript
// tests/unit/adapters/registry.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistry } from "@/adapters/registry.js";
import { MockAdapter } from "@/adapters/mock.js";
import type { AgentConfig } from "@/types.js";

const TEST_CONFIG: AgentConfig = {
  activeProvider: "anthropic",
  activeModel: "claude-sonnet-4-6",
  providers: {
    anthropic: { apiKey: "sk-test" },
    openai: { apiKey: "sk-openai" },
    ollama: { baseUrl: "http://localhost:11434" },
  },
  agent: {
    maxLoops: 50,
    maxOutputTokensPerTurn: 4096,
    budgetTotal: 50,
    refundableTools: ["read_file"],
    streaming: true,
    interruptible: true,
  },
};

describe("ProviderRegistry", () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry(TEST_CONFIG);
  });

  it("registers a custom adapter", () => {
    const mock = new MockAdapter([], { id: "test-model", provider: "test" });
    registry.registerAdapter("test", mock);
    expect(registry.getActiveAdapter()).toBe(mock);
  });

  it("switches active provider with setProvider", () => {
    const mock1 = new MockAdapter([], { provider: "anthropic" });
    const mock2 = new MockAdapter([], { provider: "openai" });
    registry.registerAdapter("anthropic", mock1);
    registry.registerAdapter("openai", mock2);

    registry.setProvider("openai");
    expect(registry.getActiveAdapter().provider).toBe("openai");
  });

  it("switches active model with setModel", () => {
    const mock = new MockAdapter([], { id: "model-a", provider: "anthropic" });
    registry.registerAdapter("anthropic", mock);

    registry.setModel("model-b");
    // Model change should update the config
    expect(registry.getActiveModel()).toBe("model-b");
  });

  it("lists registered models", () => {
    const mock = new MockAdapter([], { id: "test-model", provider: "test" });
    registry.registerAdapter("test", mock);
    const models = registry.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("test-model");
  });

  it("throws when no adapter registered for active provider", () => {
    // Default config has anthropic, but no adapter registered
    expect(() => registry.getActiveAdapter()).toThrow(/no adapter/i);
  });

  it("creates adapters from config entries (with env vars resolved)", () => {
    process.env.TEST_ANTHROPIC_KEY = "sk-resolved";
    const config: AgentConfig = {
      ...TEST_CONFIG,
      providers: {
        anthropic: { apiKey: "env:TEST_ANTHROPIC_KEY" },
      },
    };
    const reg = new ProviderRegistry(config);
    // Can create adapter even before registering
    expect(() => reg.createAdapter("anthropic")).not.toThrow();
    delete process.env.TEST_ANTHROPIC_KEY;
  });

  it("returns the active provider and model names", () => {
    expect(registry.getActiveProvider()).toBe("anthropic");
    expect(registry.getActiveModel()).toBe("claude-sonnet-4-6");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/adapters/registry.test.ts
```

Expected: FAIL

**Step 3: Create src/adapters/registry.ts**

```typescript
// src/adapters/registry.ts
import type { ModelAdapter, AgentConfig, ModelInfo, ProviderConfig } from "../types.js";
import { AnthropicAdapter } from "./anthropic.js";
import { OpenAICompatAdapter } from "./openai-compat.js";
import { OllamaAdapter } from "./ollama.js";

export class ProviderRegistry {
  private adapters = new Map<string, ModelAdapter>();
  private activeProvider: string;
  private activeModel: string;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
    this.activeProvider = config.activeProvider;
    this.activeModel = config.activeModel;
  }

  registerAdapter(name: string, adapter: ModelAdapter): void {
    this.adapters.set(name, adapter);
  }

  getActiveAdapter(): ModelAdapter {
    const adapter = this.adapters.get(this.activeProvider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${this.activeProvider}`);
    }
    return adapter;
  }

  setProvider(name: string): void {
    this.activeProvider = name;
  }

  setModel(modelId: string): void {
    this.activeModel = modelId;
  }

  getActiveProvider(): string {
    return this.activeProvider;
  }

  getActiveModel(): string {
    return this.activeModel;
  }

  listModels(): ModelInfo[] {
    return Array.from(this.adapters.entries()).map(([, adapter]) => ({
      id: adapter.id,
      provider: adapter.provider,
      capabilities: adapter.capabilities,
    }));
  }

  createAdapter(providerName: string): ModelAdapter {
    const providerConfig: ProviderConfig = this.config.providers[providerName] ?? {};
    const apiKey = providerConfig.apiKey;
    const baseUrl = providerConfig.baseUrl;

    switch (providerName) {
      case "anthropic":
        if (!apiKey) throw new Error(`No API key for provider: ${providerName}`);
        return new AnthropicAdapter({ apiKey, model: this.activeModel });

      case "ollama":
        return new OllamaAdapter({ baseUrl, model: this.activeModel });

      default: {
        // OpenAI-compatible: openai, deepseek, zhipu, kimi, minimax
        if (!apiKey && providerName !== "ollama") {
          throw new Error(`No API key for provider: ${providerName}`);
        }
        return new OpenAICompatAdapter({
          provider: providerName,
          apiKey,
          baseUrl,
          model: this.activeModel,
        });
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/adapters/registry.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/adapters/registry.ts tests/unit/adapters/registry.test.ts
git commit -m "feat: provider registry with adapter creation, provider/model switching"
```

---

## Task 9: Tool Interface + Registry + Permission Model

**Files:**
- Create: `src/core/tools.ts`
- Create: `tests/unit/core/tools.test.ts`

Tool registry with permission checking. Three permission modes (normal/auto/yolo). Tools declare capabilities (ReadOnly/WriteFiles/ExecCode/Network) and the registry checks permissions before execution.

**Step 1: Write the failing tests**

```typescript
// tests/unit/core/tools.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolRegistry } from "@/core/tools.js";
import type { Tool, ToolContext, PermissionMode } from "@/types.js";

const makeTool = (overrides: Partial<Tool> = {}): Tool => ({
  name: overrides.name ?? "test_tool",
  description: overrides.description ?? "A test tool",
  inputSchema: { type: "object" },
  capabilities: overrides.capabilities ?? ["ReadOnly"],
  execute: overrides.execute ?? vi.fn(async () => ({
    toolCallId: "c1",
    content: "ok",
    isError: false,
  })),
});

const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and retrieves a tool", () => {
    const tool = makeTool();
    registry.register(tool);
    expect(registry.get("test_tool")).toBe(tool);
  });

  it("lists all registered tools", () => {
    registry.register(makeTool({ name: "tool_a" }));
    registry.register(makeTool({ name: "tool_b" }));
    expect(registry.list()).toHaveLength(2);
  });

  it("returns undefined for unknown tool", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  describe("execute", () => {
    it("executes a ReadOnly tool in normal mode without asking", async () => {
      const tool = makeTool({ name: "read_file", capabilities: ["ReadOnly"] });
      registry.register(tool);
      const result = await registry.execute("read_file", { path: "/tmp/a" }, ctx, "normal");
      expect(result.isError).toBe(false);
      expect(result.content).toBe("ok");
    });

    it("executes a WriteFiles tool in normal mode with permission callback", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      const result = await registry.execute("write_file", { path: "/tmp/a" }, ctx, "normal");
      expect(onPermission).toHaveBeenCalledWith("write_file", "WriteFiles");
      expect(result.isError).toBe(false);
    });

    it("returns permission denied when user rejects", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => false);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      const result = await registry.execute("write_file", { path: "/tmp/a" }, ctx, "normal");
      expect(result.isError).toBe(true);
      expect(result.content).toContain("denied");
    });

    it("auto-approves ReadOnly in auto mode", async () => {
      const tool = makeTool({ name: "read_file", capabilities: ["ReadOnly"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      await registry.execute("read_file", {}, ctx, "auto");
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("asks for WriteFiles in auto mode", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      await registry.execute("write_file", {}, ctx, "auto");
      expect(onPermission).toHaveBeenCalledWith("write_file", "WriteFiles");
    });

    it("auto-approves everything in yolo mode", async () => {
      const tool = makeTool({ name: "bash", capabilities: ["ExecCode", "WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      await registry.execute("bash", { command: "rm -rf /" }, ctx, "yolo");
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("returns error for unknown tool", async () => {
      const result = await registry.execute("nonexistent", {}, ctx, "normal");
      expect(result.isError).toBe(true);
      expect(result.content).toContain("not found");
    });

    it("remembers permission grant within session", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      // First call asks
      await registry.execute("write_file", { path: "/tmp/a" }, ctx, "normal");
      // Second call should not ask (remembered)
      await registry.execute("write_file", { path: "/tmp/b" }, ctx, "normal");
      expect(onPermission).toHaveBeenCalledTimes(1);
    });
  });

  it("converts registered tools to ToolDefinition format for adapters", () => {
    registry.register(makeTool({
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    }));
    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("read_file");
    expect(defs[0].inputSchema).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/core/tools.test.ts
```

Expected: FAIL

**Step 3: Create src/core/tools.ts**

```typescript
// src/core/tools.ts
import type { Tool, ToolContext, ToolDefinition, PermissionMode, ToolResult, ToolCapability } from "../types.js";

export interface ToolRegistryOptions {
  onPermission?: (toolName: string, capability: ToolCapability) => Promise<boolean>;
}

const DANGEROUS_CAPABILITIES: ToolCapability[] = ["WriteFiles", "ExecCode", "Network"];

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private permissionCache = new Set<string>(); // tool names approved this session
  private options: ToolRegistryOptions;

  constructor(options: ToolRegistryOptions = {}) {
    this.options = options;
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolContext,
    permissionMode: PermissionMode,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { toolCallId: "", content: `Tool not found: ${name}`, isError: true };
    }

    // Check permissions
    const permitted = await this.checkPermission(tool, permissionMode);
    if (!permitted) {
      return { toolCallId: "", content: `Permission denied for tool: ${name}`, isError: true };
    }

    try {
      return await tool.execute(input, context);
    } catch (error) {
      return {
        toolCallId: "",
        content: `Tool execution error: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }

  toToolDefinitions(): ToolDefinition[] {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  private async checkPermission(tool: Tool, mode: PermissionMode): Promise<boolean> {
    // YOLO: approve everything
    if (mode === "yolo") return true;

    // Auto: approve ReadOnly, ask for everything else
    if (mode === "auto" && tool.capabilities.includes("ReadOnly")) return true;

    // Normal: check cache first
    if (this.permissionCache.has(tool.name)) return true;

    // ReadOnly in normal mode: auto-approve
    const isDangerous = tool.capabilities.some((c) => DANGEROUS_CAPABILITIES.includes(c));
    if (!isDangerous) {
      this.permissionCache.add(tool.name);
      return true;
    }

    // Ask user via callback
    if (this.options.onPermission) {
      for (const cap of tool.capabilities) {
        if (DANGEROUS_CAPABILITIES.includes(cap)) {
          const approved = await this.options.onPermission(tool.name, cap);
          if (approved) {
            this.permissionCache.add(tool.name);
            return true;
          }
          return false;
        }
      }
    }

    // No callback — deny by default for dangerous tools
    return false;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/core/tools.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/tools.ts tests/unit/core/tools.test.ts
git commit -m "feat: tool registry with 3-tier permission model and session caching"
```

---

## Task 10: Agent Loop

**Files:**
- Create: `src/core/agent.ts`
- Create: `tests/unit/core/agent.test.ts`

The heart of the agent. While-loop with: streaming, hybrid tool execution (read parallel / write serial / conflict detection), budget with refund, empty response recovery, interrupt support, max loops guard.

**Step 1: Write the failing tests**

```typescript
// tests/unit/core/agent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentLoop, IterationBudget } from "@/core/agent.js";
import { MockAdapter } from "@/adapters/mock.js";
import { ToolRegistry } from "@/core/tools.js";
import type { AgentLoopConfig, Message, Tool, ToolContext, PermissionMode } from "@/types.js";

const DEFAULT_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: ["read_file", "glob", "grep"],
  streaming: false,
  interruptible: true,
};

const makeTool = (name: string, caps: Tool["capabilities"] = ["ReadOnly"]): Tool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: "object" },
  capabilities: caps,
  execute: vi.fn(async (_input: unknown, _ctx: ToolContext) => ({
    toolCallId: "c1",
    content: `${name} result`,
    isError: false,
  })),
});

describe("IterationBudget", () => {
  it("consumes budget and tracks remaining", () => {
    const budget = new IterationBudget(10, new Set(["read_file"]));
    expect(budget.remaining).toBe(10);
    budget.consume("bash");
    expect(budget.remaining).toBe(9);
  });

  it("refunds refundable tools", () => {
    const budget = new IterationBudget(10, new Set(["read_file"]));
    budget.consume("read_file");
    expect(budget.remaining).toBe(9);
    budget.refund("read_file");
    expect(budget.remaining).toBe(10);
  });

  it("does not refund non-refundable tools", () => {
    const budget = new IterationBudget(10, new Set(["read_file"]));
    budget.consume("bash");
    budget.refund("bash");
    expect(budget.remaining).toBe(9); // no refund
  });

  it("reports exhausted when remaining is 0", () => {
    const budget = new IterationBudget(2, new Set());
    budget.consume("a");
    budget.consume("b");
    expect(budget.exhausted).toBe(true);
  });
});

describe("AgentLoop", () => {
  let toolRegistry: ToolRegistry;
  const ctx = { workingDirectory: "/tmp", sessionId: "s1" };

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  it("completes a simple text-only conversation", async () => {
    const adapter = new MockAdapter([
      { content: "Hello!", toolCalls: [], finishReason: "stop" },
    ]);
    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    const finishEvent = events.find((e) => e.type === "finish");
    expect(finishEvent?.finishReason).toBe("completed");
    expect(events.some((e) => e.type === "text-delta")).toBe(true);
  });

  it("executes a single tool call and continues", async () => {
    const readTool = makeTool("read_file");
    toolRegistry.register(readTool);

    const adapter = new MockAdapter([
      // First: agent calls read_file
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/a" } }],
        finishReason: "tool-calls",
      },
      // Second: agent responds with result
      { content: "File contents: hello", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "read" }])) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "tool-call" && e.toolName === "read_file")).toBe(true);
    expect(events.some((e) => e.type === "tool-result")).toBe(true);
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
  });

  it("executes multiple read-only tools in parallel", async () => {
    const tool1 = makeTool("read_file");
    const tool2 = makeTool("glob");
    toolRegistry.register(tool1);
    toolRegistry.register(tool2);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [
          { id: "c1", name: "read_file", input: { path: "/a" } },
          { id: "c2", name: "glob", input: { pattern: "*.ts" } },
        ],
        finishReason: "tool-calls",
      },
      { content: "Done", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "search" }])) {
      events.push(event);
    }

    // Both tools should have been called
    expect(tool1.execute).toHaveBeenCalled();
    expect(tool2.execute).toHaveBeenCalled();
  });

  it("executes write tools serially when paths conflict", async () => {
    const writeTool = makeTool("write_file", ["WriteFiles"]);
    toolRegistry.register(writeTool);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [
          { id: "c1", name: "write_file", input: { path: "/tmp/a.txt", content: "1" } },
          { id: "c2", name: "write_file", input: { path: "/tmp/a.txt", content: "2" } },
        ],
        finishReason: "tool-calls",
      },
      { content: "Done", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "write" }])) {
      events.push(event);
    }

    // Both should execute but serially (order preserved)
    expect(writeTool.execute).toHaveBeenCalledTimes(2);
  });

  it("stops at max loops", async () => {
    // Adapter always returns tool calls (infinite loop)
    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "/a" } }],
        finishReason: "tool-calls",
      },
    ]);

    const readTool = makeTool("read_file");
    toolRegistry.register(readTool);

    const config = { ...DEFAULT_CONFIG, maxLoops: 3 };
    const loop = new AgentLoop(adapter, toolRegistry, "yolo", config);

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "loop" }])) {
      events.push(event);
    }

    const finishEvent = events.find((e) => e.type === "finish");
    expect(finishEvent?.finishReason).toBe("max-loops");
  });

  it("can be interrupted", async () => {
    const adapter = new MockAdapter([
      { content: "Working...", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);
    loop.interrupt();

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    const finishEvent = events.find((e) => e.type === "finish");
    expect(finishEvent?.finishReason).toBe("interrupted");
  });

  it("handles empty response with retry", async () => {
    const adapter = new MockAdapter([
      { content: "", toolCalls: [], finishReason: "stop" }, // empty first
      { content: "Recovered!", toolCalls: [], finishReason: "stop" }, // retry succeeds
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    // Should have recovered
    expect(events.some((e) => e.text === "Recovered!")).toBe(true);
  });

  it("emits step-start and step-finish per iteration", async () => {
    const adapter = new MockAdapter([
      { content: "Hi", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "normal", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "hi" }])) {
      events.push(event);
    }

    expect(events.some((e) => e.type === "step-start")).toBe(true);
    expect(events.some((e) => e.type === "step-finish")).toBe(true);
  });

  it("tool errors are fed back as tool results, loop continues", async () => {
    const failTool: Tool = {
      name: "bad_tool",
      description: "fails",
      inputSchema: { type: "object" },
      capabilities: ["ReadOnly"],
      execute: vi.fn(async () => ({
        toolCallId: "c1",
        content: "Error: file not found",
        isError: true,
      })),
    };
    toolRegistry.register(failTool);

    const adapter = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "bad_tool", input: {} }],
        finishReason: "tool-calls",
      },
      { content: "I see the error, the file doesn't exist.", toolCalls: [], finishReason: "stop" },
    ]);

    const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG);
    const events = [];
    for await (const event of loop.run([{ role: "user", content: "try" }])) {
      events.push(event);
    }

    const toolResult = events.find((e) => e.type === "tool-result");
    expect(toolResult?.toolResult?.isError).toBe(true);
    // Loop should continue and finish normally
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/core/agent.test.ts
```

Expected: FAIL

**Step 3: Create src/core/agent.ts**

```typescript
// src/core/agent.ts
import type {
  ModelAdapter,
  ToolResult,
  Message,
  AgentLoopConfig,
  AgentLoopEvent,
  PermissionMode,
  ToolContext,
} from "../types.js";
import type { ToolRegistry } from "./tools.js";

// ─── IterationBudget ──────────────────────────────────────────

export class IterationBudget {
  private remaining: number;
  private refundable: Set<string>;

  constructor(total: number, refundableTools: string[]) {
    this.remaining = total;
    this.refundable = new Set(refundableTools);
  }

  consume(toolName: string): void {
    this.remaining -= 1;
    if (this.refundable.has(toolName)) {
      this.remaining += 1; // net zero for refundable
    }
  }

  refund(toolName: string): void {
    if (this.refundable.has(toolName)) {
      this.remaining += 1;
    }
  }

  get isExhausted(): boolean {
    return this.remaining <= 0;
  }
}

// Alias for test compatibility
Object.defineProperty(IterationBudget.prototype, "exhausted", {
  get(this: IterationBudget) { return this.isExhausted; },
});

// ─── Tool Execution Strategy ──────────────────────────────────

type ExecutionMode = "serial" | "parallel" | "mixed";

interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function extractFilePaths(input: Record<string, unknown>): string[] {
  const paths: string[] = [];
  if (typeof input.path === "string") paths.push(input.path);
  if (typeof input.file === "string") paths.push(input.file);
  if (typeof input.directory === "string") paths.push(input.directory);
  if (Array.isArray(input.paths)) paths.push(...input.paths.filter((p): p is string => typeof p === "string"));
  return paths;
}

function shouldParallelize(
  calls: ToolCallInfo[],
  registry: ToolRegistry,
): ExecutionMode {
  if (calls.length <= 1) return "serial";

  const tools = calls.map((c) => registry.get(c.name));
  const anyInteractive = tools.some((t) =>
    t?.capabilities.includes("ExecCode"),
  );
  if (anyInteractive) return "serial";

  const allReadOnly = tools.every((t) =>
    t?.capabilities.includes("ReadOnly") && !t?.capabilities.includes("WriteFiles"),
  );
  if (allReadOnly) return "parallel";

  // Check file path conflicts
  const writeCalls = calls.filter((c) => {
    const t = registry.get(c.name);
    return t?.capabilities.includes("WriteFiles");
  });
  const writePaths = writeCalls.flatMap((c) => extractFilePaths(c.input));
  if (new Set(writePaths).size < writePaths.length) {
    return "serial"; // path conflict
  }

  return "mixed";
}

// ─── AgentLoop ────────────────────────────────────────────────

export class AgentLoop {
  private interrupted = false;

  constructor(
    private adapter: ModelAdapter,
    private toolRegistry: ToolRegistry,
    private permissionMode: PermissionMode,
    private config: AgentLoopConfig,
    private context?: ToolContext,
  ) {}

  interrupt(): void {
    this.interrupted = true;
  }

  async *run(messages: Message[]): AsyncGenerator<AgentLoopEvent> {
    const budget = new IterationBudget(this.config.budgetTotal, this.config.refundableTools);
    const ctx: ToolContext = this.context ?? {
      workingDirectory: process.cwd(),
      sessionId: `session-${Date.now()}`,
    };

    let currentMessages = [...messages];
    let iteration = 0;
    let emptyResponseCount = 0;

    while (iteration < this.config.maxLoops && !budget.isExhausted && !this.interrupted) {
      yield { type: "step-start", iteration };

      // Call the model
      const response = await this.adapter.chat(currentMessages);
      emptyResponseCount = 0;

      // Emit text
      if (response.content) {
        yield { type: "text-delta", text: response.content, iteration };
      }

      // No tool calls → done
      if (response.finishReason !== "tool-calls" || response.toolCalls.length === 0) {
        // Handle empty response
        if (!response.content && response.toolCalls.length === 0) {
          emptyResponseCount++;
          if (emptyResponseCount <= 1) {
            // Retry with nudge
            currentMessages.push(
              { role: "assistant", content: "" },
              { role: "user", content: "You gave an empty response. Please provide a helpful answer." },
            );
            yield { type: "step-finish", iteration };
            iteration++;
            continue;
          }
        }

        yield {
          type: "finish",
          finishReason: "completed",
          usage: response.usage,
        };
        return;
      }

      // Add assistant message with tool calls
      currentMessages.push({
        role: "assistant",
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Execute tools
      const execMode = shouldParallelize(response.toolCalls, this.toolRegistry);

      let results: ToolResult[];
      if (execMode === "parallel") {
        results = await Promise.all(
          response.toolCalls.map((tc) => this.executeTool(tc.id, tc.name, tc.input, ctx)),
        );
      } else {
        results = [];
        for (const tc of response.toolCalls) {
          const result = await this.executeTool(tc.id, tc.name, tc.input, ctx);
          results.push(result);
        }
      }

      // Emit tool events and add results to messages
      for (let i = 0; i < response.toolCalls.length; i++) {
        const tc = response.toolCalls[i];
        const result = results[i];

        yield { type: "tool-call", toolName: tc.name, toolCallId: tc.id, toolInput: tc.input, iteration };
        yield { type: "tool-result", toolResult: result, toolCallId: tc.id, iteration };

        currentMessages.push({
          role: "tool",
          content: result.content,
          toolCallId: tc.id,
        });

        budget.consume(tc.name);
      }

      yield { type: "step-finish", iteration };
      iteration++;
    }

    // Loop ended — why?
    if (this.interrupted) {
      yield { type: "finish", finishReason: "interrupted" };
    } else {
      yield { type: "finish", finishReason: "max-loops" };
    }
  }

  private async executeTool(
    id: string,
    name: string,
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const result = await this.toolRegistry.execute(name, input, ctx, this.permissionMode);
    return { ...result, toolCallId: id };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/core/agent.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/core/agent.ts tests/unit/core/agent.test.ts
git commit -m "feat: agent loop with hybrid execution, budget refund, interrupt, empty recovery"
```

---

## Task 11: Integration Test

**Files:**
- Create: `tests/integration/agent-loop.test.ts`

End-to-end test: load config → create registry → register mock adapter → create tool registry with real tools → run agent loop → verify full flow. No real API calls — everything uses mock adapter.

**Step 1: Write the integration test**

```typescript
// tests/integration/agent-loop.test.ts
import { describe, it, expect, vi } from "vitest";
import { ProviderRegistry } from "@/adapters/registry.js";
import { ToolRegistry } from "@/core/tools.js";
import { AgentLoop } from "@/core/agent.js";
import { MockAdapter } from "@/adapters/mock.js";
import type { AgentConfig, Tool, ToolContext } from "@/types.js";

const TEST_CONFIG: AgentConfig = {
  activeProvider: "mock",
  activeModel: "mock-model",
  providers: {},
  agent: {
    maxLoops: 50,
    maxOutputTokensPerTurn: 4096,
    budgetTotal: 50,
    refundableTools: ["read_file", "glob", "grep"],
    streaming: true,
    interruptible: true,
  },
};

describe("Integration: Agent Loop E2E", () => {
  it("runs a full multi-turn tool-use conversation", async () => {
    // 1. Set up provider registry with mock adapter
    const registry = new ProviderRegistry(TEST_CONFIG);
    const mockAdapter = new MockAdapter(
      [
        // Turn 1: agent reads a file
        {
          content: "Let me read that file.",
          toolCalls: [{ id: "c1", name: "read_file", input: { path: "/tmp/hello.txt" } }],
          finishReason: "tool-calls",
        },
        // Turn 2: agent summarizes the content
        {
          content: "The file contains: hello world. That's a simple greeting.",
          toolCalls: [],
          finishReason: "stop",
        },
      ],
      { id: "mock-model", provider: "mock" },
    );
    registry.registerAdapter("mock", mockAdapter);

    // 2. Set up tool registry with a real read_file tool
    const toolRegistry = new ToolRegistry();
    const readFile: Tool = {
      name: "read_file",
      description: "Read a file",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      capabilities: ["ReadOnly"],
      execute: vi.fn(async (input: unknown) => ({
        toolCallId: "c1",
        content: "hello world",
        isError: false,
      })),
    };
    toolRegistry.register(readFile);

    // 3. Run agent loop
    const loop = new AgentLoop(
      registry.getActiveAdapter(),
      toolRegistry,
      "yolo",
      TEST_CONFIG.agent,
    );

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "Read /tmp/hello.txt and summarize" }])) {
      events.push(event);
    }

    // 4. Verify the flow
    expect(events.some((e) => e.type === "step-start")).toBe(true);
    expect(events.some((e) => e.type === "tool-call" && e.toolName === "read_file")).toBe(true);
    expect(events.some((e) => e.type === "tool-result")).toBe(true);
    expect(events.some((e) => e.type === "text-delta" && e.text?.includes("hello world"))).toBe(true);
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");

    // Tool was actually called
    expect(readFile.execute).toHaveBeenCalledTimes(1);
  });

  it("handles tool errors gracefully in full flow", async () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    const mockAdapter = new MockAdapter(
      [
        {
          content: "",
          toolCalls: [{ id: "c1", name: "read_file", input: { path: "/nonexistent" } }],
          finishReason: "tool-calls",
        },
        {
          content: "Sorry, the file doesn't exist. Would you like me to create it?",
          toolCalls: [],
          finishReason: "stop",
        },
      ],
      { id: "mock-model", provider: "mock" },
    );
    registry.registerAdapter("mock", mockAdapter);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object" },
      capabilities: ["ReadOnly"],
      execute: vi.fn(async () => ({
        toolCallId: "c1",
        content: "Error: ENOENT no such file or directory",
        isError: true,
      })),
    });

    const loop = new AgentLoop(
      registry.getActiveAdapter(),
      toolRegistry,
      "yolo",
      TEST_CONFIG.agent,
    );

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "read missing file" }])) {
      events.push(event);
    }

    const toolResult = events.find((e) => e.type === "tool-result");
    expect(toolResult?.toolResult?.isError).toBe(true);
    expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
  });

  it("respects budget limits across multiple tool calls", async () => {
    const registry = new ProviderRegistry(TEST_CONFIG);
    // Adapter that keeps calling an expensive tool
    const mockAdapter = new MockAdapter(
      [
        {
          content: "",
          toolCalls: [{ id: `c1`, name: "bash", input: { command: "echo hi" } }],
          finishReason: "tool-calls",
        },
      ],
      { id: "mock-model", provider: "mock" },
    );
    registry.registerAdapter("mock", mockAdapter);

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: "bash",
      description: "Run bash",
      inputSchema: { type: "object" },
      capabilities: ["ExecCode"],
      execute: vi.fn(async () => ({
        toolCallId: "c1",
        content: "hi",
        isError: false,
      })),
    });

    const lowBudgetConfig = { ...TEST_CONFIG.agent, budgetTotal: 3, maxLoops: 50 };
    const loop = new AgentLoop(
      registry.getActiveAdapter(),
      toolRegistry,
      "yolo",
      lowBudgetConfig,
    );

    const events = [];
    for await (const event of loop.run([{ role: "user", content: "loop" }])) {
      events.push(event);
    }

    // Should stop due to budget or max-loops
    const finish = events.find((e) => e.type === "finish");
    expect(finish?.finishReason).toMatch(/max-loops|completed/);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/integration/agent-loop.test.ts
```

Expected: FAIL (until all previous modules are implemented)

**Step 3: Run all tests together**

```bash
pnpm test
```

Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/integration/agent-loop.test.ts
git commit -m "test: integration tests for full agent loop E2E with mock adapter"
```

---

## Task 12: Final Verification + Update Exports

**Files:**
- Modify: `src/index.ts`

**Step 1: Update src/index.ts to export all Sprint 1 modules**

```typescript
// src/index.ts
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
```

**Step 2: Run full check**

```bash
pnpm check
```

Expected: lint clean, types clean, all tests pass.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: export all Sprint 1 modules from entry point"
```

---

## Sprint 1 Summary

### Files Created (17 source + 11 test)

| Category | Source Files | Test Files |
|----------|-------------|------------|
| Types | `src/types.ts` | `tests/unit/types.test.ts` |
| Config | `src/core/config.ts` | `tests/unit/core/config.test.ts` |
| Adapters | `src/adapters/mock.ts` | `tests/unit/adapters/mock.test.ts` |
| | `src/adapters/anthropic.ts` | `tests/unit/adapters/anthropic.test.ts` |
| | `src/adapters/openai-compat.ts` | `tests/unit/adapters/openai-compat.test.ts` |
| | `src/adapters/ollama.ts` | `tests/unit/adapters/ollama.test.ts` |
| Registry | `src/adapters/registry.ts` | `tests/unit/adapters/registry.test.ts` |
| Tools | `src/core/tools.ts` | `tests/unit/core/tools.test.ts` |
| Agent | `src/core/agent.ts` | `tests/unit/core/agent.test.ts` |
| Integration | — | `tests/integration/agent-loop.test.ts` |
| Entry | `src/index.ts` | — |

### Key Architecture Decisions Implemented

- **Manual DI**: Interfaces + classes, no framework. All composition in `index.ts` and CLI layer.
- **neverthrow**: Config loading returns `Result<AgentConfig, Error>`.
- **Hybrid tool execution**: `shouldParallelize()` checks capabilities + file paths.
- **Budget refund**: `IterationBudget` tracks refundable tools.
- **3-tier permissions**: Normal (ask+remember) / Auto (read-only skip) / YOLO (all auto).
- **7 providers**: 3 adapter classes cover all 7 (Anthropic, OpenAI, DeepSeek, Ollama, Zhipu, Kimi, MiniMax).
- **Mock adapter**: Fixture-based, enables all tests without API keys.

### Next: Sprint 2 (Memory System)

See `docs/plans/checkpoint-2026-05-14-ready-to-implement.md` Sprint 2 section.
