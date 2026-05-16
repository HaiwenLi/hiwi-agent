---
date: 2026-05-15
phase: phase-3-sprint-D
status: draft
scope: MCP completion & integration
tasks: 4
parent: docs/plans/2026-05-15-phase3-design.md
---

# Sprint D Implementation Plan: MCP Completion & Integration

Closes 4 gaps — SSE transport for MCP, provider connection testing, built-in skills, and streaming TUI display.

---

## Task Index

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](task-01-sse-transport.md) | `src/mcp/sse-transport.ts`, `src/mcp/server.ts` | SSE transport for MCP server | ~200 |
| [02](task-02-connection-test.md) | `src/adapters/connection-test.ts`, `src/cli/commands.ts` | Provider connectivity testing + `/test` command | ~100 |
| [03](task-03-builtin-skills.md) | `skills/paper-search/SKILL.md`, `skills/code-review/SKILL.md` | Paper search and code review built-in skills | ~80 |
| [04](task-04-streaming-tui.md) | `src/cli/app.tsx` | Token-by-token streaming display in Ink TUI | ~150 |

## Execution Order

All 4 tasks are independent and can be parallelized.

```
01 (sse-transport) ──┐
02 (connection-test)──┤
03 (builtin-skills) ──┤
04 (streaming-tui)  ──┘
```

## New Dependencies

None expected.

## Test Strategy

- TDD: write tests first, then implement
- SSE transport: test with HTTP client against local server
- Connection testing: mock adapter responses
- Built-in skills: test skill loader discovers them
- Streaming TUI: test output rendering with mock stream
- Coverage target: 80%+
