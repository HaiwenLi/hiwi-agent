import { promises as fs } from "node:fs";
import path from "node:path";
import { MemoryFileStore } from "../../memory/file-store.js";
import { KnowledgeBase } from "../../memory/knowledge-base.js";
import { UserProfileManager } from "../../memory/user-profile.js";
import { buildEnvironmentContext } from "./environment.js";
import { selectBasePrompt } from "./prompts.js";

interface AssembleOptions {
  modelId: string;
  workingDirectory: string;
  providerVariant?: "auto" | "anthropic" | "gpt" | "default";
  userQuery?: string;
}

export async function assembleSystemPrompt(options: AssembleOptions): Promise<string> {
  const { modelId, workingDirectory, providerVariant, userQuery } = options;

  const layers: string[] = [];

  const prompt =
    providerVariant && providerVariant !== "auto"
      ? selectBasePrompt(providerVariant)
      : selectBasePrompt(modelId);
  layers.push(prompt);

  layers.push(buildEnvironmentContext({ workingDirectory }));

  const rulesPath = path.join(workingDirectory, ".hiwi-rules");
  try {
    const rules = await fs.readFile(rulesPath, "utf-8");
    if (rules.trim()) {
      layers.push(`Project instructions:\n${rules.trim()}`);
    }
  } catch {
    // No .hiwi-rules file — skip
  }

  const memoryPath = path.join(workingDirectory, "MEMORY.md");
  try {
    const memory = await fs.readFile(memoryPath, "utf-8");
    if (memory.trim()) {
      layers.push(`Project memory:\n${memory.trim()}`);
    }
  } catch {
    // No MEMORY.md — skip
  }

  const hiwiDir = path.join(workingDirectory, ".hiwi-agent", "memory");
  try {
    const store = new MemoryFileStore(hiwiDir);
    const profileMgr = new UserProfileManager(store);
    const profileResult = await profileMgr.toMarkdown();
    if (profileResult.isOk() && profileResult.value) {
      layers.push(`User profile:\n${profileResult.value}`);
    }

    if (userQuery) {
      const kb = new KnowledgeBase(store);
      const contextResult = await kb.injectContext(userQuery);
      if (contextResult.isOk() && contextResult.value) {
        layers.push(contextResult.value);
      }
    }
  } catch {
    // No memory store — skip
  }

  return layers.join("\n\n");
}
