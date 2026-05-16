# Task 02: Session Auto-Summarization

**Files:**
- Create: `src/memory/session-summary.ts`
- Create: `tests/unit/memory/session-summary.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Memory / Auto-summarization

## Goal

Automatically generate a structured summary when a session ends. Summaries are stored as memory entries (type: `session`) and include topics discussed, decisions made, and files modified.

## Interface

```typescript
// src/memory/session-summary.ts

export interface SessionSummary {
  date: string;              // ISO date
  topics: string[];          // Main topics discussed
  decisions: string[];       // Decisions reached
  filesModified: string[];   // Files touched during session
  keyInsights: string[];     // Notable findings or learnings
  duration: number;          // Approximate session duration in minutes
}

export class SessionSummarizer {
  constructor(
    private llm: ModelAdapter,
    private memoryStore: MemoryFileStore,
  ) {}

  async summarize(session: Session): Promise<Result<SessionSummary, Error>>;
  async storeSummary(summary: SessionSummary): Promise<Result<string, Error>>;
}
```

## Behavior

1. Triggered when REPL exits (graceful shutdown via `process.on('SIGINT')` or `/exit` command)
2. Takes all messages from current session
3. Sends to LLM with summarization prompt
4. LLM returns structured JSON summary
5. Stored as `session-YYYY-MM-DD-HHMM.md` in memory store

## Summarization Prompt

```
Summarize this coding session. Return JSON with:
- topics: string[] (main topics/areas discussed)
- decisions: string[] (technical decisions made)
- filesModified: string[] (files that were read, edited, or created)
- keyInsights: string[] (notable findings, bugs found, patterns learned)
Keep each item concise (one sentence max).
```

## Integration Points

- `src/cli/repl.ts` — call `summarizer.summarize()` before exit
- `src/cli/commands.ts` — `/exit` and `/quit` commands trigger summarization
- `src/memory/session.ts` — read session messages for summarization input

## Edge Cases

- Very short sessions (< 3 messages) → skip summarization
- LLM failure → store a minimal summary with just message count
- Session already summarized → don't re-summarize

## Tests

- Generate summary from a multi-turn coding session
- Skip summarization for short sessions
- Handle LLM failure gracefully (fallback summary)
- Store summary in correct file format
- Extract file paths from tool calls (read, write, edit)
