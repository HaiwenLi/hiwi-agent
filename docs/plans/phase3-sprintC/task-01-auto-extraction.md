# Task 01: Auto-Extraction

**Files:**
- Create: `src/memory/auto-extract.ts`
- Create: `tests/unit/memory/auto-extract.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Memory / Auto-extraction

## Goal

After each assistant turn, automatically extract memorable facts from the conversation using an LLM call. Extracted facts are stored as memory entries (type: `auto`) in the file store.

## Interface

```typescript
// src/memory/auto-extract.ts

export interface ExtractedFact {
  content: string;       // The factual statement
  category: "preference" | "decision" | "fact" | "context" | "correction";
  confidence: number;    // 0-1, only store above threshold (default 0.7)
  entities: string[];    // Named entities referenced
}

export interface AutoExtractorOptions {
  minTurns: number;      // Don't extract until N turns exist (default: 2)
  maxFactsPerTurn: number; // Cap extractions per turn (default: 3)
  confidenceThreshold: number; // Min confidence to store (default: 0.7)
}

export class AutoExtractor {
  constructor(
    private llm: ModelAdapter,
    private memoryStore: MemoryFileStore,
    private options?: Partial<AutoExtractorOptions>,
  ) {}

  async extract(messages: Message[]): Promise<ExtractedFact[]>;
  async storeFacts(facts: ExtractedFact[]): Promise<void>;
}
```

## Behavior

1. Called after each assistant turn in the agent loop (hooked via task-06 wiring)
2. Takes the last user+assistant message pair
3. Sends to LLM with extraction prompt: "Extract memorable facts from this conversation turn"
4. LLM returns structured JSON with facts, categories, confidence scores
5. Facts above confidence threshold are stored as memory entries (type: `auto`)
6. Deduplication: check if similar fact already exists before storing

## Extraction Prompt

```
Analyze this conversation turn and extract any memorable facts worth preserving for future sessions.
Focus on: user preferences, technical decisions, corrections to previous knowledge, project context.
Return a JSON array of objects with: content (string), category (preference|decision|fact|context|correction), confidence (0-1), entities (string[]).
If nothing memorable, return an empty array.
```

## Edge Cases

- Short/greeting messages → no extraction
- Repetitive facts → dedup by content similarity
- LLM extraction failure → silent skip, don't break agent loop
- Rate limiting → extract only every N turns (configurable)

## Tests

- Extract facts from a coding conversation turn
- Skip extraction on greeting/short messages
- Deduplicate similar facts
- Respect confidence threshold
- Handle LLM failure gracefully (no crash)
- Respect maxFactsPerTurn limit
