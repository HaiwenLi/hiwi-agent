---
date: 2026-05-14
phase: design-complete
status: ready-to-implement
next: generate TDD implementation plan, then start Sprint 1 coding
---

# Ready to Implement Checkpoint

**All design decisions are closed.** This checkpoint captures the full state for the next session to begin coding.

## Project: hiwi-agent

TypeScript CLI agent with persistent memory, multi-model support, reusable skills, and MCP server mode.

## Key Files

| File | Content |
|------|---------|
| `docs/plans/2026-05-13-personal-agent-design.md` | Full architecture design (v1.0, approved) |
| `docs/plans/checkpoint-2026-05-13-implementation-planning.md` | ALL decisions in one place — toolchain, testing, DI, naming, CI/CD, agent loop design, supplementary decisions |

## Decision Summary (quick ref)

### Architecture
- Modular Monolith, TypeScript + Node.js LTS, pnpm/tsup/Biome
- DI: Manual composition (no framework), Error: neverthrow
- Package name: `hiwi-agent`

### Agent Loop (while-loop)
- Hybrid tool execution: read parallel, write serial, conflict detection
- Streaming + interruptible (Ctrl+C preserves output tokens)
- Budget refund for low-cost tools (read_file, glob, grep)
- Max loops (50) + max output tokens per turn
- Empty response: retry once + nudge

### Providers (7)
- Anthropic (`@anthropic-ai/sdk`), OpenAI (`openai`), Ollama (HTTP)
- OpenAI-compatible covers: DeepSeek, Zhipu, Kimi, MiniMax

### Memory
- Hybrid: MEMORY.md (index, <200 lines) + mem0 (self-hosted Docker)
- MEMORY.md full text injected into system prompt
- Project memory auto-loaded when in project directory
- Search: merge mem0 + MEMORY.md results, deduplicate

### Context Compaction (OpenCode approach)
- Trigger: token >= context_limit - max_output - 20K reserved
- Phase 1: prune (truncate old tool outputs >2K chars)
- Phase 2: summarize (keep last 2 turns verbatim, LLM compresses older into structured summary)
- Incremental: new summary updates old, not from scratch

### Session (SQLite, project-level)
- Location: `<project>/.agent/session.db`
- Driver: better-sqlite3, raw SQL, no ORM
- Tables: sessions, messages, summaries
- Recovery: workspace-bound, auto-detect + /resume prompt
- No auto-cleanup

### Config
- Global: `~/.hiwi-agent/config.json`
- Project: `<project>/.agent/config.json`
- Priority: env > project > global
- No hot-reload, prompt restart on change

### Skills (SKILL.md)
- Inject into system prompt, run standard Agent Loop
- Inherit permission mode, no independent permissions
- Failure: abort skill, show error, fallback to normal chat

### Permission
- Normal: ask once per tool type, remember for session
- Allowlist: persisted in global Memory
- YOLO: `/yolo` command with confirmation

### Logging
- `~/.hiwi-agent/logs/`, JSON structured, default info
- `--debug` flag for debug level

### Testing
- Vitest + Cucumber, TDD+BDD, 80%+ coverage
- LLM mock: fixed fixture adapter, no real API calls
- Ollama adapter in Sprint 1

## Implementation Order

### Sprint 1: Core Engine + Adapters
1. Project scaffolding (tsconfig, biome, pnpm, vitest, cucumber)
2. `src/core/config.ts` — Config loading with Zod validation
3. `src/adapters/base.ts` — ModelAdapter interface + Tool types
4. `src/adapters/anthropic.ts` — Anthropic adapter
5. `src/adapters/openai-compat.ts` — OpenAI-compatible adapter (covers 5 providers)
6. `src/adapters/ollama.ts` — Ollama adapter
7. `src/adapters/registry.ts` — ProviderRegistry
8. `src/core/tools.ts` — ToolRegistry + permission model
9. `src/core/agent.ts` — Agent loop

### Sprint 2: Memory System
10. `src/memory/file-store.ts` — MEMORY.md index + frontmatter files
11. `src/memory/manager.ts` — Memory orchestrator
12. `src/memory/mem0-client.ts` — mem0 SDK integration
13. `src/memory/compaction.ts` — Context compaction

### Sprint 3: Skills
14. `src/skills/loader.ts` — SKILL.md discovery & parsing
15. `src/skills/registry.ts` — Skill registry
16. `src/skills/executor.ts` — Skill execution engine

### Sprint 4: CLI + MCP
17. `src/cli/commands.ts` — Slash commands
18. `src/cli/app.tsx` — Ink TUI
19. `src/mcp/server.ts` — MCP server (stdio/SSE)
20. `src/mcp/tools.ts` — MCP-exposed tools

## Next Session Actions
1. Invoke `superpowers:writing-plans` skill to generate detailed TDD implementation plan for Sprint 1
2. Create git repo, init project
3. Begin Sprint 1 implementation
