# AgentFS Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give hiwi-agent filesystem understanding by implementing agentfs's three SQLite-backed abstractions — tool call audit trail, virtual filesystem, and key-value store.

**Architecture:** New `src/agentfs/` module with three independent classes (AuditTrail, VirtualFS, KvStore) combined under an AgentFS facade. Each uses better-sqlite3 (already a dependency via session.ts). Exposed to the agent as tools and hooked into the agent loop for automatic tool call tracking.

**Tech Stack:** TypeScript, better-sqlite3, vitest

---
## Task 1: Audit Trail (`src/agentfs/audit-trail.ts`, `tests/unit/agentfs/audit-trail.test.ts`)

**Files:**
- Create: `src/agentfs/audit-trail.ts`
- Create: `tests/unit/agentfs/audit-trail.test.ts`

### Step 1: Write the failing test

```typescript
import Database from "better-sqlite3";
import { AuditTrail } from "@/agentfs/audit-trail.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("AuditTrail", () => {
  let db: Database.Database;
  let trail: AuditTrail;

  beforeEach(() => {
    db = new Database(":memory:");
    trail = new AuditTrail(db);
    trail.init();
  });

  afterEach(() => { db.close(); });

  it("records a tool call with start/success flow", () => {
    const id = trail.start("read_file", { path: "/tmp/a" });
    trail.success(id, "file content");
    const record = trail.get(id);
    expect(record).toBeDefined();
    expect(record!.name).toBe("read_file");
    expect(record!.status).toBe("success");
    expect(record!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("records a tool call with start/error flow", () => {
    const id = trail.start("bash", { command: "rm -rf /" });
    trail.error(id, "permission denied");
    const record = trail.get(id);
    expect(record!.status).toBe("error");
    expect(record!.error).toBe("permission denied");
  });

  it("records a completed tool call in one shot", () => {
    const now = Math.floor(Date.now() / 1000);
    const id = trail.record("web_search", now, now + 2, { q: "hello" }, "results", undefined);
    const record = trail.get(id);
    expect(record!.name).toBe("web_search");
    expect(record!.duration_ms).toBe(2000);
  });

  it("returns undefined for unknown id", () => {
    expect(trail.get(999)).toBeUndefined();
  });

  it("queries by name", () => {
    trail.record("read", 1000, 1001, {}, "a");
    trail.record("write", 1000, 1001, {}, "b");
    trail.record("read", 1000, 1001, {}, "c");
    const reads = trail.getByName("read");
    expect(reads).toHaveLength(2);
  });

  it("returns performance stats", () => {
    trail.record("read", 1000, 1002, {}, "ok");
    trail.record("read", 1000, 1004, {}, undefined, "fail");
    const stats = trail.getStats();
    const readStats = stats.find(s => s.name === "read");
    expect(readStats).toBeDefined();
    expect(readStats!.total_calls).toBe(2);
    expect(readStats!.successful).toBe(1);
    expect(readStats!.failed).toBe(1);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx vitest run tests/unit/agentfs/audit-trail.test.ts`
Expected: FAIL — module not found

### Step 3: Write minimal implementation

Create `src/agentfs/audit-trail.ts` with class `AuditTrail`:
- Constructor takes `better-sqlite3` Database
- `init()`: CREATE TABLE tool_calls + indexes
- `start(name, parameters?)`: INSERT with status='pending', RETURNING id
- `success(id, result?)`: UPDATE status='success', set result/completed_at/duration_ms
- `error(id, error)`: UPDATE status='error', set error/completed_at/duration_ms
- `record(name, started_at, completed_at, parameters?, result?, error?)`: one-shot INSERT, RETURNING id
- `get(id)`: SELECT by id, return ToolCall or undefined
- `getByName(name, limit?)`: SELECT by name ordered by started_at DESC
- `getRecent(since, limit?)`: SELECT recent calls after timestamp
- `getStats()`: SELECT with GROUP BY name, COUNT, SUM, AVG

### Step 4: Run tests to verify they pass

Run: `npx vitest run tests/unit/agentfs/audit-trail.test.ts`
Expected: PASS (all tests green)

### Step 5: Commit

```bash
git add src/agentfs/audit-trail.ts tests/unit/agentfs/audit-trail.test.ts
git commit -m "feat: add agentfs audit trail for tool call tracking"
```

---
## Task 2: Virtual Filesystem (`src/agentfs/virtual-fs.ts`, `tests/unit/agentfs/virtual-fs.test.ts`)

**Files:**
- Create: `src/agentfs/virtual-fs.ts`
- Create: `tests/unit/agentfs/virtual-fs.test.ts`

### Step 1: Write the failing test

Key behaviors to test:
- Write then read a file returns content
- Reading nonexistent file throws ENOENT
- List directory contents
- Create directory with mkdir
- Remove file with unlink
- Rename moves content
- stat returns correct metadata
- Symlink creation and readlink
- Write to nested paths auto-creates parent dirs

### Step 2: Run test to verify it fails

### Step 3: Write minimal implementation

Create `src/agentfs/virtual-fs.ts` with class `VirtualFS`:
- Implements agentfs SPEC v0.4 schema (fs_config, fs_inode, fs_dentry, fs_data, fs_symlink, fs_whiteout, fs_origin)
- `init()`: CREATE all tables, seed config + root inode
- Core operations: writeFile, readFile, readdir, mkdir, rmdir, unlink, rename, copyFile, symlink, readlink, stat, access, statfs
- Internal: resolvePath, resolveParent, createInode, createDentry, ensureParentDirs
- Chunk-based storage (default 4096 bytes per chunk)

### Step 4: Run tests to verify they pass

### Step 5: Commit

---
## Task 3: KV Store (`src/agentfs/kv-store.ts`, `tests/unit/agentfs/kv-store.test.ts`)

### Steps:

Write failing test → implement → pass tests → commit

Key behaviors:
- set/get a JSON value
- get nonexistent key returns undefined
- overwrite updates value and updated_at
- list with prefix filtering
- delete removes key
- delete nonexistent key is no-op

---
## Task 4: AgentFS Facade (`src/agentfs/index.ts`)

**Files:**
- Create: `src/agentfs/index.ts`
- Create: `tests/unit/agentfs/index.test.ts`

### Step 1: Write the failing test

```typescript
import { AgentFS } from "@/agentfs/index.js";
import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

describe("AgentFS", () => {
  const dbPath = path.join(os.tmpdir(), `agentfs-test-${Date.now()}.db`);

  it("creates all three subsystems on init", () => {
    const agentfs = new AgentFS(dbPath);
    agentfs.init();
    expect(agentfs.trail).toBeDefined();
    expect(agentfs.fs).toBeDefined();
    expect(agentfs.kv).toBeDefined();
    agentfs.close();
    fs.unlinkSync(dbPath);
  });
});
```

### Step 2-4: Implement → pass → commit

`AgentFS` class:
- `constructor(dbPath: string)` — opens better-sqlite3 database
- `init()` — initializes all three subsystems
- Properties: `trail: AuditTrail`, `fs: VirtualFS`, `kv: KvStore`
- `close()` — closes database

---
## Task 5: AgentFS Tools (`src/tools/agentfs-tools.ts`, `tests/unit/tools/agentfs-tools.test.ts`)

### Step 1: Write the failing test

```typescript
import { describe, expect, it } from "vitest";
import { createAgentFSTools } from "@/tools/agentfs-tools.js";
import { AgentFS } from "@/agentfs/index.js";
import Database from "better-sqlite3";

describe("agentfs tools", () => {
  it("creates agentfs_read tool with correct schema", () => {
    const db = new Database(":memory:");
    const agentfs = new AgentFS(db);
    agentfs.init();
    const tools = createAgentFSTools(agentfs);
    const readTool = tools.find(t => t.name === "agentfs_read");
    expect(readTool).toBeDefined();
    expect(readTool!.inputSchema).toHaveProperty("properties.path");

    // write then read a file through the tool
    agentfs.fs.writeFile("/hello.txt", "world");
    const result = await readTool!.execute({ path: "/hello.txt" }, {} as any);
    expect(result.content).toBe("world");
    db.close();
  });
});
```

### Step 2-4: Implement → pass → commit

Tools:
- `agentfs_read` — read file from virtual FS
- `agentfs_write` — write file to virtual FS
- `agentfs_ls` — list virtual directory
- `agentfs_stat` — stat virtual path
- `agentfs_kv_get` — get KV value
- `agentfs_kv_set` — set KV value
- `agentfs_kv_list` — list KV keys

---
## Task 6: Wire into Agent Loop and Tool Registry

**Files:**
- Modify: `src/core/agent.ts` — hook audit trail into executeTool
- Modify: `src/tools/index.ts` — register agentfs tools

### Step 1: Write the failing test (agent modification)

```typescript
// In tests/unit/core/agent.test.ts, add:
it("records tool calls in audit trail when agentfs is provided", async () => {
  const db = new Database(":memory:");
  const agentfs = new AgentFS(db);
  agentfs.init();

  const readTool = makeTool("read_file");
  toolRegistry.register(readTool);

  const adapter = new MockAdapter([
    { content: "", toolCalls: [{ id: "c1", name: "read_file", input: { path: "/a" } }], finishReason: "tool-calls" },
    { content: "Done", toolCalls: [], finishReason: "stop" },
  ]);

  const loop = new AgentLoop(adapter, toolRegistry, "yolo", DEFAULT_CONFIG, undefined, undefined, agentfs);
  for await (const _ of loop.run([{ role: "user", content: "read" }])) {}

  const stats = agentfs.trail.getStats();
  const readStats = stats.find(s => s.name === "read_file");
  expect(readStats).toBeDefined();
  expect(readStats!.total_calls).toBe(1);

  db.close();
});
```

### Step 2-4: Implement → pass → commit

In `agent.ts`:
- Add optional `agentfs?: AgentFS` parameter to `AgentLoop` constructor
- In `executeTool`, wrap with `agentfs.trail.start(...)` / `.success(...)` / `.error(...)`

In `tools/index.ts`:
- Add `registerAgentFSTools(registry, agentfs)` or create tools with shared AgentFS instance
- Add import and register in `registerExtraTools`

---
## Task 7: Schema Module (`src/agentfs/schema.ts`)

**Files:**
- Create: `src/agentfs/schema.ts` (already done)

Move all CREATE TABLE statements into this shared module.
Include mode constants: S_IFMT, S_IFREG, S_IFDIR, S_IFLNK, DEFAULT_FILE_MODE, DEFAULT_DIR_MODE.
Include default chunk size.
