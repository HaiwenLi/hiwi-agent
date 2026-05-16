# Sprint A: Core 6 Tools + System Prompt — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 6 core file/shell tools (read, write, edit, glob, grep, bash) with truncation service and dynamic system prompt assembly, ported from OpenCode in hiwi-agent's Promise-based style.

**Architecture:** Each tool implements the existing `Tool` interface from `src/types.ts`. Tools are pure functions wrapped in the Tool interface shape. System prompt is assembled from layers (provider prompt + environment + .hiwi-rules + MEMORY.md). No new runtime dependencies.

**Tech Stack:** TypeScript, Node.js fs/child_process, Vitest, Zod

---

## Type Changes

`ToolContext` and `ToolResult` get new optional fields (backward compatible). See `task-01-types.md`.

## Task Index

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](task-01-types.md) | `src/types.ts` | Extend ToolContext + ToolResult | ~15 |
| [02](task-02-truncation.md) | `src/tools/truncation.ts` | Output truncation service | ~120 |
| [03](task-03-read.md) | `src/tools/read.ts` | File/directory reading tool | ~200 |
| [04](task-04-write.md) | `src/tools/write.ts` | File writing tool | ~80 |
| [05](task-05-glob.md) | `src/tools/glob.ts` | Pattern matching tool | ~80 |
| [06](task-06-grep.md) | `src/tools/grep.ts` | Regex content search tool | ~120 |
| [07](task-07-bash.md) | `src/tools/bash.ts` | Shell command execution tool | ~300 |
| [08](task-08-edit-strategies.md) | `src/tools/edit/*.ts` | 9 edit matching strategies | ~300 |
| [09](task-09-edit.md) | `src/tools/edit.ts` | Edit tool with fallback chain | ~200 |
| [10](task-10-prompt-base.md) | `src/core/prompt/*.txt` | Provider prompt template files | ~300 |
| [11](task-11-prompt-env.md) | `src/core/prompt/environment.ts` | Environment context injection | ~60 |
| [12](task-12-prompt-assembler.md) | `src/core/prompt/assembler.ts` | Dynamic prompt assembly | ~80 |
| [13](task-13-config.md) | `src/core/config.ts` | System prompt config additions | ~15 |
| [14](task-14-wiring.md) | `src/cli/repl.ts`, `src/core/agent.ts` | Integration wiring | ~40 |

## Execution Order

Tasks 01-02 are foundations. Tasks 03-07 are independent tools (can be parallelized). Task 08-09 depend on 03-04 patterns. Tasks 10-12 are independent of tools. Task 13-14 wire everything.

```
01 (types) → 02 (truncation) → 03-07 (tools, parallel) → 08-09 (edit)
                                                          ↓
                                         10-12 (prompt, parallel) → 13 (config) → 14 (wiring)
```

## Test Strategy

- TDD: write test first, verify fail, implement, verify pass
- Mock filesystem with `os.tmpdir()` + cleanup in `afterEach`
- Mock `child_process.spawn` for bash tool
- Snapshot tests for prompt assembly
- Coverage target: 80%+

## Dependencies

No new runtime dependencies. Levenshtein distance implemented inline (~30 lines).

## Reference Files

- OpenCode tools: `D:\repos\opencode\packages\opencode\src\tool\*.ts`
- OpenCode prompts: `D:\repos\opencode\packages\opencode\src\agent\prompt\*.txt`
- hiwi-agent types: `src/types.ts`
- hiwi-agent registry: `src/core/tools.ts`
- hiwi-agent agent loop: `src/core/agent.ts`
