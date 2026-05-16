# Task 04: Knowledge Base Memory Tier

**Files:**
- Create: `src/memory/knowledge-base.ts`
- Create: `tests/unit/memory/knowledge-base.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Memory / Knowledge Base

## Goal

Add a "knowledge" memory tier for accumulated domain knowledge and patterns. Unlike project memory (project-specific) or session memory (ephemeral), knowledge is cross-project, persistent, and represents things the user has learned or patterns they want to remember.

## Interface

```typescript
// src/memory/knowledge-base.ts

export interface KnowledgeEntry {
  name: string;
  domain: string;          // e.g., "typescript", "react", "devops", "databases"
  pattern: string;         // The knowledge pattern or rule
  examples?: string[];     // Concrete examples
  sources?: string[];      // Where this knowledge came from
  confidence: number;      // How well-established this knowledge is
}

export class KnowledgeBase {
  constructor(private memoryStore: MemoryFileStore) {}

  async add(entry: Omit<KnowledgeEntry, "confidence">): Promise<Result<string, Error>>;
  async search(query: string, domain?: string): Promise<Result<KnowledgeEntry[], Error>>;
  async getByDomain(domain: string): Promise<Result<KnowledgeEntry[], Error>>;
  async injectContext(query: string): Promise<Result<string, Error>>;
}
```

## Behavior

1. Knowledge entries stored as memory files with type: `knowledge`
2. Domain-tagged for scoped retrieval
3. `injectContext()`: Given a user query, find relevant knowledge and return formatted text for system prompt injection
4. Auto-promotion: Frequently recalled auto-extracted facts (confidence > 0.9 across sessions) can be promoted to knowledge

## System Prompt Injection

```typescript
// In prompt assembler, after MEMORY.md:
if (relevantKnowledge.length > 0) {
  prompt += "\n\n## Relevant Knowledge\n";
  for (const k of relevantKnowledge) {
    prompt += `- [${k.domain}] ${k.pattern}\n`;
  }
}
```

## Integration Points

- `src/memory/manager.ts` — add `knowledge` as a supported memory type
- `src/core/prompt/assembler.ts` — inject relevant knowledge into system prompt
- `src/cli/commands.ts` — `/knowledge` command to browse/search knowledge

## Edge Cases

- Duplicate knowledge entries → merge with higher confidence
- Large knowledge base → limit injection to top-K relevant entries (default: 5)
- Domain with no entries → empty result, no error

## Tests

- Add a knowledge entry and retrieve it
- Search knowledge by query with semantic matching
- Filter knowledge by domain
- Inject relevant knowledge into prompt context
- Limit injection to top-K entries
- Handle duplicate entries (merge)
