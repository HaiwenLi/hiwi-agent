# Implementation Deviations

Deviations from plan that were necessary during implementation.

---

## Sprint 2: Memory System

### 1. mem0 Client: Dependency Injection instead of vi.mock

**Plan:** Use `vi.mock("mem0ai")` to mock the mem0ai SDK in tests.

**Actual:** Changed to dependency injection via `Mem0SdkClient` interface. The constructor accepts an optional `client` parameter for injecting a mock SDK client directly.

**Reason:** `require("mem0ai")` in ESM context (`"type": "module"`) is not intercepted by Vitest's `vi.mock`. The real SDK constructor tried to ping the server during tests, causing authentication errors. DI is also a cleaner testing pattern — no module-level mock coupling.

**Files affected:** `src/memory/mem0-client.ts`, `tests/unit/memory/mem0-client.test.ts`

---

### 2. pruneToolOutputs: Guard against slice(-0) edge case

**Plan:** `preserveRecent` parameter defaults to 2, slicing tool messages with `.slice(-preserveRecent)`.

**Actual:** Added explicit check: `preserveRecent > 0 ? new Set(...) : new Set<string>()`.

**Reason:** JavaScript's `Array.slice(-0)` returns the full array (since `-0 === 0`), so passing `preserveRecent=0` would protect all tool messages from truncation instead of none. This broke the truncation test case.

**Files affected:** `src/memory/compaction.ts`

---

### 3. Minor test assertion adjustments

**Plan:** MEMORY.md line limit assertion `≤ 202`.

**Actual:** Changed to `≤ 203`.

**Reason:** The trailing newline from `content + "\n"` creates one extra empty line when split by `\n`. Header + blank + 200 entries + trailing newline = 203 lines.

**Plan:** Truncation test calls `pruneToolOutputs(messages, 2000)` without third arg.

**Actual:** Changed to `pruneToolOutputs(messages, 2000, 0)`.

**Reason:** With default `preserveRecent=2`, a single tool message is always in the "last 2" and gets preserved. The test needs `preserveRecent=0` to actually exercise truncation.

**Files affected:** `tests/unit/memory/file-store.test.ts`, `tests/unit/memory/compaction.test.ts`
