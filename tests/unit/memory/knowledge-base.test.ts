import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryFileStore } from "@/memory/file-store.js";
import { KnowledgeBase, type KnowledgeEntry } from "@/memory/knowledge-base.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("KnowledgeBase", () => {
  let store: MemoryFileStore;
  let kb: KnowledgeBase;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hiwi-kb-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
    await store.init();
    kb = new KnowledgeBase(store);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("add", () => {
    it("adds a knowledge entry and retrieves it", async () => {
      const result = await kb.add({
        name: "ts-strict-mode",
        domain: "typescript",
        pattern: "Always enable strict mode in tsconfig.json",
        examples: ['"strict": true'],
      });
      expect(result.isOk()).toBe(true);

      const search = await kb.search("strict mode");
      expect(search.isOk()).toBe(true);
      if (search.isOk()) {
        expect(search.value.length).toBeGreaterThanOrEqual(1);
        expect(search.value[0].pattern).toContain("strict mode");
      }
    });
  });

  describe("search", () => {
    it("searches knowledge by query with keyword matching", async () => {
      await kb.add({
        name: "react-hooks-rules",
        domain: "react",
        pattern: "Hooks must be called at the top level of a component",
      });
      await kb.add({
        name: "ts-strict",
        domain: "typescript",
        pattern: "Enable strict mode for better type safety",
      });

      const result = await kb.search("hooks rules");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        expect(result.value[0].domain).toBe("react");
      }
    });

    it("returns empty for no matches", async () => {
      const result = await kb.search("nonexistent topic xyz");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("getByDomain", () => {
    it("filters knowledge by domain", async () => {
      await kb.add({
        name: "ts-1",
        domain: "typescript",
        pattern: "Use interfaces for object shapes",
      });
      await kb.add({
        name: "react-1",
        domain: "react",
        pattern: "Use function components",
      });

      const result = await kb.getByDomain("typescript");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].domain).toBe("typescript");
      }
    });

    it("returns empty for domain with no entries", async () => {
      const result = await kb.getByDomain("nonexistent");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("injectContext", () => {
    it("injects relevant knowledge into prompt context", async () => {
      await kb.add({
        name: "ts-pattern",
        domain: "typescript",
        pattern: "Prefer type inference over explicit types",
      });

      const result = await kb.injectContext("How should I type this TypeScript function?");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("typescript");
        expect(result.value).toContain("type inference");
      }
    });

    it("limits injection to top-K entries", async () => {
      for (let i = 0; i < 10; i++) {
        await kb.add({
          name: `ts-tip-${i}`,
          domain: "typescript",
          pattern: `TypeScript tip ${i}: some advice about types`,
        });
      }

      const result = await kb.injectContext("TypeScript types", 3);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const lines = result.value.split("\n").filter((l) => l.startsWith("-"));
        expect(lines.length).toBeLessThanOrEqual(3);
      }
    });

    it("returns empty string when no relevant knowledge", async () => {
      const result = await kb.injectContext("nonexistent topic xyz");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("");
      }
    });
  });

  describe("deduplication", () => {
    it("handles duplicate entries by merging with higher confidence", async () => {
      await kb.add({
        name: "ts-strict",
        domain: "typescript",
        pattern: "Enable strict mode",
      });
      await kb.add({
        name: "ts-strict",
        domain: "typescript",
        pattern: "Enable strict mode for safety",
      });

      const result = await kb.getByDomain("typescript");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
      }
    });
  });
});
