import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Entity, EntityLinker } from "@/memory/entity-link.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("EntityLinker", () => {
  let store: MemoryFileStore;
  let linker: EntityLinker;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hiwi-entity-link-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
    await store.init();
    linker = new EntityLinker(store);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("extractEntities", () => {
    it("extracts entities from a technical memory entry", async () => {
      const entities = await linker.extractEntities(
        "We built the agent using TypeScript and React. The project uses vitest for testing.",
      );
      const names = entities.map((e) => e.name);
      expect(names).toContain("TypeScript");
      expect(names).toContain("React");
      expect(names).toContain("vitest");
    });

    it("classifies entity types correctly", async () => {
      const entities = await linker.extractEntities(
        "Modified src/core/agent.ts to use the new ModelAdapter pattern.",
      );
      const files = entities.filter((e) => e.type === "file");
      const techs = entities.filter((e) => e.type === "technology");
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files[0].name).toContain("agent.ts");
      expect(techs.map((t) => t.name)).toContain("ModelAdapter");
    });

    it("returns empty array for plain text with no entities", async () => {
      const entities = await linker.extractEntities("hello world this is a test");
      expect(entities).toEqual([]);
    });
  });

  describe("alias resolution", () => {
    it("resolves TS alias to TypeScript", async () => {
      const entities = await linker.extractEntities("I prefer TS over JS for backend");
      const names = entities.map((e) => e.name);
      expect(names).toContain("TypeScript");
    });
  });

  describe("index operations", () => {
    it("updates entity index on remember", async () => {
      await store.write(
        "ts-decision",
        "auto",
        "TS decision",
        "We chose TypeScript for the agent project",
      );

      await linker.updateIndex("ts-decision", "We chose TypeScript for the agent project");
      const found = await linker.findByEntity("TypeScript");
      expect(found.length).toBeGreaterThanOrEqual(1);
      expect(found[0].name).toBe("ts-decision");
    });

    it("removes memory from entity index on forget", async () => {
      await store.write(
        "ts-decision",
        "auto",
        "TS decision",
        "We chose TypeScript for the agent project",
      );
      await linker.updateIndex("ts-decision", "We chose TypeScript for the agent project");

      await linker.removeFromIndex("ts-decision");
      const found = await linker.findByEntity("TypeScript");
      expect(found).toHaveLength(0);
    });
  });

  describe("link", () => {
    it("finds related memories via shared entities", async () => {
      await store.write("mem-a", "knowledge", "A", "We use TypeScript with React for the frontend");
      await store.write("mem-b", "knowledge", "B", "TypeScript strict mode is enabled");
      await store.write("mem-c", "knowledge", "C", "Python is great for ML");

      await linker.updateIndex("mem-a", "We use TypeScript with React for the frontend");
      await linker.updateIndex("mem-b", "TypeScript strict mode is enabled");
      await linker.updateIndex("mem-c", "Python is great for ML");

      const linked = await linker.link("mem-b");
      expect(linked.primary.name).toBe("mem-b");
      expect(linked.related.length).toBeGreaterThanOrEqual(1);
      const relatedNames = linked.related.map((r) => r.memory.name);
      expect(relatedNames).toContain("mem-a");
      expect(relatedNames).not.toContain("mem-c");
    });

    it("returns empty related for memory with no shared entities", async () => {
      await store.write("solo", "knowledge", "Solo", "A unique thought about nothing specific");
      await linker.updateIndex("solo", "A unique thought about nothing specific");

      const linked = await linker.link("solo");
      expect(linked.related).toEqual([]);
    });
  });

  describe("findByEntity", () => {
    it("returns empty results for unknown entities", async () => {
      const found = await linker.findByEntity("NonExistentTechnology123");
      expect(found).toEqual([]);
    });
  });

  describe("rebuild", () => {
    it("rebuilds entity index from memory files", async () => {
      await store.write("mem-1", "auto", "First", "TypeScript and React project setup");
      await store.write("mem-2", "auto", "Second", "Python data pipeline design");

      await linker.rebuildIndex();
      const tsMemories = await linker.findByEntity("TypeScript");
      expect(tsMemories.length).toBeGreaterThanOrEqual(1);
    });
  });
});
