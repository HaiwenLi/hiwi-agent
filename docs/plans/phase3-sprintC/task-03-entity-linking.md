# Task 03: Entity Linking

**Files:**
- Create: `src/memory/entity-link.ts`
- Create: `tests/unit/memory/entity-link.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Memory / Entity Linking

## Goal

Cross-reference memories that mention the same entities (projects, technologies, people, concepts). When recalling memories, also return related memories that share entities.

## Interface

```typescript
// src/memory/entity-link.ts

export interface Entity {
  name: string;
  type: "project" | "technology" | "person" | "concept" | "tool" | "file";
  aliases: string[];     // Alternative names (e.g., "TS" for "TypeScript")
}

export interface LinkedMemories {
  primary: MemoryEntry[];
  related: Array<{
    memory: MemoryEntry;
    sharedEntities: string[];
    relevanceScore: number;
  }>;
}

export class EntityLinker {
  constructor(private memoryStore: MemoryFileStore) {}

  async extractEntities(text: string): Promise<Entity[]>;
  async link(memoryName: string): Promise<LinkedMemories>;
  async findByEntity(entityName: string): Promise<MemoryEntry[]>;
}
```

## Behavior

1. **Entity extraction**: Parse memory content for named entities using heuristics + LLM
   - Heuristics: capitalized words, paths (src/foo.ts), known tech terms
   - LLM fallback for ambiguous cases
2. **Entity indexing**: Maintain an entity → memory mapping (stored as `entities.json` in memory dir)
3. **Linking**: Given a memory, find all other memories sharing at least one entity
4. **Alias resolution**: "React" matches "react.js", "ReactJS"; "TS" matches "TypeScript"

## Entity Index Format

```json
// ~/.hiwi-agent/memory/entities.json
{
  "TypeScript": {
    "type": "technology",
    "aliases": ["TS", "ts"],
    "memories": ["decision-typescript-toolchain", "preference-typing-style"]
  },
  "agent-design": {
    "type": "project",
    "aliases": [],
    "memories": ["project-agent-design-overview", "decision-modular-monolith"]
  }
}
```

## Integration Points

- `src/memory/manager.ts` — update entity index on `remember()` and `forget()`
- `src/memory/manager.ts` — `recall()` returns linked memories alongside primary results
- `src/memory/auto-extract.ts` — extract entities alongside facts (task-01)

## Edge Cases

- Ambiguous entity names ("Python" the language vs "Python" the project) → disambiguate by context
- Entity index corruption → rebuild from memory files
- Large entity index → paginate or limit search scope

## Tests

- Extract entities from a technical memory entry
- Resolve aliases (TS → TypeScript)
- Find related memories via shared entities
- Update entity index on remember/forget
- Handle entity index corruption (rebuild)
- Return empty results for unknown entities
