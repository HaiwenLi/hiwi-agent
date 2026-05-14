import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryFileStore } from "@/memory/file-store.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("MemoryFileStore", () => {
  let store: MemoryFileStore;
  const tmpDir = path.join(os.tmpdir(), "hiwi-memory-test");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("MEMORY.md index", () => {
    it("creates MEMORY.md on init if it doesn't exist", async () => {
      await store.init();
      const content = await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8");
      expect(content).toContain("# Memory Index");
    });

    it("reads existing MEMORY.md", async () => {
      await fs.writeFile(
        path.join(tmpDir, "MEMORY.md"),
        "# Memory Index\n\n- [Test](test.md) — a test memory\n",
      );
      await store.init();
      const index = await store.readIndex();
      expect(index).toContain("Test");
    });

    it("updates MEMORY.md index from memory files", async () => {
      await store.init();
      await store.write("user-profile", "user", "User profile", "John is a developer");
      await store.write("project-foo", "project", "Foo project", "Building foo with TS");

      const index = await store.readIndex();
      expect(index).toContain("user-profile");
      expect(index).toContain("project-foo");
    });

    it("enforces 200-line limit on index", async () => {
      await store.init();
      for (let i = 0; i < 250; i++) {
        await store.write(`mem-${i}`, "knowledge", `Memory ${i}`, `Content ${i}`);
      }
      const index = await store.readIndex();
      const lines = index.split("\n");
      expect(lines.length).toBeLessThanOrEqual(203); // header + blank + 200 entries + trailing newline
    });
  });

  describe("memory files", () => {
    it("writes a memory file with frontmatter", async () => {
      await store.init();
      await store.write("user-profile", "user", "User profile", "John is a developer");

      const filePath = path.join(tmpDir, "user-profile.md");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("---");
      expect(content).toContain("name: user-profile");
      expect(content).toContain("type: user");
      expect(content).toContain("John is a developer");
    });

    it("reads a memory file and parses frontmatter", async () => {
      await store.init();
      await store.write("test-mem", "knowledge", "Test memory", "Some content here");

      const mem = await store.read("test-mem");
      expect(mem).not.toBeNull();
      expect(mem?.name).toBe("test-mem");
      expect(mem?.type).toBe("knowledge");
      expect(mem?.description).toBe("Test memory");
      expect(mem?.content).toBe("Some content here");
    });

    it("returns null for nonexistent memory", async () => {
      await store.init();
      const mem = await store.read("nonexistent");
      expect(mem).toBeNull();
    });

    it("lists all memories with metadata", async () => {
      await store.init();
      await store.write("mem-a", "user", "Memory A", "Content A");
      await store.write("mem-b", "project", "Memory B", "Content B");

      const list = await store.list();
      expect(list).toHaveLength(2);
      expect(list.map((m) => m.name).sort()).toEqual(["mem-a", "mem-b"]);
    });

    it("updates an existing memory file", async () => {
      await store.init();
      await store.write("test-mem", "knowledge", "Original", "Original content");
      await store.write("test-mem", "knowledge", "Updated", "Updated content");

      const mem = await store.read("test-mem");
      expect(mem?.content).toBe("Updated content");
      expect(mem?.description).toBe("Updated");
    });

    it("deletes a memory file", async () => {
      await store.init();
      await store.write("to-delete", "knowledge", "Delete me", "Bye");
      await store.delete("to-delete");

      const mem = await store.read("to-delete");
      expect(mem).toBeNull();
    });

    it("filters memories by type", async () => {
      await store.init();
      await store.write("user-1", "user", "User 1", "Content");
      await store.write("proj-1", "project", "Project 1", "Content");
      await store.write("know-1", "knowledge", "Knowledge 1", "Content");

      const userMems = await store.list({ type: "user" });
      expect(userMems).toHaveLength(1);
      expect(userMems[0].type).toBe("user");
    });

    it("sets created and updated timestamps", async () => {
      await store.init();
      await store.write("timestamped", "knowledge", "Test", "Content");

      const mem = await store.read("timestamped");
      expect(mem?.created).toBeTruthy();
      expect(mem?.updated).toBeTruthy();
    });
  });
});
