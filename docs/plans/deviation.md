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

---

## Sprint 4: CLI + MCP

### 1. ProviderRegistry mock method names: setActiveProvider/setActiveModel → setProvider/setModel

**Plan:** Test mocks define `setActiveProvider` and `setActiveModel` on the provider registry mock. Test assertions check these methods.

**Actual:** Changed mock and assertions to `setProvider` and `setModel`.

**Reason:** The real `ProviderRegistry` (from Sprint 1) exposes `setProvider()` and `setModel()`, not `setActiveProvider()`/`setActiveModel()`. The plan's test mock didn't match the actual API. The implementation code in `commands.ts` correctly called `ctx.providerRegistry.setModel(args)` and `ctx.providerRegistry.setProvider(args)`, but the mock would never receive those calls.

**Files affected:** `tests/unit/cli/commands.test.ts`

---

### 2. SkillExecutor import: type-only → value import in REPL

**Plan:** `import type { SkillExecutor } from "../skills/executor.js";` in `src/cli/repl.ts`.

**Actual:** Changed to `import { SkillExecutor } from "../skills/executor.js";` (value import, not type-only).

**Reason:** The REPL's `executeSkill` method instantiates `new SkillExecutor(this.deps.toolRegistry)` at runtime. A `type`-only import gets erased at compile time, causing `ReferenceError: SkillExecutor is not defined` when the skill trigger path executes. This only surfaced at test runtime since the plan's code listed SkillExecutor as a type import.

**Files affected:** `src/cli/repl.ts`

---

### 3. SkillLoader Dirent type: wrong namespace

**Plan:** `let entries: Awaited<ReturnType<typeof fs.readdir>>;` using `fs` from `node:fs/promises`.

**Actual:** Changed to `let entries: import("node:fs").Dirent[];`.

**Reason:** `pnpm build` (tsup DTS generation) failed with TS2322/TS2345/TS2367 errors. The inferred return type of `fs.readdir` with `withFileTypes: true` resolves to `Dirent<NonSharedBuffer>[]` under strict module resolution, causing type mismatches with `string`-based `path.join` results. Using the explicit `Dirent` type from `node:fs` (not `node:fs/promises`) resolves the issue. Vitest's transform pipeline handled this fine at test time, but `tsc` (used by tsup for DTS) did not.

**Files affected:** `src/skills/loader.ts`

---

### 4. PermissionMode literal narrowing in CLI entry point

**Plan:** `const permissionMode = { value: "normal" as const };`

**Actual:** Changed to `const permissionMode: { value: PermissionMode } = { value: "normal" };` with an explicit `PermissionMode` import.

**Reason:** `as const` narrows the type to the literal `"normal"`, but `REPL` expects `{ value: PermissionMode }` where `PermissionMode = "normal" | "auto" | "yolo"`. The `setPermissionMode` callback can assign `"yolo"` or `"auto"`, which is not assignable to the literal `"normal"`. tsup's DTS build caught this TS2322 error.

**Files affected:** `src/cli/index.ts`

---

### 5. Build outputs and CLI entry point not wired

**Plan:** Single tsup entry `src/index.ts`, `bin` field pointing to `dist/index.js`.

**Actual:** Added dual tsup entry points (`src/index.ts` → `dist/index.js` for library, `src/cli/index.ts` → `dist/cli/index.js` for CLI). Added shebang, `--help` arg parsing, and auto-run call to `src/cli/index.ts`. Updated `bin` to `dist/cli/index.js`.

**Reason:** The library entry (`src/index.ts`) only exports modules — it has no `main()` call or arg parsing. Running `node dist/index.js --help` produced no output because nothing executed. The CLI entry point (`src/cli/index.ts`) had the `main()` function but wasn't built or wired as the bin target.

**Files affected:** `tsup.config.ts`, `package.json`, `src/cli/index.ts`
