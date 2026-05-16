# Task 05: User Profile

**Files:**
- Create: `src/memory/user-profile.ts`
- Modify: `src/core/prompt/assembler.ts`
- Create: `tests/unit/memory/user-profile.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Memory / Context Injection Strategy

## Goal

Create and maintain a `user-profile.md` file that captures who the user is — role, expertise, preferences, and communication style. This is always injected into the system prompt so the agent can tailor responses.

## Interface

```typescript
// src/memory/user-profile.ts

export interface UserProfile {
  role?: string;             // e.g., "Senior backend engineer"
  expertise: string[];       // e.g., ["Go", "TypeScript", "distributed systems"]
  preferences: string[];     // e.g., ["terse explanations", "no comments in code"]
  communicationStyle?: string; // e.g., "Direct, no fluff"
}

export class UserProfileManager {
  constructor(private memoryStore: MemoryFileStore) {}

  async getProfile(): Promise<Result<UserProfile, Error>>;
  async updateProfile(updates: Partial<UserProfile>): Promise<Result<void, Error>>;
  async buildFromMemories(): Promise<Result<UserProfile, Error>>;
  async toMarkdown(): Promise<Result<string, Error>>;
}
```

## Behavior

1. On first run, create a minimal `user-profile.md` via auto-extraction (watching for self-descriptive statements)
2. User can manually edit `user-profile.md` at any time
3. `buildFromMemories()`: Auto-generate profile from existing memories (auto-extracted facts about the user)
4. Always loaded and injected into system prompt (after MEMORY.md, before skill descriptions)

## Profile File Format

```markdown
---
type: user-profile
name: user-profile
---

## Role
Senior backend engineer

## Expertise
- Go (10 years), TypeScript (3 years)
- Distributed systems, event-driven architecture

## Preferences
- Terse explanations, no fluff
- No comments in code unless non-obvious
- Prefer composition over inheritance
```

## Integration Points

- `src/core/prompt/assembler.ts` — inject `user-profile.md` content after MEMORY.md
- `src/memory/auto-extract.ts` — flag self-descriptive facts for profile building
- `src/cli/commands.ts` — `/profile` command to view/edit profile

## Edge Cases

- No profile file yet → skip injection, no error
- Malformed profile → parse what's possible, log warning
- Empty profile → prompt user to set role on first session

## Tests

- Create user profile from scratch
- Update profile with partial changes
- Generate profile from existing memories
- Convert profile to markdown for prompt injection
- Handle missing profile gracefully
- Handle malformed profile (partial parse)
