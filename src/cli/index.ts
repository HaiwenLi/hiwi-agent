#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { ProviderRegistry } from "../adapters/registry.js";
import { loadConfig, saveModelSelection, saveProviderConfig } from "../core/config.js";
import { ToolRegistry } from "../core/tools.js";
import { MCPServer } from "../mcp/server.js";
import { MemoryFileStore } from "../memory/file-store.js";
import { MemoryManager } from "../memory/manager.js";
import { Mem0Client, type Mem0OSSConfig } from "../memory/mem0-client.js";
import { SessionStore } from "../memory/session.js";
import { SkillExecutor } from "../skills/executor.js";
import { SkillLoader } from "../skills/loader.js";
import { SkillRegistry } from "../skills/registry.js";
import type { PermissionMode } from "../types.js";
import { runPipeMode } from "./pipe.js";
import { renderApp } from "./app.js";
import { CommandRegistry } from "./commands.js";
import { REPL } from "./repl.js";

export interface CLIOptions {
  mcp?: boolean;
  pipe?: boolean;
  port?: number;
  debug?: boolean;
  yolo?: boolean;
}

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mcp") options.mcp = true;
    else if (arg === "--port" && argv[i + 1]) options.port = Number.parseInt(argv[++i]);
    else if (arg === "--pipe") options.pipe = true;
    else if (arg === "--debug") options.debug = true;
    else if (arg === "--yolo") options.yolo = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`hiwi-agent — Personal AI agent

Usage:
  hiwi-agent              Start interactive REPL
  hiwi-agent --mcp        Start MCP server (stdio)
  hiwi-agent --mcp --port <port>  Start MCP server (SSE)
  hiwi-agent --pipe       Run with pipe input (no TUI, console I/O)
  hiwi-agent --yolo       Enable YOLO mode (no tool restrictions)
  hiwi-agent --debug      Enable debug logging
  hiwi-agent --help       Show this help

REPL commands:
  /model <id>             Set active model
  /provider <name>        Set active provider
  /models                 List available models
  /remember <name>: <content>  Save a memory
  /recall <query>         Search memories
  /forget <name>          Delete a memory
  /skills                 List loaded skills
  /sessions               List sessions
  /yolo                   Toggle YOLO mode
  /help                   Show commands
  /exit                   Exit REPL`);
      process.exit(0);
    }
  }
  return options;
}

export async function main(options: CLIOptions = {}): Promise<void> {
  const globalDir = path.join(os.homedir(), ".hiwi-agent");
  const projectDir = process.cwd();
  const configResult = await loadConfig(globalDir, projectDir);

  if (configResult.isErr()) {
    console.error(`Config error: ${configResult.error.message}`);
    process.exit(1);
  }

  const config = configResult.value;

  const providerRegistry = new ProviderRegistry(config);
  const providerNames = Object.keys(config.providers);
  for (const name of providerNames) {
    try {
      const adapter = providerRegistry.createAdapter(name);
      providerRegistry.registerAdapter(name, adapter);
    } catch {
      // skip providers that fail (e.g. no API key)
    }
  }

  const toolRegistry = new ToolRegistry();

  const memoryDir = path.join(globalDir, "memory");
  const fileStore = new MemoryFileStore(memoryDir);
  await fileStore.init();
  const mem0Provider = config.providers.mem0;
  const mem0 = new Mem0Client();
  await mem0.init({
    apiKey: mem0Provider?.apiKey,
    host: mem0Provider?.baseUrl,
    oss: mem0Provider?.oss as unknown as Mem0OSSConfig | undefined,
  });
  const memoryManager = new MemoryManager(fileStore, mem0);

  const sessionDir = path.join(projectDir, ".agent");
  const sessionStore = new SessionStore(path.join(sessionDir, "session.db"));
  sessionStore.init();

  const skillSearchPaths = [
    path.join(globalDir, "skills"),
    path.join(projectDir, "skills"),
    path.join(projectDir, ".agent", "skills"),
    path.join(projectDir, ".opencode", "skills"),
    path.join(projectDir, ".claude", "skills"),
  ];
  const skillLoader = new SkillLoader(skillSearchPaths);
  const skills = await skillLoader.discover();
  const skillRegistry = new SkillRegistry();
  for (const skill of skills) {
    skillRegistry.register(skill);
  }

  if (options.mcp) {
    const skillExecutor = new SkillExecutor(toolRegistry);
    const mcpServer = new MCPServer(
      { memoryManager, skillRegistry, providerRegistry, skillExecutor },
      { transport: "stdio", port: options.port },
    );
    await mcpServer.start();
    return;
  }

  if (options.pipe) {
    await runPipeMode({
      toolRegistry,
      providerRegistry,
      memoryManager,
      sessionStore,
      loopConfig: config.agent,
      permissionMode: options.yolo ? "yolo" : "normal",
    });
    return;
  }

  const commandRegistry = new CommandRegistry();
  commandRegistry.registerBuiltinCommands();

  const permissionMode: { value: PermissionMode } = { value: "normal" };

  // Create REPL first so we can pass its methods to app props
  const repl = new REPL({
    commandRegistry,
    skillRegistry,
    toolRegistry,
    adapter: null as any,
    loopConfig: config.agent,
    permissionMode,
    setPermissionMode: (mode) => {
      permissionMode.value = mode;
    },
    providerRegistry,
    memoryManager,
    sessionStore,
    onOutput: (text) => app.addOutput(text),
    onStreamChunk: (chunk) => app.addStreamChunk(chunk),
    onStreamEnd: () => app.endStream(),
    onThinkingChunk: (chunk) => app.addThinkingChunk(chunk),
    onEndThinking: () => app.endThinking(),
    onRequestModeSwitch: (mode) => {
      if (mode === "model-picker") {
        const catalog = providerRegistry.getModelCatalog();
        app.openModelPicker(
          catalog,
          providerRegistry.getActiveModel(),
          providerRegistry.getActiveProvider(),
        );
      } else if (mode === "provider-picker") {
        const providers = Object.keys(providerRegistry.getModelCatalog());
        app.openProviderPicker(providers, providerRegistry.getActiveProvider());
      }
    },
    onStatusBarUpdate: () => {}, // placeholder until app is created
  });

  const app = renderApp({
    onInput: async (text) => {
      const result = await repl.processInput(text);
      if (result === "exit") app.unmount();
    },
    onModelSelect: async (modelId) => {
      try {
        providerRegistry.setModelWithProvider(modelId);
        const provider = providerRegistry.getActiveProvider();
        const adapter = providerRegistry.createAdapter(provider);
        providerRegistry.registerAdapter(provider, adapter);
        await saveModelSelection(projectDir, provider, modelId);
        app.addOutput(`Model: ${modelId} (${provider})`);
      } catch (e: unknown) {
        app.addOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    onProviderSelect: async (provider) => {
      try {
        providerRegistry.setProvider(provider);
        const adapter = providerRegistry.createAdapter(provider);
        providerRegistry.registerAdapter(provider, adapter);
        await saveModelSelection(projectDir, provider, providerRegistry.getActiveModel());
        app.addOutput(`Provider: ${provider}`);
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        if (errorMsg.includes("API key") || errorMsg.includes("No API key")) {
          app.addOutput(`Provider ${provider} requires API key`);
          app.openApiKeyInput(provider);
        } else {
          app.addOutput(`Error: ${errorMsg}`);
        }
      }
    },
    onApiKeySubmit: async (provider, apiKey) => {
      try {
        await saveProviderConfig(projectDir, provider, { apiKey });
        // Update the in-memory config so createAdapter can use it
        providerRegistry.updateProviderConfig(provider, { apiKey });
        providerRegistry.setProvider(provider);
        const adapter = providerRegistry.createAdapter(provider);
        providerRegistry.registerAdapter(provider, adapter);
        await saveModelSelection(projectDir, provider, providerRegistry.getActiveModel());
        app.addOutput(`API key saved for ${provider}`);
        app.addOutput(`Provider: ${provider}`);
      } catch (e: unknown) {
        app.addOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    onPickerCancel: () => {
      app.addOutput("Cancelled.");
    },
    fetchCommands: () => repl.fetchCommands(),
  });

  // Wire status bar updates from REPL to app
  (repl as any).deps.onStatusBarUpdate = (data: import("../types.js").TokenUsage) => {
    app.setStatusBarData(data);
  };

  await app.waitUntilExit();
  sessionStore.close();
}

// Auto-run when executed directly (not imported)
const options = parseArgs(process.argv);
main(options).catch((error) => {
  console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
