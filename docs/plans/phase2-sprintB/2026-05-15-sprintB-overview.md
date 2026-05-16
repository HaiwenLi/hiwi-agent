---
date: 2026-05-15
phase: phase-2-sprint-B
status: implementation-plan
scope: extra tools
tasks: 8
parent: docs/plans/2026-05-15-phase2-design.md
---

# Sprint B Implementation Plan: Extra Tools

7 tools ported from OpenCode, rewritten in hiwi-agent's Promise-based style (no Effect dependency).

---

## Task Index

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](task-01-apply-patch.md) | `src/tools/apply-patch.ts`, `src/tools/patch/*.ts` | Unified diff patches, add/update/delete/move files | ~450 |
| [02](task-02-web-fetch.md) | `src/tools/web-fetch.ts` | URL fetching, HTML→markdown conversion | ~150 |
| [03](task-03-web-search.md) | `src/tools/web-search.ts` | Web search via Exa/Parallel MCP APIs | ~200 |
| [04](task-04-repo-overview.md) | `src/tools/repo-overview.ts` | Ecosystem detection, project structure tree | ~200 |
| [05](task-05-question.md) | `src/tools/question.ts` | Ask user multi-choice questions via callback | ~100 |
| [06](task-06-todo.md) | `src/tools/todo.ts` | Session task tracking | ~80 |
| [07](task-07-lsp.md) | `src/tools/lsp.ts` | Go-to-def, references, hover, symbols via LSP client | ~250 |
| [08](task-08-wiring.md) | `src/tools/index.ts`, `src/cli/repl.ts` | Sprint B registration + integration | ~30 |

## Execution Order

Tasks 01-06 are independent (can be parallelized). Task 07 (LSP) is independent but heaviest. Task 08 wires everything.

```
01 (apply-patch) ─┐
02 (web-fetch)  ─┤
03 (web-search) ─┤
04 (repo-overview)─┤─→ 08 (wiring)
05 (question)   ─┤
06 (todo)       ─┤
07 (lsp)        ─┘
```

## New Dependencies

| Package | Used by | Why |
|---------|---------|-----|
| `turndown` | web-fetch | HTML→Markdown conversion |
| `node-fetch` or native `fetch` | web-fetch, web-search | HTTP requests (Node 18+ has native fetch) |

No other new runtime deps. Patch parser implemented inline. LSP client is a thin JSON-RPC wrapper over stdio.

## Test Strategy

- TDD: write test first, verify fail, implement, verify pass
- Mock filesystem with `os.tmpdir()` + cleanup in `afterEach`
- Mock HTTP with nock or MSW for web-fetch/web-search
- Mock LSP server with a simple stdio subprocess for lsp tool
- Coverage target: 80%+

## Reference Files

### OpenCode Sources
- `D:\repos\opencode\packages\opencode\src\tool\apply_patch.ts` — Apply patch tool
- `D:\repos\opencode\packages\opencode\src\patch\index.ts` — Patch parser
- `D:\repos\opencode\packages\opencode\src\tool\webfetch.ts` — Web fetch tool
- `D:\repos\opencode\packages\opencode\src\tool\websearch.ts` — Web search tool
- `D:\repos\opencode\packages\opencode\src\tool\mcp-websearch.ts` — MCP search provider
- `D:\repos\opencode\packages\opencode\src\tool\repo_overview.ts` — Repo overview tool
- `D:\repos\opencode\packages\opencode\src\tool\question.ts` — Question tool
- `D:\repos\opencode\packages\opencode\src\tool\todo.ts` — Todo tool
- `D:\repos\opencode\packages\opencode\src\tool\lsp.ts` — LSP tool

### hiwi-agent (from Sprint A)
- `src/types.ts` — Tool, ToolContext, ToolResult interfaces
- `src/core/tools.ts` — ToolRegistry
- `src/tools/index.ts` — registerCoreTools
- `src/core/prompt/assembler.ts` — Prompt assembly
