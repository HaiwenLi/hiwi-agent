---
date: 2026-05-15
phase: phase-2
status: approved
scope: tools + system prompt (parts B + D)
sprints: 2
next: generate TDD implementation plan for Sprint A
---

# Phase 2 Design: Tools + System Prompt

Built from OpenCode source at `D:\repos\opencode\packages\opencode\src\tool\` and `D:\repos\opencode\packages\opencode\src\session\prompt\`. Tools are ported from OpenCode, rewritten in hiwi-agent's Promise-based style (no Effect dependency).

---

## Decisions

| Decision | Choice |
|----------|--------|
| Scope | Tools (Parts B) + System Prompt (Part D). Providers and TUI deferred. |
| Tool source | Port from OpenCode, rewrite in hiwi-agent's simple Promise style |
| Edit tool | All 9 matching strategies from OpenCode |
| System prompt | Dynamic assembly + `.hiwi-rules` file for user customization |
| Phasing | 2 sprints: Sprint A (core 6 + prompt), Sprint B (extra tools) |
| Provider prompts | 3 variants: Anthropic, GPT, default. Selected by model ID. |

---

## Architecture

### Tool Interface Changes

Existing `Tool` interface stays. Changes to `ToolContext` and `ToolResult`:

```typescript
// src/types.ts additions
interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  abort?: AbortSignal;                                                      // for cancellation
  askPermission?: (req: PermissionRequest) => Promise<boolean>;             // for shell prompts
}

interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  title?: string;                    // human-readable title
  metadata?: Record<string, unknown>; // structured metadata
}
```

### System Prompt — Dynamic Assembly

```
System Prompt = [
  1. Provider-specific base prompt    ← selected by model ID
  2. Environment context              ← working dir, platform, date, git branch
  3. Project instructions             ← .hiwi-rules file (auto-discovered)
  4. MEMORY.md content               ← full text
  5. Skill descriptions              ← injected when skills are active
]
```

Tool descriptions go in JSON Schema (passed to model via tool definitions), NOT in the system prompt.

### Provider Prompt Selection

```typescript
function selectBasePrompt(modelId: string): string {
  if (modelId.includes("claude")) return ANTHROPIC_PROMPT;
  if (modelId.includes("gpt") || modelId.includes("o1") || modelId.includes("o3")) return GPT_PROMPT;
  if (modelId.includes("deepseek") || modelId.includes("glm")) return OPENAI_COMPAT_PROMPT;
  return DEFAULT_PROMPT;
}
```

### File Structure

```
src/tools/
├── read.ts              ← file/dir reading, pagination, binary detection
├── write.ts             ← file writing, BOM handling
├── edit.ts              ← 9 matching strategies with fallback chain
├── glob.ts              ← pattern matching, sorted by mtime
├── grep.ts              ← regex search, file filter
├── bash.ts              ← command execution, timeout, workdir
├── apply-patch.ts       ← unified diff, atomic multi-file (Sprint B)
├── web-fetch.ts         ← URL fetching, markdown conversion (Sprint B)
├── web-search.ts        ← web search via API (Sprint B)
├── repo-overview.ts     ← ecosystem detection, project structure (Sprint B)
├── question.ts          ← ask user multi-choice questions (Sprint B)
├── todo.ts              ← session task tracking (Sprint B)
├── lsp.ts               ← go-to-def, references, hover, symbols (Sprint B)
├── truncation.ts        ← output truncation service
└── edit/                ← edit matching strategies
    ├── simple.ts
    ├── line-trimmed.ts
    ├── block-anchor.ts
    ├── whitespace-norm.ts
    ├── levenshtein.ts
    ├── line-ending-norm.ts
    ├── regex-escape.ts
    ├── fuzzy-block.ts
    └── multi-fuzzy.ts

src/core/prompt/
├── base-anthropic.txt   ← adapted from OpenCode anthropic.txt
├── base-gpt.txt         ← adapted from OpenCode beast.txt/gpt.txt
├── base-default.txt     ← generic fallback
├── assembler.ts         ← dynamic assembly logic
└── environment.ts       ← working dir, platform, date, git status
```

---

## Sprint A: Core 6 Tools + System Prompt

### Tools

| Tool | Source | Key Features | Est. Lines |
|------|--------|-------------|------------|
| `read_file` | OpenCode `read.ts` | File/dir reading, pagination, binary detection, BOM handling | ~200 |
| `write_file` | OpenCode `write.ts` | File writing, BOM handling | ~80 |
| `edit_file` | OpenCode `edit.ts` | 9 matching strategies with fallback chain | ~500 |
| `glob` | OpenCode `glob.ts` | Pattern matching, result limit (100), sorted by mtime | ~80 |
| `grep` | OpenCode `grep.ts` | Regex search, file filter, result limit (100) | ~120 |
| `bash` | OpenCode `shell.ts` | Command execution, timeout, workdir, output truncation | ~300 |
| `truncation` | OpenCode `truncate.ts` | Output truncation service (head/tail), spill-to-disk | ~120 |

### System Prompt

| Component | Source | Description |
|-----------|--------|-------------|
| `base-anthropic.txt` | OpenCode `anthropic.txt` | Claude-optimized coding prompt |
| `base-gpt.txt` | OpenCode `beast.txt` | GPT-optimized coding prompt |
| `base-default.txt` | OpenCode `default.txt` | Generic fallback prompt |
| `assembler.ts` | OpenCode `prompt.ts` | Assembles prompt from layers |
| `environment.ts` | OpenCode `environment()` | Injects platform, working dir, date, git |

### Config Additions

```typescript
systemPrompt: z.object({
  providerVariant: z.enum(["auto", "anthropic", "gpt", "default"]).optional(),
}).optional()
```

### Test Strategy

- TDD: write tests first, then implement
- Mock filesystem with temp directories (no real file mutations)
- Mock child_process for bash tool
- Snapshot tests for prompt assembly output
- Coverage target: 80%+

### Dependencies

No new runtime dependencies. Edit tool's Levenshtein distance can be implemented inline (~30 lines).

---

## Sprint B: Extra Tools

Starts after Sprint A is complete.

| Tool | Source | Key Features | Est. Lines |
|------|--------|-------------|------------|
| `apply_patch` | OpenCode `apply_patch.ts` | Unified diff format, atomic multi-file patches | ~400 |
| `web_fetch` | OpenCode `webfetch.ts` | URL fetching, markdown conversion | ~150 |
| `web_search` | OpenCode `websearch.ts` | Web search via API | ~150 |
| `repo_overview` | OpenCode `repo_overview.ts` | Ecosystem detection, project structure | ~200 |
| `question` | OpenCode `question.ts` | Ask user multi-choice questions | ~100 |
| `todo` | OpenCode `todo.ts` | Session task tracking | ~80 |
| `lsp` | OpenCode `lsp.ts` | Go-to-def, references, hover, symbols | ~300 |

### Not Ported (Deferred)

- `plan.ts` / `task.ts` / `skill.ts` — hiwi-agent has its own skill system
- `repo_clone.ts` — niche, low priority
- `external-directory.ts` — OpenCode-specific

---

## Reference Files

### OpenCode Tools
- `D:\repos\opencode\packages\opencode\src\tool\*.ts` — Tool implementations
- `D:\repos\opencode\packages\opencode\src\tool\*.txt` — Tool descriptions
- `D:\repos\opencode\packages\opencode\src\tool\tool.ts` — Tool interface
- `D:\repos\opencode\packages\opencode\src\tool\registry.ts` — Tool registry
- `D:\repos\opencode\packages\opencode\src\tool\schema.ts` — Schema system

### OpenCode Prompts
- `D:\repos\opencode\packages\opencode\src\session\prompt\` — Session prompts (explore, compaction, etc.)
- `D:\repos\opencode\packages\opencode\src\agent\prompt\` — Agent prompts (default, anthropic, gpt, etc.)
- `D:\repos\opencode\packages\opencode\src\session\prompt.ts` — Prompt assembly logic

### hiwi-agent
- `src/types.ts` — Tool, ToolContext, ToolResult interfaces
- `src/core/tools.ts` — ToolRegistry
- `src/core/agent.ts` — Agent loop
- `src/core/config.ts` — Config schema
- `src/cli/repl.ts` — REPL (will consume tools)
