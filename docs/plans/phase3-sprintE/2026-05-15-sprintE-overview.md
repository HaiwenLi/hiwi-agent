---
date: 2026-05-15
phase: phase-3-sprint-E
status: draft
scope: advanced features
tasks: 6
parent: docs/plans/2026-05-15-phase3-design.md
---

# Sprint E Implementation Plan: Advanced Features

Closes 6 lower-priority gaps — workflow/meta skills, skill sharing, academic search, dedicated provider adapters, and git tool.

---

## Task Index

| Task | File | Description | Est. Lines |
|------|------|-------------|------------|
| [01](task-01-workflow-meta-skills.md) | `src/skills/composer.ts`, `src/skills/meta-executor.ts` | Workflow skill composition + meta skill support | ~250 |
| [02](task-02-skill-sharing.md) | `src/skills/packager.ts`, `src/skills/importer.ts` | Skill export/import (SKILL.md bundling) | ~200 |
| [03](task-03-academic-search.md) | `src/tools/academic-search.ts` | Semantic Scholar + arXiv search | ~200 |
| [04](task-04-zhipu-adapter.md) | `src/adapters/zhipu.ts` | Zhipu/GLM-specific adapter | ~150 |
| [05](task-05-minimax-adapter.md) | `src/adapters/minimax.ts` | MiniMax-specific adapter | ~150 |
| [06](task-06-git-tool.md) | `src/tools/git.ts` | Git operations tool | ~200 |

## Execution Order

All tasks are independent.

```
01 (workflow-meta) ──┐
02 (skill-sharing) ──┤
03 (academic)      ──┤
04 (zhipu)         ──┤
05 (minimax)       ──┤
06 (git)           ──┘
```

## New Dependencies

None. All tasks use existing project dependencies.

## Test Strategy

- TDD: write tests first, then implement
- Mock HTTP calls for academic search and provider adapters
- Mock git commands for git tool
- Integration test for skill composition
- Coverage target: 80%+
