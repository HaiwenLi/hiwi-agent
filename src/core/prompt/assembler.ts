import { promises as fs } from "node:fs";
import path from "node:path";
import { selectBasePrompt } from "./prompts.js";
import { buildEnvironmentContext } from "./environment.js";

interface AssembleOptions {
  modelId: string;
  workingDirectory: string;
  providerVariant?: "auto" | "anthropic" | "gpt" | "default";
}

export async function assembleSystemPrompt(options: AssembleOptions): Promise<string> {
  const { modelId, workingDirectory, providerVariant } = options;

  const layers: string[] = [];

  const prompt = providerVariant && providerVariant !== "auto"
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

  return layers.join("\n\n");
}
