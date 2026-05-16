---
date: 2026-05-15
phase: phase-2-sprint-B
status: implementation-plan
scope: extra tools
tasks: 8
parent: docs/plans/2026-05-15-phase2-design.md
---

# Sprint B Implementation Plan: Extra Tools

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port 7 extra tools from OpenCode (apply_patch, web_fetch, web_search, repo_overview, question, todo, lsp) and wire them into hiwi-agent's ToolRegistry.

**Architecture:** Each tool follows hiwi-agent's `Tool` interface (Promise-based `execute`, no Effect). Complex tools (apply_patch, lsp) are split into sub-modules under `src/tools/`. All tools share the same registration pattern via `ToolRegistry.register()`. New dependencies: `turndown` only.

**Tech Stack:** TypeScript, Node.js 18+ (native fetch), vitest, turndown (HTML→Markdown)

---

## Task Index

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](phase2-sprintB/task-01-apply-patch.md) | `src/tools/apply-patch.ts`, `src/tools/patch/*.ts` | Unified diff patches — parser, 4-strategy matching, add/update/delete/move | ~450 |
| [02](phase2-sprintB/task-02-web-fetch.md) | `src/tools/web-fetch.ts` | URL fetching, HTML→markdown (turndown), 5MB limit, timeout | ~150 |
| [03](phase2-sprintB/task-03-web-search.md) | `src/tools/web-search.ts` | Web search via Exa API, configurable URL/key via env | ~200 |
| [04](phase2-sprintB/task-04-repo-overview.md) | `src/tools/repo-overview.ts` | Ecosystem detection (Node/Python/Go/Rust/…), directory tree | ~200 |
| [05](phase2-sprintB/task-05-question.md) | `src/tools/question.ts`, `src/types.ts` | Ask user multi-choice questions via `askUserQuestions` callback | ~100 |
| [06](phase2-sprintB/task-06-todo.md) | `src/tools/todo.ts`, `src/core/todo-store.ts` | Session-scoped task tracking with in-memory store | ~80 |
| [07](phase2-sprintB/task-07-lsp.md) | `src/tools/lsp.ts`, `src/tools/lsp/*.ts` | LSP client over stdio JSON-RPC — go-to-def, references, hover, symbols | ~250 |
| [08](phase2-sprintB/task-08-wiring.md) | `src/tools/index.ts`, `src/cli/repl.ts` | Sprint B registration + integration | ~30 |

## Execution Order

Tasks 01–07 are independent (can be parallelized). Task 08 wires everything.

```
01 (apply-patch) ─┐
02 (web-fetch)  ─┤
03 (web-search) ─┤
04 (repo-overview)─┤
05 (question)   ─┤─→ 08 (wiring)
06 (todo)       ─┤
07 (lsp)        ─┘
```

## New Dependencies

| Package | Used by | Why |
|---------|---------|-----|
| `turndown` | web-fetch | HTML→Markdown conversion |

No other new runtime deps. Patch parser implemented inline. LSP client is a thin JSON-RPC wrapper over stdio.

## Test Strategy

- TDD: write test first, verify fail, implement, verify pass
- Mock filesystem with `os.tmpdir()` + cleanup in `afterEach`
- Mock HTTP with `vi.stubGlobal("fetch", ...)` for web-fetch/web-search
- LSP client tested at message-framing level (no live server needed for unit tests)
- Integration test for wiring verifies all 13 tools register without conflict
- Coverage target: 80%+

## Reference Files

### OpenCode Sources
- `D:\repos\opencode\packages\opencode\src\tool\apply_patch.ts` — Apply patch tool
- `D:\repos\opencode\packages\opencode\src\patch\index.ts` — Patch parser
- `D:\repos\opencode\packages\opencode\src\tool\webfetch.ts` — Web fetch tool
- `D:\repos\opencode\packages\opencode\src\tool\websearch.ts` — Web search tool
- `D:\repos\opencode\packages\opencode\src\tool\repo_overview.ts` — Repo overview tool
- `D:\repos\opencode\packages\opencode\src\tool\question.ts` — Question tool
- `D:\repos\opencode\packages\opencode\src\tool\todo.ts` — Todo tool
- `D:\repos\opencode\packages\opencode\src\tool\lsp.ts` — LSP tool

### hiwi-agent (from Sprint A)
- `src/types.ts` — Tool, ToolContext, ToolResult, QuestionPrompt interfaces
- `src/core/tools.ts` — ToolRegistry
- `src/tools/index.ts` — registerCoreTools + registerExtraTools
