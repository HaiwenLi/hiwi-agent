import { promises as fs } from "node:fs";
import path from "node:path";
import { type Result, err, ok } from "neverthrow";
import { z } from "zod";
import type { AgentConfig, AgentLoopConfig, ProviderConfig, SystemPromptConfig } from "../types.js";

const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z.array(z.string()).optional(),
  oss: z.record(z.string(), z.unknown()).optional(),
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

const AgentConfigPartialSchema = z.object({
  activeProvider: z.string().optional(),
  activeModel: z.string().optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  agent: z
    .object({
      maxLoops: z.number().optional(),
      maxOutputTokensPerTurn: z.number().optional(),
      budgetTotal: z.number().optional(),
      refundableTools: z.array(z.string()).optional(),
      streaming: z.boolean().optional(),
      interruptible: z.boolean().optional(),
    })
    .optional(),
  systemPrompt: z
    .object({
      providerVariant: z.enum(["auto", "anthropic", "gpt", "default"]).optional(),
    })
    .optional(),
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

function deepMerge(base: AgentConfig, override: Record<string, unknown>): AgentConfig {
  const result = { ...base };
  if (override.activeProvider !== undefined)
    result.activeProvider = override.activeProvider as string;
  if (override.activeModel !== undefined) result.activeModel = override.activeModel as string;
  if (override.providers !== undefined)
    result.providers = {
      ...base.providers,
      ...(override.providers as Record<string, ProviderConfig>),
    };
  if (override.agent !== undefined)
    result.agent = { ...base.agent, ...(override.agent as Partial<AgentLoopConfig>) };
  if (override.systemPrompt !== undefined)
    result.systemPrompt = {
      ...base.systemPrompt,
      ...(override.systemPrompt as Partial<SystemPromptConfig>),
    };
  return result;
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
  let config: AgentConfig = { ...DEFAULT_CONFIG };

  const globalData = await readJsonFile(path.join(globalDir, "config.json"));
  if (globalData) {
    const parsed = AgentConfigPartialSchema.safeParse(globalData);
    if (!parsed.success) {
      return err(new Error(`Invalid global config: ${parsed.error.message}`));
    }
    config = deepMerge(config, parsed.data);
  }

  if (projectDir) {
    const projectData = await readJsonFile(path.join(projectDir, ".agent", "config.json"));
    if (projectData) {
      const parsed = AgentConfigPartialSchema.safeParse(projectData);
      if (!parsed.success) {
        return err(new Error(`Invalid project config: ${parsed.error.message}`));
      }
      config = deepMerge(config, parsed.data);
    }
  }

  return ok(resolveConfig(config));
}

export async function saveModelSelection(
  projectDir: string,
  provider: string,
  model: string,
): Promise<void> {
  const agentDir = path.join(projectDir, ".agent");
  await fs.mkdir(agentDir, { recursive: true });

  const configPath = path.join(agentDir, "config.json");
  let existing: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(configPath, "utf-8");
    existing = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // file doesn't exist yet
  }

  const updated = { ...existing, activeProvider: provider, activeModel: model };
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + "\n");
}
