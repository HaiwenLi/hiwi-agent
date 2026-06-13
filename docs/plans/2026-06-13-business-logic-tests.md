# Plan: Business-Logic Tests for hiwi-agent

## Context

Current tests (~842) are mostly structural unit tests (property exists, function returns value). They don't verify real business logic: commands produce correct output, tool permissions enforce correctly, memory records and retrieves accurately, adapters handle streaming edge cases. This plan adds ~176 tests across 10 test files + 2 helper files, organized by priority.

## Phase 1: Shared Helpers + Commands + Permissions (highest impact)

### 1. Create `tests/helpers/memory-helpers.ts`
- `createTempMemoryStore()` → `{ store, dir, cleanup }`
- `createTestMemoryManager()` → `{ manager, store, dir, cleanup }`
- `makeMessages(pairs)` → `Message[]`

### 2. Create `tests/helpers/repl-helpers.ts`
- `createTestREPL({ adapterResponses, permissionMode })` → `{ repl, outputs, streamOutputs, deps }`
- `makeTool(name, caps)` → shared helper (currently duplicated across 3+ files)

### 3. `tests/unit/cli/commands-business.test.ts` (~28 tests)

Test each command with **real stores**, verify **actual output strings and state mutations**:

| Command | Scenarios |
|---------|-----------|
| `/remember` | Valid format → "Remembered: name" + retrievable; no colon → error; empty content → error; write failure → "Failed: ..." |
| `/recall` | With matches → formatted output; no query → error; no matches → "No memories found" |
| `/forget` | Existing → removed + "Forgot: name"; nonexistent → error; no args → error |
| `/model` | Valid → "Model set to: X"; unknown → error with suggestion; no args → list or "No models" |
| `/provider` | Valid → switched; unknown → error |
| `/yolo` | Normal→yolo with confirm; confirm=false stays; already yolo→normal; no callback defaults |
| `/sessions` | No sessions → "No sessions"; with sessions → numbered list; delete valid/invalid |
| `/effort` | Valid level → set; invalid → usage message |
| Unknown cmd | Returns "Unknown command" |

### 4. `tests/unit/core/tool-permission-flow.test.ts` (~22 tests)

Test the **full permission lifecycle** across `ToolRegistry` and `REPL`:

- **Mode behaviors**: normal (dangerous triggers callback), auto (read-only auto-approved), yolo (all approved)
- **Permission cache**: first call triggers callback, second call skips
- **REPL state machine**: pending permission set on deny; "yes" re-executes + continues; "no" denies + stops
- **Multi-tool batch**: previously-executed tools get placeholder results on grant; all get error results on deny
- **approvedTools/deniedTools sets**: tracked across session; `/new` clears them

## Phase 2: Memory System Depth

### 5. `tests/unit/memory/memory-manager-logic.test.ts` (~18 tests)

Test `MemoryManager` with **real file store + mock mem0**:

- `remember`: writes to store, updates entity index, calls mem0.add when connected
- `recall`: keyword match, type filter, file-before-mem0 priority sort, dedup, limit
- `recall` error handling: mem0 failure → file-only results
- `forget`: deletes from store, removes from entity index, error for nonexistent
- `getSystemContext`: returns MEMORY.md content
- `list`: delegates to file store

### 6. `tests/integration/memory-pipeline.test.ts` (~10 tests)

**End-to-end pipeline**: conversation → auto-extraction → entity linking → knowledge base → user profile

- Multi-turn conversation → auto-extracted facts stored, indexed, searchable
- Entity linking connects memories about "TypeScript" across auto + manual memories
- Knowledge base: keyword search + domain filter
- User profile: auto-extracted preferences build correct profile
- Session summary: summarized and stored
- Forget cascade: removes from entity index, knowledge base no longer returns it
- Cross-session: first session memories retrievable in second session

## Phase 3: Adapter Internals

### 7. `tests/unit/adapters/adapter-utils-business.test.ts` (~25 tests)

Pure function tests — no mocks needed:

**`processThinkStream`** (8 tests):
- No tags → all text-delta; complete tag pair → reasoning + text; multiple pairs; partial tag at buffer boundary held; empty think block; text before/after think; state persists across calls

**`buildNormalizedUsage`** (10 tests):
- Anthropic format with/without cache; Ollama format; OpenAI with cached_tokens; DeepSeek cache_miss; cache subtracted from input; totalTokens correct

**`stripThinkTags`** (3 tests), **`extractText`** (3 tests), **`endsWithPartialTag`** (1 test)

### 8. `tests/unit/adapters/anthropic-streaming.test.ts` (~15 tests)

- content_block_start records pending tool; input_json_delta accumulates; content_block_stop emits complete tool-call
- Malformed JSON defaults to `{}`
- Multiple tool calls accumulate independently by index
- thinking_delta → reasoning-delta
- finalMessage usage enrichment
- Message conversion: system extraction, tool_result injection, image blocks

### 9. `tests/unit/adapters/ollama-streaming.test.ts` (~12 tests)

- NDJSON complete lines parsed; partial line buffered; empty lines skipped
- done=true → finish chunk with usage
- Tool calls accumulated, arguments merged (object merge)
- Remaining buffer processed after stream ends
- Chat: tool_calls conversion, usage mapping

## Phase 4: Tool Depth

### 10. `tests/unit/tools/edit-strategy-chain.test.ts` (~20 tests)

Test the **full fallback chain** with realistic TypeScript/Python code in temp files:

- Each strategy: simple → line-trimmed → line-ending → whitespace → escape → block-anchor → fuzzy-block → multi-fuzzy
- Strategy ordering: verify earlier strategies tried first, fallback only when needed
- Real-world: editing imports, function bodies, reformatted code
- replaceAll mode: replaces all + returns count; error when not found
- Single replace: error when multiple matches without replaceAll

### 11. `tests/integration/repl-permission-flow.test.ts` (~14 tests)

End-to-end REPL permission flow:

- Normal mode: ReadOnly auto, WriteFiles prompts
- "yes" → re-execute + continue; "no" → deny + stop
- Subsequent calls auto-approved after grant
- Multi-tool batch: partial prompt, grant/deny handling
- Yolo mode: no prompts at all
- Auto mode: read-only auto, write prompts
- `/new` clears permission state
- Thinking effort change persists

### 12. `tests/unit/tools/patch-apply-business.test.ts` (~12 tests)

- Special characters in context lines
- CRLF line endings
- Empty file patch
- Multiple non-adjacent hunks
- Context mismatch → graceful error
- Create file in nested dir
- Multi-file patch (add + update + delete)
- Long lines (10K+)
- Whitespace differences
- Empty patch → error

## Files to Create/Modify

| File | Action |
|------|--------|
| `tests/helpers/memory-helpers.ts` | Create |
| `tests/helpers/repl-helpers.ts` | Create |
| `tests/unit/cli/commands-business.test.ts` | Create |
| `tests/unit/core/tool-permission-flow.test.ts` | Create |
| `tests/unit/memory/memory-manager-logic.test.ts` | Create |
| `tests/integration/memory-pipeline.test.ts` | Create |
| `tests/unit/adapters/adapter-utils-business.test.ts` | Create |
| `tests/unit/adapters/anthropic-streaming.test.ts` | Create |
| `tests/unit/adapters/ollama-streaming.test.ts` | Create |
| `tests/unit/tools/edit-strategy-chain.test.ts` | Create |
| `tests/integration/repl-permission-flow.test.ts` | Create |
| `tests/unit/tools/patch-apply-business.test.ts` | Create |

**Total: ~176 new tests**

## Key Principles

1. **Real stores, not mocks**: Use real `MemoryFileStore` with temp dirs, real `MemoryManager`, real `ToolRegistry`
2. **Mock only externals**: Anthropic SDK, fetch, mem0 API — never mock internal modules
3. **Assert business outcomes**: `"Remembered: user-profile"` not `expect(mock).toHaveBeenCalled()`
4. **Test error paths**: Every command/tool should have failure scenario tests

## Verification

After each phase, run: `RTK_DISABLED=1 npx vitest run tests/` — all tests must pass.
After all phases: `npx tsc --noEmit` — zero type errors.
