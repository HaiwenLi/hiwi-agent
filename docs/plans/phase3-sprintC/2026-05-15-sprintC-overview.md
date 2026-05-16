---
date: 2026-05-15
phase: phase-3-sprint-C
status: draft
scope: memory intelligence
tasks: 6
parent: docs/plans/2026-05-15-phase3-design.md
---

# Sprint C Implementation Plan: Memory Intelligence

Closes 5 memory gaps from the original design. The design promises an intelligent memory system that learns from conversations — auto-extracting facts, linking entities, summarizing sessions, and building a knowledge base. Currently only manual `/remember` exists.

---

## Task Index

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](task-01-auto-extraction.md) | `src/memory/auto-extract.ts` | LLM-driven fact extraction after each assistant turn | ~200 |
| [02](task-02-session-summary.md) | `src/memory/session-summary.ts` | Auto-generate session summaries on exit | ~150 |
| [03](task-03-entity-linking.md) | `src/memory/entity-link.ts` | Cross-reference memories about same entities | ~200 |
| [04](task-04-knowledge-base.md) | `src/memory/knowledge-base.ts` | Knowledge base memory tier + prompt injection | ~120 |
| [05](task-05-user-profile.md) | `src/memory/user-profile.ts` | user-profile.md creation + system prompt injection | ~100 |
| [06](task-06-wiring.md) | `src/memory/manager.ts`, `src/core/agent.ts` | Wire all features into agent loop | ~60 |

## Execution Order

Tasks 01-03 are independent. Task 04 depends on entity linking (03). Task 05 is independent. Task 06 wires everything.

```
01 (auto-extract) ──┐
02 (session-sum)  ──┤
03 (entity-link)  ──┤──→ 04 (knowledge-base) ──┐
05 (user-profile) ──┤                            ├─→ 06 (wiring)
                    └────────────────────────────┘
```

## New Dependencies

None. Uses existing LLM adapter for auto-extraction prompts.

## Test Strategy

- TDD: write tests first, then implement
- Mock LLM calls with MockAdapter for auto-extraction tests
- Mock filesystem with temp directories
- Integration test: full agent loop turn triggers auto-extraction
- Coverage target: 80%+
