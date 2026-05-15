#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { ProviderRegistry } from "../adapters/registry.js";
import { loadConfig } from "../core/config.js";
import { ToolRegistry } from "../core/tools.js";
import { MCPServer } from "../mcp/server.js";
import { MemoryFileStore } from "../memory/file-store.js";
import { MemoryManager } from "../memory/manager.js";
import { Mem0Client } from "../memory/mem0-client.js";
import { SessionStore } from "../memory/session.js";
import { SkillExecutor } from "../skills/executor.js";
import { SkillLoader } from "../skills/loader.js";
import { SkillRegistry } from "../skills/registry.js";
import { CommandRegistry } from "./commands.js";
import { REPL } from "./repl.js";
import type { PermissionMode } from "../types.js";

export interface CLIOptions {
  mcp?: boolean;
  port?: number;
  debug?: boolean;
}

function parseArgs(argv: string[]): CLIOptions {
  const options: CLIOptions = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mcp") options.mcp = true;
    else if (arg === "--port" && argv[i + 1]) options.port = Number.parseInt(argv[++i]);
    else if (arg === "--debug") options.debug = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`hiwi-agent — Personal AI agent

Usage:
  hiwi-agent              Start interactive REPL
  hiwi-agent --mcp        Start MCP server (stdio)
  hiwi-agent --mcp --port <port>  Start MCP server (SSE)
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
  const mem0 = new Mem0Client({
    apiKey: config.providers.mem0?.apiKey,
    host: config.providers.mem0?.baseUrl,
  });
  const memoryManager = new MemoryManager(fileStore, mem0);

  const sessionDir = path.join(projectDir, ".agent");
  const sessionStore = new SessionStore(path.join(sessionDir, "session.db"));
  sessionStore.init();

  const skillSearchPaths = [
    path.join(globalDir, "skills"),
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

  const commandRegistry = new CommandRegistry();
  commandRegistry.registerBuiltinCommands();

  const permissionMode: { value: PermissionMode } = { value: "normal" };

  const repl = new REPL({
    commandRegistry,
    skillRegistry,
    toolRegistry,
    adapter: providerRegistry.getActiveAdapter(),
    loopConfig: config.agent,
    permissionMode,
    setPermissionMode: (mode) => {
      permissionMode.value = mode;
    },
    providerRegistry,
    memoryManager,
    sessionStore,
    onOutput: (text) => process.stdout.write(`${text}\n`),
  });

  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  process.stdout.write("hiwi-agent ready. Type /help for commands.\n");

  for await (const line of rl) {
    const result = await repl.processInput(line);
    if (result === "exit") break;
  }

  sessionStore.close();
}

// Auto-run when executed directly (not imported)
const options = parseArgs(process.argv);
main(options).catch((error) => {
  console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
