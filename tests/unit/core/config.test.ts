import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, resolveApiKey, resolveConfig, saveModelSelection } from "@/core/config.js";
import type { AgentConfig, SystemPromptConfig } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Config Module", () => {
  describe("resolveApiKey", () => {
    it("resolves env: prefix to environment variable", () => {
      process.env.TEST_API_KEY = "sk-test-123";
      expect(resolveApiKey("env:TEST_API_KEY")).toBe("sk-test-123");
      Reflect.deleteProperty(process.env, "TEST_API_KEY");
    });

    it("returns raw value if no env: prefix", () => {
      expect(resolveApiKey("sk-direct-key")).toBe("sk-direct-key");
    });

    it("returns undefined for missing env var", () => {
      Reflect.deleteProperty(process.env, "NONEXISTENT_KEY");
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
      Reflect.deleteProperty(process.env, "MY_TEST_KEY");
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
      await fs.writeFile(path.join(tmpDir, "config.json"), JSON.stringify(globalConfig));
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

      const result = await loadConfig(path.join(tmpDir, "global"), path.join(tmpDir, "project"));
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

describe("systemPrompt config", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-config-sysprompt-test");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("accepts systemPrompt.providerVariant", async () => {
    await fs.writeFile(
      path.join(tmpDir, "config.json"),
      JSON.stringify({
        systemPrompt: { providerVariant: "anthropic" },
      }),
    );

    const result = await loadConfig(tmpDir);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect((result.value as any).systemPrompt?.providerVariant).toBe("anthropic");
    }
  });

  it("defaults to undefined when not specified", async () => {
    const result = await loadConfig(tmpDir);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect((result.value as any).systemPrompt).toBeUndefined();
    }
  });
});

describe("saveModelSelection", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("writes activeProvider and activeModel to project config", async () => {
    await saveModelSelection(tmpDir, "anthropic", "claude-opus-4-7");

    const filePath = path.join(tmpDir, ".agent", "config.json");
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);

    expect(data.activeProvider).toBe("anthropic");
    expect(data.activeModel).toBe("claude-opus-4-7");
  });

  it("merges with existing config file", async () => {
    const agentDir = path.join(tmpDir, ".agent");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, "config.json"),
      JSON.stringify({ activeProvider: "ollama", agent: { maxLoops: 20 } }),
    );

    await saveModelSelection(tmpDir, "anthropic", "claude-opus-4-7");

    const content = await fs.readFile(path.join(agentDir, "config.json"), "utf-8");
    const data = JSON.parse(content);

    expect(data.activeProvider).toBe("anthropic");
    expect(data.activeModel).toBe("claude-opus-4-7");
    expect(data.agent.maxLoops).toBe(20);
  });

  it("creates .agent directory if it does not exist", async () => {
    await saveModelSelection(tmpDir, "openai", "gpt-4o");

    const stat = await fs.stat(path.join(tmpDir, ".agent"));
    expect(stat.isDirectory()).toBe(true);
  });
});
