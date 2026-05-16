# Task 02: Skill Sharing (Export/Import)

**Files:**
- Create: `src/skills/packager.ts`
- Create: `src/skills/importer.ts`
- Create: `tests/unit/skills/packager.test.ts`
- Create: `tests/unit/skills/importer.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Skills / Skill Lifecycle

## Goal

Enable exporting skills as shareable bundles and importing skills from URLs or files. Allows the community to share skills.

## Interface

```typescript
// src/skills/packager.ts

export interface SkillBundle {
  name: string;
  version: string;
  skill: Skill;                // Parsed SKILL.md content
  dependencies?: string[];     // Required tools or other skills
  assets?: Record<string, string>; // Additional files (templates, configs)
}

export class SkillPackager {
  pack(skillName: string): Promise<Result<Buffer, Error>>;
  // Creates a .hiwi-skill.tar.gz bundle from a skill directory
}

// src/skills/importer.ts

export class SkillImporter {
  importFromFile(filePath: string): Promise<Result<Skill, Error>>;
  importFromUrl(url: string): Promise<Result<Skill, Error>>;
  // Validates skill before installing
}
```

## Behavior

### Export (Packager)
1. Read skill directory (SKILL.md + any assets)
2. Validate skill has required frontmatter fields
3. Bundle into a tar.gz archive
4. Include metadata (name, version, checksum)

### Import (Importer)
1. Download/extract skill bundle
2. Validate structure (SKILL.md exists, required fields present)
3. Check for dependency conflicts (required tools available)
4. Install to user's global skills directory
5. Register with SkillRegistry

## Validation Rules

- SKILL.md must have: name, version, type, trigger, description
- trigger must start with `/`
- type must be one of: domain, workflow, meta
- version must be semver

## CLI Integration

```typescript
// Potential future commands:
// /skill-export <name>  → saves .hiwi-skill file
// /skill-import <path>  → installs from file or URL
```

## Edge Cases

- Circular skill dependencies → reject
- Skill name collision → warn and require `--force`
- Corrupted bundle → clear error with validation details
- Network failure during URL import → retry once, then fail

## Tests

- Export a skill to buffer
- Import from file
- Import from URL (mock HTTP)
- Reject invalid skill (missing required fields)
- Handle name collision
- Validate semver version
