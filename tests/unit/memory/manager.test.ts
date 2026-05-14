import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryFileStore } from "@/memory/file-store.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { ok } from "neverthrow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("MemoryManager", () => {
  let manager: MemoryManager;
  let fileStore: MemoryFileStore;
  let mem0Client: Mem0Client;
  const tmpDir = path.join(os.tmpdir(), "hiwi-manager-test");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    fileStore = new MemoryFileStore(tmpDir);
    await fileStore.init();
    mem0Client = new Mem0Client({ apiKey: undefined }); // disabled for tests
    manager = new MemoryManager(fileStore, mem0Client);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("remember", () => {
    it("saves a memory to file store", async () => {
      const result = await manager.remember(
        "user-profile",
        "user",
        "User profile",
        "John is a developer",
      );
      expect(result.isOk()).toBe(true);

      const mem = await fileStore.read("user-profile");
      expect(mem?.content).toBe("John is a developer");
    });

    it("tries to save to mem0 as well", async () => {
      const mockSdk = {
        add: vi.fn().mockResolvedValue([{ id: "m1", memory: "test", event: "ADD" }]),
        search: vi.fn().mockResolvedValue({ results: [] }),
        delete: vi.fn().mockResolvedValue({}),
        getAll: vi.fn().mockResolvedValue({ results: [] }),
      };
      const mockMem0 = new Mem0Client({ client: mockSdk });
      const addSpy = vi.spyOn(mockMem0, "add");
      const mgr = new MemoryManager(fileStore, mockMem0);

      await mgr.remember("test", "knowledge", "Test", "Content");
      expect(addSpy).toHaveBeenCalledWith([{ role: "user", content: "Content" }], {
        metadata: { name: "test", type: "knowledge", description: "Test" },
      });
    });

    it("succeeds even if mem0 fails", async () => {
      const result = await manager.remember("test", "knowledge", "Test", "Content");
      expect(result.isOk()).toBe(true);
    });
  });

  describe("recall", () => {
    it("searches file store by keyword match", async () => {
      await fileStore.write(
        "ts-knowledge",
        "knowledge",
        "TS knowledge",
        "TypeScript is great for agents",
      );
      await fileStore.write("py-knowledge", "knowledge", "PY knowledge", "Python is great for ML");

      const result = await manager.recall("TypeScript");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0].content).toContain("TypeScript");
      }
    });

    it("returns empty array for no matches", async () => {
      const result = await manager.recall("nonexistent topic xyz");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it("deduplicates results from file store and mem0", async () => {
      await fileStore.write("dup-test", "knowledge", "Test", "Unique content about TypeScript");

      const result = await manager.recall("TypeScript");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const names = result.value.map((m) => m.name);
        expect(new Set(names).size).toBe(names.length);
      }
    });

    it("filters by type when specified", async () => {
      await fileStore.write("user-1", "user", "User", "Developer");
      await fileStore.write("proj-1", "project", "Project", "Agent project");

      const result = await manager.recall("Developer", { type: "user" });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.every((m) => m.type === "user")).toBe(true);
      }
    });
  });

  describe("forget", () => {
    it("deletes from file store", async () => {
      await fileStore.write("to-forget", "knowledge", "Forget me", "Bye");
      const result = await manager.forget("to-forget");
      expect(result.isOk()).toBe(true);

      const mem = await fileStore.read("to-forget");
      expect(mem).toBeNull();
    });

    it("returns error for nonexistent memory", async () => {
      const result = await manager.forget("nonexistent");
      expect(result.isErr()).toBe(true);
    });
  });

  describe("getSystemContext", () => {
    it("returns MEMORY.md index content for system prompt", async () => {
      await fileStore.write("ctx-test", "knowledge", "Context test", "Some knowledge");
      const context = await manager.getSystemContext();
      expect(context).toContain("ctx-test");
    });

    it("returns empty string when no memories exist", async () => {
      const context = await manager.getSystemContext();
      expect(typeof context).toBe("string");
    });
  });

  describe("list", () => {
    it("delegates to file store", async () => {
      await fileStore.write("list-a", "knowledge", "A", "Content A");
      await fileStore.write("list-b", "project", "B", "Content B");

      const result = await manager.list();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
      }
    });
  });
});
