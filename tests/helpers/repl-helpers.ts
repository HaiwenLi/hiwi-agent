import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { MockAdapter, type MockResponse } from "@/adapters/mock.js";
import { ProviderRegistry } from "@/adapters/registry.js";
import type { AgentConfig, PermissionMode, Tool, ToolCapability, ToolContext, ToolResult } from "@/types.js";
import { CommandRegistry } from "@/cli/commands.js";
import { REPL, type REPLDependencies } from "@/cli/repl.js";
import { ToolRegistry } from "@/core/tools.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { SessionStore } from "@/memory/session.js";
import { SkillRegistry } from "@/skills/registry.js";

export function makeTool(name: string, caps: ToolCapability[] = ["ReadOnly"]): Tool {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: "object" },
    capabilities: caps,
    execute: async (_input: unknown, _ctx: ToolContext): Promise<ToolResult> => ({
      content: `${name} result`,
      isError: false,
    }),
  };
}

export function makeDenyingTool(name: string, caps: ToolCapability[] = ["WriteFiles"]): Tool {
  return {
    name,
    description: `${name} tool (always denied)`,
    inputSchema: { type: "object" },
    capabilities: caps,
    execute: async (_input: unknown, _ctx: ToolContext): Promise<ToolResult> => ({
      content: `${name} denied`,
      isError: false,
    }),
  };
}

export interface CreateTestREPLOptions {
  adapterResponses?: MockResponse[];
  permissionMode?: PermissionMode;
  adapter?: MockAdapter;
}

export async function createTestREPL(options: CreateTestREPLOptions = {}) {
  const { permissionMode = "normal" } = options;

  const adapter =
    options.adapter ??
    new MockAdapter(options.adapterResponses ?? [{ content: "Done", toolCalls: [], finishReason: "stop" }]);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-repl-"));

  // Real memory system
  const fileStore = new MemoryFileStore(path.join(tempDir, "memory"));
  await fileStore.init();
  const mem0 = new Mem0Client({ apiKey: undefined });
  const memoryManager = new MemoryManager(fileStore, mem0);

  // Real session store
  const sessionDbPath = path.join(tempDir, "sessions.db");
  const sessionStore = new SessionStore(sessionDbPath);
  await sessionStore.init();

  // Real provider registry
  const config: AgentConfig = {
    activeProvider: "mock",
    activeModel: "mock-model",
    providers: {},
    agent: {
      maxLoops: 50,
      maxOutputTokensPerTurn: 4096,
      budgetTotal: 50,
      refundableTools: [],
      streaming: false,
      interruptible: true,
    },
  };
  const providerRegistry = new ProviderRegistry(config);
  providerRegistry.registerAdapter("mock", adapter);

  const toolRegistry = new ToolRegistry();
  const commandRegistry = new CommandRegistry();
  commandRegistry.registerBuiltinCommands();
  const skillRegistry = new SkillRegistry();

  const outputs: string[] = [];
  const streamOutputs: string[] = [];

  const permissionModeRef = { value: permissionMode };

  const deps: REPLDependencies = {
    commandRegistry,
    skillRegistry,
    toolRegistry,
    adapter,
    loopConfig: config.agent,
    permissionMode: permissionModeRef,
    setPermissionMode: (mode: PermissionMode) => {
      permissionModeRef.value = mode;
    },
    providerRegistry,
    memoryManager,
    sessionStore,
    onOutput: (text: string) => outputs.push(text),
    onStreamChunk: (chunk: string) => streamOutputs.push(chunk),
    onStreamEnd: () => {},
    confirm: async () => true,
    onStatusBarUpdate: () => {},
  };

  const repl = new REPL(deps);

  return {
    repl,
    outputs,
    streamOutputs,
    deps,
    permissionModeRef,
    toolRegistry,
    commandRegistry,
    memoryManager,
    fileStore,
    sessionStore,
    adapter,
    tempDir,
    cleanup: () => {
      sessionStore.close();
      return fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
