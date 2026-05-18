import * as readline from "node:readline";
import { AgentLoop } from "../core/agent.js";
import { registerAgentTools, registerCoreTools, registerExtraTools } from "../tools/index.js";
import type { ToolRegistry } from "../core/tools.js";
import type { MemoryManager } from "../memory/manager.js";
import type { ProviderRegistry } from "../adapters/registry.js";
import type { SessionStore } from "../memory/session.js";
import type { AgentLoopConfig, Message, PermissionMode } from "../types.js";

export interface PipeRunnerDeps {
  toolRegistry: ToolRegistry;
  providerRegistry: ProviderRegistry;
  memoryManager: MemoryManager;
  sessionStore: SessionStore;
  loopConfig: AgentLoopConfig;
  permissionMode?: PermissionMode;
}

export async function runPipeMode(deps: PipeRunnerDeps): Promise<void> {
  const { toolRegistry, providerRegistry, memoryManager, sessionStore, loopConfig, permissionMode = "normal" } = deps;

  registerCoreTools(toolRegistry);
  registerExtraTools(toolRegistry);
  registerAgentTools(toolRegistry, {
    adapter: () => providerRegistry.getActiveAdapter(),
    memoryManager,
    skillRegistry: null as never,
    providerRegistry,
    loopConfig,
    permissionMode: () => permissionMode,
  });

  const adapter = providerRegistry.getActiveAdapter();
  if (!adapter) {
    console.error("No active model adapter. Set up a provider first.");
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const messages: Message[] = [];
  let sessionId: string | null = null;

  const printOutput = (text: string) => {
    process.stdout.write(text + "\n");
  };

  for await (const line of rl) {
    const input = line.trim();
    if (!input) continue;

    if (input === "/exit" || input === "/quit") {
      break;
    }

    if (input === "/new") {
      messages.length = 0;
      sessionId = null;
      printOutput("[New Session] Context cleared.");
      continue;
    }

    messages.push({ role: "user", content: input });

    if (!sessionId) {
      const session = sessionStore.createSession(process.cwd());
      sessionId = session.id;
    }
    sessionStore.appendMessage(sessionId, "user", input, 0);

    const loop = new AgentLoop(adapter, toolRegistry, permissionMode, loopConfig);

    let output = "";
    try {
      for await (const event of loop.run(messages)) {
        if (event.type === "text-delta" && event.text) {
          output += event.text;
          process.stdout.write(event.text);
        } else if (event.type === "tool-call") {
          process.stdout.write(`\n[Calling: ${event.toolName}]\n`);
        } else if (event.type === "tool-result" && event.toolResult) {
          process.stdout.write(`[Result]\n${event.toolResult.content}\n`);
        } else if (event.type === "messages" && event.messages) {
          messages.length = 0;
          messages.push(...event.messages);
        } else if (event.type === "finish") {
          process.stdout.write(`\n[Finished: ${event.finishReason}]\n`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      printOutput(`\n[Error: ${msg}]`);
      printOutput("\n[Stack]: " + (err instanceof Error ? err.stack : "").split("\n").slice(0, 5).join("\n"));
    }

    if (output) {
      sessionStore.appendMessage(sessionId, "assistant", output, 0);
    }
  }

  sessionStore.close();
}