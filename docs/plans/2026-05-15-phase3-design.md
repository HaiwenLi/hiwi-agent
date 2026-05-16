---
date: 2026-05-15
phase: phase-3
status: draft
scope: uncovered design requirements
sprints: 3
source: gap analysis vs docs/plans/2026-05-13-personal-agent-design.md
---

# Phase 3 Design: Uncovered Design Requirements

Gap analysis comparing implemented code in `src/` against the original design document `docs/plans/2026-05-13-personal-agent-design.md`. Phase 1 (sprints 1-4) built core/memory/skills/CLI+MCP. Phase 2 (sprints A-B) ported tools and system prompt from OpenCode. Phase 3 closes the remaining 15 gaps.

---

## Gap Summary

| # | Requirement | Design Section | Priority | Sprint |
|---|------------|----------------|----------|--------|
| 1 | Auto-extraction | Memory / Auto-extraction | High | C |
| 2 | Session auto-summarization | Memory / Auto-summarization | High | C |
| 3 | Entity linking | Memory / Entity Linking | High | C |
| 4 | Knowledge base tier | Memory / Knowledge Base | Medium | C |
| 5 | User profile injection | Memory / Context Injection | Medium | C |
| 6 | SSE transport for MCP | MCP / Transport | High | D |
| 7 | Provider connection testing | Adapters / Connection Testing | High | D |
| 8 | Built-in skills (paper-search, code-review) | Skills / Built-in Skills | Medium | D |
| 9 | Streaming TUI display | CLI / TUI | Medium | D |
| 10 | Workflow & meta skills | Skills / Skill Types | Lower | E |
| 11 | Skill sharing (export/import) | Skills / Skill Lifecycle | Lower | E |
| 12 | Academic search tools (Semantic Scholar, arXiv) | Tools / Academic | Lower | E |
| 13 | Dedicated Zhipu/GLM adapter | Adapters / Providers | Lower | E |
| 14 | Dedicated MiniMax adapter | Adapters / Providers | Lower | E |
| 15 | Git operations tool | Tools / Git | Lower | E |

---

## Sprint C: Memory Intelligence

Closes 5 gaps in the memory system. These are the highest-impact missing features — the design promises an intelligent memory system that learns from conversations, not just manual `/remember` commands.

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](phase3-sprintC/task-01-auto-extraction.md) | `src/memory/auto-extract.ts` | LLM-driven fact extraction after each turn | ~200 |
| [02](phase3-sprintC/task-02-session-summary.md) | `src/memory/session-summary.ts` | Auto-generate session summaries on exit | ~150 |
| [03](phase3-sprintC/task-03-entity-linking.md) | `src/memory/entity-link.ts` | Cross-reference memories about same entities | ~200 |
| [04](phase3-sprintC/task-04-knowledge-base.md) | `src/memory/knowledge-base.ts` | Knowledge base memory tier + prompt injection | ~120 |
| [05](phase3-sprintC/task-05-user-profile.md) | `src/memory/user-profile.ts`, `src/core/prompt/assembler.ts` | user-profile.md creation + system prompt injection | ~100 |
| [06](phase3-sprintC/task-06-wiring.md) | `src/memory/manager.ts`, `src/core/agent.ts` | Wire new memory features into agent loop | ~60 |

### Dependencies

- Requires Sprint 2 (memory system) and Phase 2 Sprint A (system prompt assembler)
- Auto-extraction needs LLM call → depends on adapter system (Sprint 1)
- Entity linking needs mem0 vector search → depends on Mem0Client (Sprint 2)

### New Dependencies

None expected. Uses existing LLM adapter for auto-extraction.

---

## Sprint D: MCP Completion & Integration

Closes 4 gaps — SSE transport, provider testing, built-in skills, and TUI streaming.

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](phase3-sprintD/task-01-sse-transport.md) | `src/mcp/sse-transport.ts`, `src/mcp/server.ts` | SSE transport for MCP server | ~200 |
| [02](phase3-sprintD/task-02-connection-test.md) | `src/adapters/connection-test.ts`, `src/cli/commands.ts` | Provider connectivity testing + `/test` command | ~100 |
| [03](phase3-sprintD/task-03-builtin-skills.md) | `skills/paper-search/SKILL.md`, `skills/code-review/SKILL.md` | Paper search and code review built-in skills | ~80 |
| [04](phase3-sprintD/task-04-streaming-tui.md) | `src/cli/app.tsx` | Token-by-token streaming display in Ink TUI | ~150 |

### Dependencies

- SSE transport requires existing MCP server (Sprint 4)
- Built-in skills require skill loader (Sprint 3)
- Streaming TUI requires Ink dependency (already in project)

---

## Sprint E: Advanced Features

Closes 6 lower-priority gaps. These are nice-to-have features that round out the design but aren't blocking for daily use.

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](phase3-sprintE/task-01-workflow-meta-skills.md) | `src/skills/composer.ts`, `src/skills/meta-executor.ts` | Workflow skill composition + meta skill support | ~250 |
| [02](phase3-sprintE/task-02-skill-sharing.md) | `src/skills/packager.ts`, `src/skills/importer.ts` | Skill export/import (SKILL.md bundling) | ~200 |
| [03](phase3-sprintE/task-03-academic-search.md) | `src/tools/academic-search.ts` | Semantic Scholar + arXiv search | ~200 |
| [04](phase3-sprintE/task-04-zhipu-adapter.md) | `src/adapters/zhipu.ts` | Zhipu/GLM-specific adapter | ~150 |
| [05](phase3-sprintE/task-05-minimax-adapter.md) | `src/adapters/minimax.ts` | MiniMax-specific adapter | ~150 |
| [06](phase3-sprintE/task-06-git-tool.md) | `src/tools/git.ts` | Git operations tool (status, diff, log, commit) | ~200 |

### Dependencies

- Workflow/meta skills require skill executor (Sprint 3)
- Academic search needs HTTP client (native fetch or existing dep)
- Provider adapters build on existing OpenAI-compat pattern

### New Dependencies

| Package | Used by | Why |
|---------|---------|-----|
| None required | — | All can be built with existing deps |

---

## Reference

### Original Design
- `docs/plans/2026-05-13-personal-agent-design.md` — Source of truth for all requirements

### Implemented Code
- `src/memory/manager.ts` — Current memory manager (add auto-extraction here)
- `src/memory/session.ts` — Session store (add summarization here)
- `src/core/agent.ts` — Agent loop (add post-turn extraction hook)
- `src/core/prompt/assembler.ts` — Prompt assembly (add user-profile injection)
- `src/mcp/server.ts` — MCP server (add SSE transport)
- `src/cli/app.tsx` — Ink TUI (add streaming display)
- `src/cli/commands.ts` — REPL commands (add /test)
- `src/adapters/openai-compat.ts` — Reference adapter pattern
- `src/skills/executor.ts` — Skill execution (extend for workflow/meta)
