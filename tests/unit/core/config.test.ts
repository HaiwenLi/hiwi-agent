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
