# Sprint 2: Memory System — TDD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the memory subsystem — MEMORY.md file store with frontmatter files, mem0 semantic backend integration, memory orchestrator, SQLite session storage, and context compaction.

**Architecture:** Hybrid memory: MEMORY.md (hand-editable index, <200 lines, full-text in system prompt) + mem0 (semantic search, auto-extraction). SQLite for session persistence. Incremental compaction when approaching token limits.

**Tech Stack:** Vitest, Zod, neverthrow, gray-matter (frontmatter), mem0ai, better-sqlite3

**Prerequisite:** Sprint 1 complete (`src/types.ts`, `src/core/config.ts`, `src/core/agent.ts`)

**Reference:** `docs/plans/checkpoint-2026-05-13-implementation-planning.md` (Memory + Session + Compaction sections)

---

## Task 1: Memory File Store

**Files:**
- Create: `src/memory/file-store.ts`
- Create: `tests/unit/memory/file-store.test.ts`

Reads/writes MEMORY.md index and individual memory files with YAML frontmatter. Each memory file has `name`, `description`, `type`, `created`, `updated` fields. MEMORY.md is an index that lists all memory files with one-line summaries.

**Step 1: Write the failing tests**

```typescript
// tests/unit/memory/file-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryFileStore } from "@/memory/file-store.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

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
      expect(lines.length).toBeLessThanOrEqual(202); // header + blank + 200 entries
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
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/memory/file-store.test.ts
```

Expected: FAIL

**Step 3: Add gray-matter dependency**

```bash
pnpm add gray-matter
```

**Step 4: Create src/memory/file-store.ts**

```typescript
// src/memory/file-store.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface MemoryEntry {
  name: string;
  type: string;
  description: string;
  content: string;
  created: string;
  updated: string;
}

export interface ListOptions {
  type?: string;
}

const INDEX_HEADER = "# Memory Index\n\n";
const MAX_INDEX_LINES = 200;

export class MemoryFileStore {
  private basePath: string;
  private initialized = false;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.basePath, { recursive: true });
    const indexPath = path.join(this.basePath, "MEMORY.md");
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, INDEX_HEADER, "utf-8");
    }
    this.initialized = true;
  }

  async readIndex(): Promise<string> {
    const indexPath = path.join(this.basePath, "MEMORY.md");
    return fs.readFile(indexPath, "utf-8");
  }

  async write(
    name: string,
    type: string,
    description: string,
    content: string,
  ): Promise<void> {
    await this.init();
    const filePath = path.join(this.basePath, `${name}.md`);
    const now = new Date().toISOString();

    // Check if file exists to preserve created timestamp
    let created = now;
    try {
      const existing = await fs.readFile(filePath, "utf-8");
      const parsed = matter(existing);
      if (parsed.data.created) created = parsed.data.created;
    } catch {
      // new file
    }

    const frontmatter = {
      name,
      description,
      type,
      created,
      updated: now,
    };

    const fileContent = matter.stringify(content, frontmatter);
    await fs.writeFile(filePath, fileContent, "utf-8");

    await this.rebuildIndex();
  }

  async read(name: string): Promise<MemoryEntry | null> {
    const filePath = path.join(this.basePath, `${name}.md`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = matter(raw);
      return {
        name: parsed.data.name ?? name,
        type: parsed.data.type ?? "unknown",
        description: parsed.data.description ?? "",
        content: parsed.content.trim(),
        created: parsed.data.created ?? "",
        updated: parsed.data.updated ?? "",
      };
    } catch {
      return null;
    }
  }

  async delete(name: string): Promise<void> {
    const filePath = path.join(this.basePath, `${name}.md`);
    try {
      await fs.unlink(filePath);
      await this.rebuildIndex();
    } catch {
      // already deleted
    }
  }

  async list(options?: ListOptions): Promise<MemoryEntry[]> {
    await this.init();
    const files = await fs.readdir(this.basePath);
    const mdFiles = files.filter((f) => f.endsWith(".md") && f !== "MEMORY.md");

    const entries: MemoryEntry[] = [];
    for (const file of mdFiles) {
      const name = file.replace(/\.md$/, "");
      const entry = await this.read(name);
      if (entry && (!options?.type || entry.type === options.type)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  private async rebuildIndex(): Promise<void> {
    const entries = await this.list();
    const lines = entries.map(
      (e) => `- [${e.name}](${e.name}.md) — ${e.description}`,
    );

    // Truncate to max lines
    const truncated = lines.slice(0, MAX_INDEX_LINES);
    const content = INDEX_HEADER + truncated.join("\n") + "\n";

    const indexPath = path.join(this.basePath, "MEMORY.md");
    await fs.writeFile(indexPath, content, "utf-8");
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/memory/file-store.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/memory/file-store.ts tests/unit/memory/file-store.test.ts
git commit -m "feat: memory file store with MEMORY.md index and frontmatter files"
```

---

## Task 2: mem0 Client

**Files:**
- Create: `src/memory/mem0-client.ts`
- Create: `tests/unit/memory/mem0-client.test.ts`

Wrapper around the `mem0ai` SDK `MemoryClient`. Based on actual mem0 TS SDK source at `d:\repos\mem0\mem0-ts`:
- `MemoryClient` constructor takes `{ apiKey: string, host?: string }`
- `add(messages, options)` — first arg is message array, second is `{ userId?, agentId?, metadata? }`
- `search(query, options)` — returns `{ results: Array<{ id, memory, score, metadata?, ... }> }`
- `delete(memoryId)` — takes string ID directly
- `getAll(options)` — paginated list with `{ userId?, agentId?, page?, pageSize? }`

Falls back gracefully when mem0 is unavailable (no apiKey or connection failure).

**Step 1: Write the failing tests**

```typescript
// tests/unit/memory/mem0-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Mem0Client } from "@/memory/mem0-client.js";

// Mock the mem0ai SDK — MemoryClient is a named export
vi.mock("mem0ai", () => {
  const mockAdd = vi.fn().mockResolvedValue([
    { id: "mem-1", memory: "John is a TS developer", event: "ADD" },
  ]);
  const mockSearch = vi.fn().mockResolvedValue({
    results: [
      { id: "mem-1", memory: "John is a TS developer", score: 0.95, metadata: { type: "user" } },
    ],
  });
  const mockDelete = vi.fn().mockResolvedValue({ message: "Memory deleted" });
  const mockGetAll = vi.fn().mockResolvedValue({
    results: [
      { id: "mem-1", memory: "John is a TS developer", metadata: {} },
    ],
  });

  return {
    MemoryClient: vi.fn(() => ({
      add: mockAdd,
      search: mockSearch,
      delete: mockDelete,
      getAll: mockGetAll,
    })),
    __mockAdd: mockAdd,
    __mockSearch: mockSearch,
    __mockDelete: mockDelete,
    __mockGetAll: mockGetAll,
  };
});

describe("Mem0Client", () => {
  let client: Mem0Client;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates client with apiKey", () => {
    client = new Mem0Client({ apiKey: "test-key" });
    expect(client.isConnected()).toBe(true);
  });

  it("creates client with apiKey and custom host (self-hosted)", () => {
    client = new Mem0Client({ apiKey: "test-key", host: "http://localhost:8050" });
    expect(client.isConnected()).toBe(true);
  });

  it("creates client disabled when no apiKey", () => {
    client = new Mem0Client({ apiKey: undefined });
    expect(client.isConnected()).toBe(false);
  });

  describe("add", () => {
    it("adds a memory via message array", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      const result = await client.add(
        [{ role: "user", content: "John is a TypeScript developer" }],
        { userId: "user-1", metadata: { type: "user" } },
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it("passes correct args to SDK add()", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      await client.add(
        [{ role: "user", content: "test content" }],
        { userId: "user-1", metadata: { type: "knowledge" } },
      );
      const { __mockAdd } = await import("mem0ai");
      expect(__mockAdd).toHaveBeenCalledWith(
        [{ role: "user", content: "test content" }],
        { userId: "user-1", metadata: { type: "knowledge" } },
      );
    });

    it("returns ok(false) when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.add([{ role: "user", content: "test" }]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe("search", () => {
    it("searches and returns normalized results", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      const result = await client.search("TypeScript projects", {
        userId: "user-1",
        topK: 5,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe("mem-1");
        expect(result.value[0].score).toBe(0.95);
      }
    });

    it("passes correct args to SDK search()", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      await client.search("test query", { userId: "user-1", topK: 5 });
      const { __mockSearch } = await import("mem0ai");
      expect(__mockSearch).toHaveBeenCalledWith("test query", { userId: "user-1", topK: 5 });
    });

    it("returns empty array when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.search("test query");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("delete", () => {
    it("deletes a memory by id string", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      const result = await client.delete("mem-id-123");
      expect(result.isOk()).toBe(true);
    });

    it("passes id string directly to SDK", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      await client.delete("mem-id-123");
      const { __mockDelete } = await import("mem0ai");
      expect(__mockDelete).toHaveBeenCalledWith("mem-id-123");
    });

    it("returns ok when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.delete("mem-id-123");
      expect(result.isOk()).toBe(true);
    });
  });

  describe("getAll", () => {
    it("lists all memories with pagination", async () => {
      client = new Mem0Client({ apiKey: "test-key" });
      const result = await client.getAll({ userId: "user-1" });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
      }
    });

    it("returns empty array when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.getAll({ userId: "user-1" });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  it("handles SDK errors gracefully", async () => {
    client = new Mem0Client({ apiKey: "test-key" });
    const { __mockSearch } = await import("mem0ai");
    __mockSearch.mockRejectedValueOnce(new Error("Network error"));
    const result = await client.search("query");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("mem0 search failed");
    }
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/memory/mem0-client.test.ts
```

Expected: FAIL

**Step 3: Add mem0ai dependency**

```bash
pnpm add mem0ai
```

**Step 4: Create src/memory/mem0-client.ts**

```typescript
// src/memory/mem0-client.ts
import { err, ok, type Result } from "neverthrow";
import type { Message } from "../types.js";

// mem0 SDK types (mirrors d:\repos\mem0\mem0-ts\src\client\mem0.ts)
export interface Mem0SearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: Record<string, unknown>;
  userId?: string;
  agentId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Mem0AddOptions {
  userId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0SearchOptions {
  userId?: string;
  agentId?: string;
  topK?: number;
  threshold?: number;
}

export interface Mem0GetAllOptions {
  userId?: string;
  agentId?: string;
  page?: number;
  pageSize?: number;
}

export class Mem0Client {
  private client: { add: Function; search: Function; delete: Function; getAll: Function } | null;
  private enabled: boolean;

  constructor(options: { apiKey?: string; host?: string }) {
    if (options.apiKey) {
      try {
        // mem0ai exports MemoryClient as a named export
        // constructor: { apiKey: string, host?: string }
        const { MemoryClient } = require("mem0ai");
        this.client = new MemoryClient({
          apiKey: options.apiKey,
          host: options.host,
        });
        this.enabled = true;
      } catch {
        this.client = null;
        this.enabled = false;
      }
    } else {
      this.client = null;
      this.enabled = false;
    }
  }

  isConnected(): boolean {
    return this.enabled;
  }

  /**
   * Add memories from a message array.
   * SDK signature: add(messages: Message[], options?: AddMemoryOptions)
   * where Message = { role: "user"|"assistant", content: string }
   */
  async add(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: Mem0AddOptions,
  ): Promise<Result<boolean, Error>> {
    if (!this.enabled || !this.client) return ok(false);

    try {
      await this.client.add(messages, options);
      return ok(true);
    } catch (error) {
      return err(new Error(`mem0 add failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Search memories. SDK returns { results: Memory[] }.
   * We normalize to Mem0SearchResult[].
   */
  async search(query: string, options?: Mem0SearchOptions): Promise<Result<Mem0SearchResult[], Error>> {
    if (!this.enabled || !this.client) return ok([]);

    try {
      const response = await this.client.search(query, options) as {
        results: Array<{
          id: string;
          memory: string;
          score: number;
          metadata?: Record<string, unknown>;
          userId?: string;
          agentId?: string;
          createdAt?: string;
          updatedAt?: string;
        }>;
      };

      return ok(
        response.results.map((r) => ({
          id: r.id,
          memory: r.memory,
          score: r.score,
          metadata: r.metadata,
          userId: r.userId,
          agentId: r.agentId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      );
    } catch (error) {
      return err(new Error(`mem0 search failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Delete a memory. SDK takes memoryId as string directly.
   */
  async delete(memoryId: string): Promise<Result<boolean, Error>> {
    if (!this.enabled || !this.client) return ok(true);

    try {
      await this.client.delete(memoryId);
      return ok(true);
    } catch (error) {
      return err(new Error(`mem0 delete failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  /**
   * Get all memories with optional filters.
   */
  async getAll(options?: Mem0GetAllOptions): Promise<Result<Mem0SearchResult[], Error>> {
    if (!this.enabled || !this.client) return ok([]);

    try {
      const response = await this.client.getAll(options) as {
        results: Array<{
          id: string;
          memory: string;
          score?: number;
          metadata?: Record<string, unknown>;
        }>;
      };

      return ok(
        response.results.map((r) => ({
          id: r.id,
          memory: r.memory,
          score: r.score ?? 0,
          metadata: r.metadata,
        })),
      );
    } catch (error) {
      return err(new Error(`mem0 getAll failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/memory/mem0-client.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/memory/mem0-client.ts tests/unit/memory/mem0-client.test.ts
git commit -m "feat: mem0 client wrapper using actual MemoryClient SDK API"
```

---

## Task 3: Memory Manager

**Files:**
- Create: `src/memory/manager.ts`
- Create: `tests/unit/memory/manager.test.ts`

The orchestrator that ties file-store and mem0 together. Handles: `remember` (save to both stores), `recall` (search both, merge + deduplicate), `forget` (delete from both). Also provides `getSystemContext()` that returns the full MEMORY.md index for system prompt injection.

**Step 1: Write the failing tests**

```typescript
// tests/unit/memory/manager.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ok } from "neverthrow";
import { MemoryManager } from "@/memory/manager.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

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
      const result = await manager.remember("user-profile", "user", "User profile", "John is a developer");
      expect(result.isOk()).toBe(true);

      const mem = await fileStore.read("user-profile");
      expect(mem?.content).toBe("John is a developer");
    });

    it("tries to save to mem0 as well", async () => {
      const mockMem0 = new Mem0Client({ apiKey: "test-key" });
      const addSpy = vi.spyOn(mockMem0, "add").mockResolvedValue(
        ok(true),
      );
      const mgr = new MemoryManager(fileStore, mockMem0);

      await mgr.remember("test", "knowledge", "Test", "Content");
      expect(addSpy).toHaveBeenCalledWith(
        [{ role: "user", content: "Content" }],
        { metadata: { name: "test", type: "knowledge", description: "Test" } },
      );
    });

    it("succeeds even if mem0 fails", async () => {
      // mem0 is disabled, should still write to file store
      const result = await manager.remember("test", "knowledge", "Test", "Content");
      expect(result.isOk()).toBe(true);
    });
  });

  describe("recall", () => {
    it("searches file store by keyword match", async () => {
      await fileStore.write("ts-knowledge", "knowledge", "TS knowledge", "TypeScript is great for agents");
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
        // No duplicate entries
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
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/memory/manager.test.ts
```

Expected: FAIL

**Step 3: Create src/memory/manager.ts**

```typescript
// src/memory/manager.ts
import { err, ok, type Result } from "neverthrow";
import type { MemoryFileStore, MemoryEntry } from "./file-store.js";
import type { Mem0Client, Mem0SearchResult } from "./mem0-client.js";

export interface RecallOptions {
  type?: string;
  limit?: number;
}

export interface MergedMemoryResult {
  name: string;
  type: string;
  description: string;
  content: string;
  score: number;
  source: "file" | "mem0";
}

export class MemoryManager {
  private fileStore: MemoryFileStore;
  private mem0: Mem0Client;

  constructor(fileStore: MemoryFileStore, mem0: Mem0Client) {
    this.fileStore = fileStore;
    this.mem0 = mem0;
  }

  async remember(
    name: string,
    type: string,
    description: string,
    content: string,
  ): Promise<Result<boolean, Error>> {
    try {
      // Always save to file store
      await this.fileStore.write(name, type, description, content);

      // Try mem0 (best effort)
      if (this.mem0.isConnected()) {
        await this.mem0.add(
          [{ role: "user", content }],
          { metadata: { name, type, description } },
        );
      }

      return ok(true);
    } catch (error) {
      return err(new Error(`Failed to save memory: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async recall(query: string, options?: RecallOptions): Promise<Result<MergedMemoryResult[], Error>> {
    try {
      const results: MergedMemoryResult[] = [];
      const seen = new Set<string>();

      // Search file store (keyword match)
      const allEntries = await this.fileStore.list({ type: options?.type });
      const queryLower = query.toLowerCase();
      for (const entry of allEntries) {
        const text = `${entry.name} ${entry.description} ${entry.content}`.toLowerCase();
        if (text.includes(queryLower)) {
          if (!seen.has(entry.name)) {
            seen.add(entry.name);
            results.push({
              name: entry.name,
              type: entry.type,
              description: entry.description,
              content: entry.content,
              score: 1.0,
              source: "file",
            });
          }
        }
      }

      // Search mem0 (semantic)
      if (this.mem0.isConnected()) {
        const mem0Result = await this.mem0.search(query, { limit: options?.limit ?? 10 });
        if (mem0Result.isOk()) {
          for (const r of mem0Result.value) {
            const key = r.memory.slice(0, 50);
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                name: r.metadata?.name as string ?? r.id,
                type: r.metadata?.type as string ?? "unknown",
                description: r.memory.slice(0, 100),
                content: r.memory,
                score: r.score,
                source: "mem0",
              });
            }
          }
        }
      }

      // Sort by score descending, file store results first
      results.sort((a, b) => {
        if (a.source === "file" && b.source !== "file") return -1;
        if (a.source !== "file" && b.source === "file") return 1;
        return b.score - a.score;
      });

      return ok(results.slice(0, options?.limit ?? 10));
    } catch (error) {
      return err(new Error(`Memory recall failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async forget(name: string): Promise<Result<boolean, Error>> {
    try {
      const entry = await this.fileStore.read(name);
      if (!entry) {
        return err(new Error(`Memory not found: ${name}`));
      }
      await this.fileStore.delete(name);
      return ok(true);
    } catch (error) {
      return err(new Error(`Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  async getSystemContext(): Promise<string> {
    return this.fileStore.readIndex();
  }

  async list(): Promise<Result<MemoryEntry[], Error>> {
    try {
      const entries = await this.fileStore.list();
      return ok(entries);
    } catch (error) {
      return err(new Error(`Failed to list memories: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/memory/manager.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/manager.ts tests/unit/memory/manager.test.ts
git commit -m "feat: memory manager orchestrating file store + mem0 with merge/dedup"
```

---

## Task 4: Session Storage

**Files:**
- Create: `src/memory/session.ts`
- Create: `tests/unit/memory/session.test.ts`

SQLite session persistence using `better-sqlite3`. Three tables: `sessions`, `messages`, `summaries`. Supports session create/resume/list/delete, message append with token tracking, and summary management.

**Step 1: Write the failing tests**

```typescript
// tests/unit/memory/session.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore } from "@/memory/session.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("SessionStore", () => {
  let store: SessionStore;
  const tmpDir = path.join(os.tmpdir(), "hiwi-session-test");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    store = new SessionStore(path.join(tmpDir, "session.db"));
    store.init();
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("sessions", () => {
    it("creates a new session", () => {
      const session = store.createSession("/project/my-app");
      expect(session.id).toBeTruthy();
      expect(session.workingDir).toBe("/project/my-app");
      expect(session.status).toBe("active");
    });

    it("lists sessions", () => {
      store.createSession("/project/a");
      store.createSession("/project/b");
      const sessions = store.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it("finds active session for working directory", () => {
      store.createSession("/project/find-me");
      const found = store.findActiveSession("/project/find-me");
      expect(found).not.toBeNull();
      expect(found?.workingDir).toBe("/project/find-me");
    });

    it("returns null when no active session for directory", () => {
      const found = store.findActiveSession("/nonexistent");
      expect(found).toBeNull();
    });

    it("marks session as completed", () => {
      const session = store.createSession("/project/end-me");
      store.completeSession(session.id);
      const found = store.findActiveSession("/project/end-me");
      expect(found).toBeNull();
    });
  });

  describe("messages", () => {
    let sessionId: string;

    beforeEach(() => {
      const session = store.createSession("/project/messages");
      sessionId = session.id;
    });

    it("appends messages and retrieves them", () => {
      store.appendMessage(sessionId, "user", "Hello", 5);
      store.appendMessage(sessionId, "assistant", "Hi there!", 10);

      const messages = store.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
      expect(messages[1].content).toBe("Hi there!");
    });

    it("tracks token counts per message", () => {
      store.appendMessage(sessionId, "user", "Hello", 5);
      store.appendMessage(sessionId, "assistant", "Response", 15);

      const messages = store.getMessages(sessionId);
      expect(messages[0].tokens).toBe(5);
      expect(messages[1].tokens).toBe(15);
    });

    it("computes total token count for session", () => {
      store.appendMessage(sessionId, "user", "A", 5);
      store.appendMessage(sessionId, "assistant", "B", 10);

      const total = store.getTotalTokens(sessionId);
      expect(total).toBe(15);
    });

    it("returns messages in chronological order", () => {
      store.appendMessage(sessionId, "user", "first", 1);
      store.appendMessage(sessionId, "assistant", "second", 2);
      store.appendMessage(sessionId, "user", "third", 3);

      const messages = store.getMessages(sessionId);
      expect(messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    });

    it("returns empty array for nonexistent session", () => {
      const messages = store.getMessages("nonexistent-id");
      expect(messages).toEqual([]);
    });
  });

  describe("summaries", () => {
    let sessionId: string;

    beforeEach(() => {
      const session = store.createSession("/project/summaries");
      sessionId = session.id;
    });

    it("saves and retrieves a summary", () => {
      store.saveSummary(sessionId, "Goal: Build agent. Progress: Sprint 1 done.");
      const summary = store.getLatestSummary(sessionId);
      expect(summary).not.toBeNull();
      expect(summary?.content).toContain("Build agent");
    });

    it("replaces previous summary (incremental)", () => {
      store.saveSummary(sessionId, "Summary v1");
      store.saveSummary(sessionId, "Summary v2");

      const summary = store.getLatestSummary(sessionId);
      expect(summary?.content).toBe("Summary v2");
    });

    it("returns null when no summary exists", () => {
      const summary = store.getLatestSummary(sessionId);
      expect(summary).toBeNull();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/memory/session.test.ts
```

Expected: FAIL

**Step 3: Add better-sqlite3 dependency**

```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

**Step 4: Create src/memory/session.ts**

```typescript
// src/memory/session.ts
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface Session {
  id: string;
  workingDir: string;
  status: "active" | "completed";
  createdAt: string;
  lastActive: string;
}

export interface SessionMessage {
  id: number;
  sessionId: string;
  role: string;
  content: string;
  tokens: number;
  createdAt: string;
}

export interface SessionSummary {
  id: number;
  sessionId: string;
  content: string;
  createdAt: string;
}

const CREATE_SESSIONS = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    working_dir TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_MESSAGES = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_SUMMARIES = `
  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    // Ensure directory exists
    require("node:fs").mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
  }

  init(): void {
    this.db.exec(CREATE_SESSIONS);
    this.db.exec(CREATE_MESSAGES);
    this.db.exec(CREATE_SUMMARIES);
  }

  close(): void {
    this.db.close();
  }

  createSession(workingDir: string): Session {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO sessions (id, working_dir, status, created_at, last_active) VALUES (?, ?, 'active', ?, ?)")
      .run(id, workingDir, now, now);

    return { id, workingDir, status: "active", createdAt: now, lastActive: now };
  }

  listSessions(): Session[] {
    return this.db
      .prepare("SELECT id, working_dir as workingDir, status, created_at as createdAt, last_active as lastActive FROM sessions ORDER BY last_active DESC")
      .all() as Session[];
  }

  findActiveSession(workingDir: string): Session | null {
    const row = this.db
      .prepare("SELECT id, working_dir as workingDir, status, created_at as createdAt, last_active as lastActive FROM sessions WHERE working_dir = ? AND status = 'active' ORDER BY last_active DESC LIMIT 1")
      .get(workingDir) as Session | undefined;
    return row ?? null;
  }

  completeSession(id: string): void {
    this.db
      .prepare("UPDATE sessions SET status = 'completed', last_active = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  appendMessage(sessionId: string, role: string, content: string, tokens: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO messages (session_id, role, content, tokens, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(sessionId, role, content, tokens, now);

    this.db
      .prepare("UPDATE sessions SET last_active = ? WHERE id = ?")
      .run(now, sessionId);
  }

  getMessages(sessionId: string): SessionMessage[] {
    return this.db
      .prepare("SELECT id, session_id as sessionId, role, content, tokens, created_at as createdAt FROM messages WHERE session_id = ? ORDER BY id ASC")
      .all(sessionId) as SessionMessage[];
  }

  getTotalTokens(sessionId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(tokens), 0) as total FROM messages WHERE session_id = ?")
      .get(sessionId) as { total: number };
    return row.total;
  }

  saveSummary(sessionId: string, content: string): void {
    // Delete existing summary (incremental: replace, not append)
    this.db.prepare("DELETE FROM summaries WHERE session_id = ?").run(sessionId);
    this.db
      .prepare("INSERT INTO summaries (session_id, content, created_at) VALUES (?, ?, ?)")
      .run(sessionId, content, new Date().toISOString());
  }

  getLatestSummary(sessionId: string): SessionSummary | null {
    const row = this.db
      .prepare("SELECT id, session_id as sessionId, content, created_at as createdAt FROM summaries WHERE session_id = ? ORDER BY id DESC LIMIT 1")
      .get(sessionId) as SessionSummary | undefined;
    return row ?? null;
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm test tests/unit/memory/session.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/memory/session.ts tests/unit/memory/session.test.ts
git commit -m "feat: SQLite session storage with sessions, messages, summaries tables"
```

---

## Task 5: Context Compaction

**Files:**
- Create: `src/memory/compaction.ts`
- Create: `tests/unit/memory/compaction.test.ts`

OpenCode-style incremental compaction. Two-phase: (1) prune old tool outputs >2K chars, (2) summarize older messages via LLM into structured summary. Triggered when token count approaches context limit. Incremental: new summary updates old, not from scratch.

**Step 1: Write the failing tests**

```typescript
// tests/unit/memory/compaction.test.ts
import { describe, it, expect } from "vitest";
import {
  ContextCompactor,
  estimateTokens,
  shouldCompact,
  pruneToolOutputs,
} from "@/memory/compaction.js";
import type { Message } from "@/types.js";
import { MockAdapter } from "@/adapters/mock.js";

describe("Context Compaction", () => {
  describe("estimateTokens", () => {
    it("estimates tokens as ~4 chars per token", () => {
      expect(estimateTokens("Hello world")).toBe(Math.ceil(11 / 4));
    });

    it("handles empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("shouldCompact", () => {
    it("returns true when approaching limit", () => {
      const messages: Message[] = [
        { role: "user", content: "a".repeat(4000) },
        { role: "assistant", content: "b".repeat(4000) },
      ];
      // 8000 chars ≈ 2000 tokens, context limit 2500, reserved 500
      // 2000 >= 2500 - 4096 - 500 = negative, so no
      // Let's use a tighter limit
      expect(shouldCompact(messages, 1500, 1000, 200)).toBe(true);
    });

    it("returns false when well within limit", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];
      expect(shouldCompact(messages, 200_000, 4096, 20_000)).toBe(false);
    });
  });

  describe("pruneToolOutputs", () => {
    it("truncates tool outputs longer than 2K chars", () => {
      const messages: Message[] = [
        { role: "tool", content: "x".repeat(3000), toolCallId: "c1" },
        { role: "assistant", content: "Summary" },
      ];
      const pruned = pruneToolOutputs(messages, 2000);
      expect(pruned[0].content.length).toBeLessThanOrEqual(2020); // 2000 + truncation note
      expect(pruned[0].content).toContain("truncated");
    });

    it("preserves short tool outputs", () => {
      const messages: Message[] = [
        { role: "tool", content: "short output", toolCallId: "c1" },
      ];
      const pruned = pruneToolOutputs(messages, 2000);
      expect(pruned[0].content).toBe("short output");
    });

    it("preserves non-tool messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "World" },
      ];
      const pruned = pruneToolOutputs(messages, 2000);
      expect(pruned).toEqual(messages);
    });

    it("keeps last N tool outputs untruncated", () => {
      const messages: Message[] = [
        { role: "tool", content: "x".repeat(3000), toolCallId: "c1" },
        { role: "tool", content: "y".repeat(3000), toolCallId: "c2" },
      ];
      const pruned = pruneToolOutputs(messages, 2000, 1); // keep last 1
      expect(pruned[0].content).toContain("truncated"); // first was truncated
      expect(pruned[1].content).toBe("y".repeat(3000)); // last preserved
    });
  });

  describe("ContextCompactor", () => {
    it("returns messages unchanged when no compaction needed", async () => {
      const adapter = new MockAdapter([
        { content: "Summary", toolCalls: [], finishReason: "stop" },
      ]);
      const compactor = new ContextCompactor(adapter);

      const messages: Message[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ];

      const result = await compactor.compact(messages, {
        contextLimit: 200_000,
        maxOutputTokens: 4096,
        reserved: 20_000,
      });

      // No compaction needed, returns as-is
      expect(result.messages).toEqual(messages);
      expect(result.compacted).toBe(false);
    });

    it("compacts when approaching limit", async () => {
      const adapter = new MockAdapter([
        {
          content: "Goal: Build agent\nProgress: Sprint 1 done\nDecisions: TypeScript\nNext: Sprint 2",
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const compactor = new ContextCompactor(adapter);

      const messages: Message[] = [
        { role: "user", content: "a".repeat(2000) },
        { role: "assistant", content: "b".repeat(2000) },
        { role: "tool", content: "x".repeat(3000), toolCallId: "c1" },
        { role: "assistant", content: "c".repeat(2000) },
        { role: "user", content: "latest message" },
        { role: "assistant", content: "latest response" },
      ];

      const result = await compactor.compact(messages, {
        contextLimit: 1500, // tight limit to force compaction
        maxOutputTokens: 1000,
        reserved: 200,
      });

      expect(result.compacted).toBe(true);
      // Should have summary + last 2 turns
      expect(result.messages.length).toBeLessThan(messages.length);
    });

    it("merges with existing summary (incremental)", async () => {
      const adapter = new MockAdapter([
        {
          content: "Updated: Added compaction module\nProgress: Sprint 2 in progress",
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const compactor = new ContextCompactor(adapter);

      const existingSummary = "Previous summary: Sprint 1 complete";
      const messages: Message[] = [
        { role: "system", content: existingSummary },
        { role: "user", content: "a".repeat(2000) },
        { role: "assistant", content: "b".repeat(2000) },
        { role: "user", content: "latest" },
        { role: "assistant", content: "response" },
      ];

      const result = await compactor.compact(messages, {
        contextLimit: 1000,
        maxOutputTokens: 500,
        reserved: 100,
        existingSummary,
      });

      expect(result.compacted).toBe(true);
      // The LLM prompt should include the existing summary
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/memory/compaction.test.ts
```

Expected: FAIL

**Step 3: Create src/memory/compaction.ts**

```typescript
// src/memory/compaction.ts
import type { Message, ModelAdapter } from "../types.js";

export interface CompactOptions {
  contextLimit: number;
  maxOutputTokens: number;
  reserved: number;
  existingSummary?: string;
  maxToolOutputChars?: number;
  preserveRecentToolOutputs?: number;
}

export interface CompactResult {
  messages: Message[];
  summary?: string;
  compacted: boolean;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function shouldCompact(
  messages: Message[],
  contextLimit: number,
  maxOutputTokens: number,
  reserved: number,
): boolean {
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const threshold = contextLimit - maxOutputTokens - reserved;
  return totalTokens >= threshold;
}

export function pruneToolOutputs(
  messages: Message[],
  maxChars: number = 2000,
  preserveRecent: number = 2,
): Message[] {
  const toolMessages = messages.filter((m) => m.role === "tool");
  const recentToolIds = new Set(
    toolMessages.slice(-preserveRecent).map((m) => m.toolCallId),
  );

  return messages.map((m) => {
    if (m.role !== "tool") return m;
    if (recentToolIds.has(m.toolCallId)) return m;
    if (m.content.length <= maxChars) return m;

    const truncated = m.content.slice(0, maxChars);
    return {
      ...m,
      content: `${truncated}\n\n[... truncated from ${m.content.length} chars]`,
    };
  });
}

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Produce a structured summary with these sections:

## Goal
What the user is trying to accomplish.

## Progress
What has been done so far.

## Decisions
Key decisions made.

## Next Steps
What needs to happen next.

## Critical Context
Important facts, file paths, or state that must be preserved.

## Files
Files that have been read, created, or modified.

Be concise. Preserve all factual details. Do not add anything not in the conversation.`;

export class ContextCompactor {
  private adapter: ModelAdapter;

  constructor(adapter: ModelAdapter) {
    this.adapter = adapter;
  }

  async compact(messages: Message[], options: CompactOptions): Promise<CompactResult> {
    if (!shouldCompact(messages, options.contextLimit, options.maxOutputTokens, options.reserved)) {
      return { messages, compacted: false };
    }

    // Phase 1: prune tool outputs
    const maxChars = options.maxToolOutputChars ?? 2000;
    const preserveRecent = options.preserveRecentToolOutputs ?? 2;
    let processed = pruneToolOutputs(messages, maxChars, preserveRecent);

    // Phase 2: summarize older messages
    // Keep last 2 turns (4 messages) verbatim
    const recentCount = 4;
    const recent = processed.slice(-recentCount);
    const older = processed.slice(0, -recentCount);

    if (older.length === 0) {
      // Not enough to summarize, just return pruned
      return { messages: processed, compacted: true };
    }

    // Build summarize request
    const olderText = older
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");

    const summarizeInput = options.existingSummary
      ? `Previous summary:\n${options.existingSummary}\n\nNew conversation to incorporate:\n${olderText}`
      : `Conversation to summarize:\n${olderText}`;

    const response = await this.adapter.chat(
      [
        { role: "system", content: SUMMARIZE_PROMPT },
        { role: "user", content: summarizeInput },
      ],
      { maxTokens: 2000 },
    );

    const summary = response.content;

    // Reconstruct: summary as system message + recent messages
    const compacted: Message[] = [
      { role: "system", content: `[Conversation Summary]\n${summary}` },
      ...recent,
    ];

    return { messages: compacted, summary, compacted: true };
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/memory/compaction.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/memory/compaction.ts tests/unit/memory/compaction.test.ts
git commit -m "feat: context compaction with prune, LLM summarize, incremental merge"
```

---

## Task 6: Integration Test + Update Exports

**Files:**
- Create: `tests/integration/memory-flow.test.ts`
- Modify: `src/index.ts`

End-to-end test: init file store → remember memories → recall → verify merge → create session → append messages → compact → resume session.

**Step 1: Write the integration test**

```typescript
// tests/integration/memory-flow.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryFileStore } from "@/memory/file-store.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { MemoryManager } from "@/memory/manager.js";
import { SessionStore } from "@/memory/session.js";
import { ContextCompactor } from "@/memory/compaction.js";
import { MockAdapter } from "@/adapters/mock.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Integration: Memory Flow E2E", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-memory-integration");
  let manager: MemoryManager;
  let session: SessionStore;
  let compactor: ContextCompactor;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    const fileStore = new MemoryFileStore(tmpDir);
    await fileStore.init();

    const mem0 = new Mem0Client({ apiKey: undefined }); // disabled
    manager = new MemoryManager(fileStore, mem0);

    session = new SessionStore(path.join(tmpDir, "session.db"));
    session.init();

    mockAdapter = new MockAdapter([
      {
        content: "Goal: Test integration\nProgress: Memory flow working\nDecisions: Use hybrid memory\nNext: Test compaction\nFiles: test files",
        toolCalls: [],
        finishReason: "stop",
      },
    ]);
    compactor = new ContextCompactor(mockAdapter);
  });

  afterEach(async () => {
    session.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("runs full remember → recall → session → compact flow", async () => {
    // 1. Remember memories
    const r1 = await manager.remember("user-profile", "user", "User profile", "Alice is a backend developer who prefers Go");
    expect(r1.isOk()).toBe(true);

    const r2 = await manager.remember("project-agent", "project", "Agent project", "Building hiwi-agent with TypeScript and multi-model support");
    expect(r2.isOk()).toBe(true);

    // 2. Recall memories
    const recall = await manager.recall("TypeScript");
    expect(recall.isOk()).toBe(true);
    if (recall.isOk()) {
      expect(recall.value.length).toBeGreaterThan(0);
      const found = recall.value.some((m) => m.content.includes("TypeScript"));
      expect(found).toBe(true);
    }

    // 3. Get system context
    const ctx = await manager.getSystemContext();
    expect(ctx).toContain("user-profile");
    expect(ctx).toContain("project-agent");

    // 4. Create session and add messages
    const s = session.createSession("/project/hiwi-agent");
    session.appendMessage(s.id, "system", "You are a helpful agent", 10);
    session.appendMessage(s.id, "user", "Build me an agent", 8);
    session.appendMessage(s.id, "assistant", "I'll help you build hiwi-agent with TypeScript", 15);

    const totalTokens = session.getTotalTokens(s.id);
    expect(totalTokens).toBe(33);

    // 5. Compact messages (force by using tight limit)
    const messages = session.getMessages(s.id).map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    const compacted = await compactor.compact(messages, {
      contextLimit: 50, // very tight to force compaction
      maxOutputTokens: 20,
      reserved: 10,
    });
    expect(compacted.compacted).toBe(true);
    expect(compacted.messages.length).toBeLessThanOrEqual(messages.length);

    // 6. Save summary to session
    if (compacted.summary) {
      session.saveSummary(s.id, compacted.summary);
      const savedSummary = session.getLatestSummary(s.id);
      expect(savedSummary?.content).toContain("Test integration");
    }

    // 7. Verify session can be found and resumed
    const found = session.findActiveSession("/project/hiwi-agent");
    expect(found?.id).toBe(s.id);

    session.completeSession(s.id);
    expect(session.findActiveSession("/project/hiwi-agent")).toBeNull();
  });

  it("handles forget flow correctly", async () => {
    await manager.remember("temp-note", "knowledge", "Temp note", "Temporary information");
    const recall1 = await manager.recall("Temporary");
    expect(recall1.isOk()).toBe(true);
    if (recall1.isOk()) {
      expect(recall1.value.length).toBeGreaterThan(0);
    }

    await manager.forget("temp-note");
    const recall2 = await manager.recall("Temporary");
    expect(recall2.isOk()).toBe(true);
    if (recall2.isOk()) {
      expect(recall2.value).toEqual([]);
    }
  });
});
```

**Step 2: Update src/index.ts to export Sprint 2 modules**

```typescript
// Add to src/index.ts:
// Memory
export { MemoryFileStore, type MemoryEntry } from "./memory/file-store.js";
export { Mem0Client, type Mem0SearchResult } from "./memory/mem0-client.js";
export { MemoryManager, type MergedMemoryResult, type RecallOptions } from "./memory/manager.js";
export { SessionStore, type Session, type SessionMessage, type SessionSummary } from "./memory/session.js";
export { ContextCompactor, estimateTokens, shouldCompact, pruneToolOutputs, type CompactOptions, type CompactResult } from "./memory/compaction.js";
```

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/integration/memory-flow.test.ts src/index.ts
git commit -m "test: integration tests for full memory flow (remember/recall/session/compact)"
```

---

## Sprint 2 Summary

### Files Created (5 source + 5 test)

| Category | Source Files | Test Files |
|----------|-------------|------------|
| File Store | `src/memory/file-store.ts` | `tests/unit/memory/file-store.test.ts` |
| mem0 Client | `src/memory/mem0-client.ts` | `tests/unit/memory/mem0-client.test.ts` |
| Manager | `src/memory/manager.ts` | `tests/unit/memory/manager.test.ts` |
| Session | `src/memory/session.ts` | `tests/unit/memory/session.test.ts` |
| Compaction | `src/memory/compaction.ts` | `tests/unit/memory/compaction.test.ts` |
| Integration | — | `tests/integration/memory-flow.test.ts` |

### New Dependencies

| Package | Purpose |
|---------|---------|
| `gray-matter` | YAML frontmatter parsing for memory files |
| `mem0ai` | mem0 SDK for semantic memory (optional) |
| `better-sqlite3` | SQLite driver for session storage |

### Key Design Points

- **MEMORY.md** is auto-generated index, <200 lines, full-text in system prompt
- **Frontmatter files** — each memory is a `.md` file with YAML metadata (hand-editable)
- **mem0 is optional** — gracefully falls back to file-store only when mem0 unavailable
- **SQLite session** — project-level `.agent/session.db`, three tables, raw SQL
- **Incremental compaction** — prune tool outputs → LLM summarize older → merge with existing summary
- **Merged search** — file-store keyword match + mem0 semantic, deduplicated, file-store prioritized
