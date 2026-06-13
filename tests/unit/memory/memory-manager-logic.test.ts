import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestMemoryManager, createTempMemoryStore } from "../../helpers/memory-helpers.js";
import { MemoryManager } from "@/memory/manager.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { Mem0Client } from "@/memory/mem0-client.js";

describe("MemoryManager — logic tests with real file store", () => {
  let cleanup: () => Promise<void> = async () => {};

  afterEach(async () => {
    await cleanup();
  });

  // ─── remember ────────────────────────────────────────────────────

  describe("remember", () => {
    it("writes to store and returns ok", async () => {
      const { manager, store, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      const result = await manager.remember("ts-guide", "knowledge", "TypeScript guide", "TS is great");
      expect(result.isOk()).toBe(true);

      const entry = await store.read("ts-guide");
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe("TS is great");
      expect(entry!.type).toBe("knowledge");
      expect(entry!.description).toBe("TypeScript guide");
    });

    it("updates entity index", async () => {
      const { manager, store, dir, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember(
        "rust-notes",
        "knowledge",
        "Rust notes",
        "Rust uses ownership and borrowing for memory safety",
      );

      // Verify the memory was stored (entity linker runs fire-and-forget, give it a tick)
      const entry = await store.read("rust-notes");
      expect(entry).not.toBeNull();
      expect(entry!.content).toContain("Rust");

      // Entity index file should exist and reference Rust
      const entityPath = path.join(dir, "entities.json");
      const raw = await fs.readFile(entityPath, "utf-8");
      const index = JSON.parse(raw);
      expect(index["Rust"]).toBeDefined();
      expect(index["Rust"].memories).toContain("rust-notes");
    });

    it("does not call mem0 when not connected", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      // With apiKey undefined, mem0.isConnected() returns false.
      // remember should succeed without error — no mem0 calls made.
      const result = await manager.remember("solo", "knowledge", "Solo test", "No mem0 needed");
      expect(result.isOk()).toBe(true);
      expect(result.value).toBe(true);
    });

    it("returns error on write failure", async () => {
      const { manager, store, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      // Override write to simulate disk failure
      store.write = async () => {
        throw new Error("disk full");
      };

      const result = await manager.remember("fail", "knowledge", "Will fail", "Content");
      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain("Failed to save memory");
      expect(result.error.message).toContain("disk full");
    });

    it("remember same name overwrites", async () => {
      const { manager, store, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      const r1 = await manager.remember("name1", "knowledge", "First", "first content");
      expect(r1.isOk()).toBe(true);

      const r2 = await manager.remember("name1", "knowledge", "Second", "second content");
      expect(r2.isOk()).toBe(true);

      const entry = await store.read("name1");
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe("second content");
      expect(entry!.description).toBe("Second");
    });
  });

  // ─── recall ──────────────────────────────────────────────────────

  describe("recall", () => {
    it("keyword match returns results", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("ts-guide", "knowledge", "TypeScript guide", "TypeScript is great");

      const result = await manager.recall("typescript");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        const match = result.value.find((m) => m.name === "ts-guide");
        expect(match).toBeDefined();
        expect(match!.content).toContain("TypeScript is great");
      }
    });

    it("type filter works", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("pref1", "preference", "Editor pref", "I prefer vim");
      await manager.remember("know1", "knowledge", "Language facts", "Python is interpreted");

      const result = await manager.recall("prefer", { type: "preference" });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.length).toBeGreaterThanOrEqual(1);
        for (const r of result.value) {
          expect(r.type).toBe("preference");
        }
      }
    });

    it("file results come before mem0 results", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      // mem0 is disconnected, so all results are from file store
      await manager.remember("file-only", "knowledge", "File test", "Only in files");

      const result = await manager.recall("files");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        for (const r of result.value) {
          expect(r.source).toBe("file");
        }
      }
    });

    it("no matches returns empty array", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("something", "knowledge", "Something", "Content about cats");

      const result = await manager.recall("nonexistent_xyzzy_9999");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it("deduplicates by name", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("guide", "knowledge", "Guide", "TypeScript guide content");

      const result = await manager.recall("guide");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const names = result.value.map((m) => m.name);
        expect(new Set(names).size).toBe(names.length);
      }
    });
  });

  // ─── forget ──────────────────────────────────────────────────────

  describe("forget", () => {
    it("deletes from store", async () => {
      const { manager, store, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("gone", "knowledge", "Will be deleted", "Goodbye content");
      const before = await store.read("gone");
      expect(before).not.toBeNull();

      const result = await manager.forget("gone");
      expect(result.isOk()).toBe(true);

      const after = await store.read("gone");
      expect(after).toBeNull();
    });

    it("returns error for nonexistent", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      const result = await manager.forget("nonexistent");
      expect(result.isErr()).toBe(true);
      expect(result.error.message).toContain("not found");
      expect(result.error.message).toContain("nonexistent");
    });

    it("removed from entity index", async () => {
      const { manager, store, dir, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      // Write directly to the file store so entity linker is not fire-and-forget,
      // then manually trigger entity linker through recall (which reads the store).
      // Actually, use the store directly + wait for entity linker via a short delay.
      await manager.remember(
        "docker-guide",
        "knowledge",
        "Docker guide",
        "Docker containers are lightweight",
      );

      // EntityLinker.updateIndex runs fire-and-forget in remember().
      // Wait briefly for it to flush to disk.
      await new Promise((r) => setTimeout(r, 300));

      const entityPath = path.join(dir, "entities.json");
      const rawBefore = await fs.readFile(entityPath, "utf-8");
      const indexBefore = JSON.parse(rawBefore);
      expect(indexBefore["docker"] ?? indexBefore["Docker"]).toBeDefined();

      const result = await manager.forget("docker-guide");
      expect(result.isOk()).toBe(true);

      // forget's removeFromIndex is also fire-and-forget, wait briefly
      await new Promise((r) => setTimeout(r, 300));

      // After forget, entity should be removed or have empty memories
      const rawAfter = await fs.readFile(entityPath, "utf-8").catch(() => null);
      if (rawAfter) {
        const indexAfter = JSON.parse(rawAfter);
        const dockerEntry = indexAfter["docker"] ?? indexAfter["Docker"];
        if (dockerEntry) {
          expect(dockerEntry.memories).not.toContain("docker-guide");
        }
      }
    });

    it("forget then recall shows nothing", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("temp-mem", "knowledge", "Temporary", "Ephemeral data here");

      const before = await manager.recall("Ephemeral");
      expect(before.isOk()).toBe(true);
      if (before.isOk()) {
        expect(before.value.length).toBeGreaterThanOrEqual(1);
      }

      await manager.forget("temp-mem");

      const after = await manager.recall("Ephemeral");
      expect(after.isOk()).toBe(true);
      if (after.isOk()) {
        expect(after.value).toEqual([]);
      }
    });
  });

  // ─── getSystemContext ────────────────────────────────────────────

  describe("getSystemContext", () => {
    it("returns MEMORY.md content", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("ctx-entry", "knowledge", "Context entry", "Some context data");

      const context = await manager.getSystemContext();
      expect(context).toContain("# Memory Index");
      expect(context).toContain("ctx-entry");
    });

    it("empty store returns header", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      const context = await manager.getSystemContext();
      expect(context).toContain("# Memory Index");
    });
  });

  // ─── list ────────────────────────────────────────────────────────

  describe("list", () => {
    it("lists all stored memories", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      await manager.remember("item-a", "knowledge", "Item A", "Content A");
      await manager.remember("item-b", "project", "Item B", "Content B");
      await manager.remember("item-c", "preference", "Item C", "Content C");

      const result = await manager.list();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(3);
        const names = result.value.map((e) => e.name).sort();
        expect(names).toEqual(["item-a", "item-b", "item-c"]);
      }
    });

    it("empty store returns empty array", async () => {
      const { manager, cleanup: done } = await createTestMemoryManager();
      cleanup = done;

      const result = await manager.list();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });
});
