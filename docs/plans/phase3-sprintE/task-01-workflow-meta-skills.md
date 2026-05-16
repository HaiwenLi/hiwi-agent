# Task 01: Workflow & Meta Skills

**Files:**
- Create: `src/skills/composer.ts`
- Create: `src/skills/meta-executor.ts`
- Modify: `src/skills/executor.ts`
- Create: `tests/unit/skills/composer.test.ts`
- Create: `tests/unit/skills/meta-executor.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Skills / Skill Types

## Goal

Extend the skill system to support two additional skill types beyond domain skills:
- **Workflow skills**: Compose multiple domain skills into a multi-step pipeline
- **Meta skills**: Skills that operate on the agent itself (manage skills, configure, self-improve)

## Workflow Skills

### Interface

```typescript
// src/skills/composer.ts

export interface WorkflowStep {
  skill: string;           // Trigger of domain skill to invoke
  input?: string;          // Input to pass (can reference previous step output)
  condition?: string;      // Optional condition to skip step
}

export interface WorkflowDefinition {
  steps: WorkflowStep[];
  outputFormat?: string;   // How to combine step outputs
}

export class SkillComposer {
  constructor(private executor: SkillExecutor) {}

  async execute(
    workflow: WorkflowDefinition,
    initialInput: string,
    context: SkillExecuteOptions,
  ): Promise<SkillExecuteResult>;
}
```

### Behavior

1. Parse workflow definition from SKILL.md frontmatter `steps` field
2. Execute steps sequentially, passing output of step N as input to step N+1
3. Skip steps where condition evaluates to false
4. Aggregate all step outputs into final result
5. If any step fails, stop and return partial results

### Workflow SKILL.md Example

```markdown
---
name: research-and-review
type: workflow
trigger: /research-review
steps:
  - skill: /paper
    input: "{query}"
  - skill: /review
    input: "Summarize key findings from: {previous}"
---

# Research and Review

Search papers, then review the findings.
```

## Meta Skills

### Interface

```typescript
// src/skills/meta-executor.ts

export type MetaAction =
  | { type: "list-skills" }
  | { type: "install-skill"; url: string }
  | { type: "remove-skill"; name: string }
  | { type: "configure"; key: string; value: string }
  | { type: "self-improve"; feedback: string };

export class MetaExecutor {
  constructor(
    private skillRegistry: SkillRegistry,
    private skillLoader: SkillLoader,
  ) {}

  async execute(action: MetaAction): Promise<string>;
}
```

### Behavior

1. Meta skills have elevated permissions — they can modify the agent's own configuration
2. `list-skills`: Return all discovered skills with status
3. `install-skill`: Download and install a skill from URL (delegates to task-02 importer)
4. `remove-skill`: Unregister and delete a skill
5. `configure`: Update agent configuration
6. `self-improve`: Analyze conversation history and suggest skill improvements

### Meta SKILL.md Example

```markdown
---
name: agent-manage
type: meta
trigger: /manage
---

# Agent Management

Manage the agent's skills and configuration.
```

## Changes to executor.ts

```typescript
// In SkillExecutor.execute():
if (skill.type === "workflow") {
  const composer = new SkillComposer(this);
  return composer.execute(workflowDef, input, options);
}
if (skill.type === "meta") {
  const meta = new MetaExecutor(this.skillRegistry, this.skillLoader);
  const result = await meta.execute(parsedAction);
  return { content: result, success: true };
}
// existing domain skill execution...
```

## Tests

- Execute a 2-step workflow with mock domain skills
- Skip workflow step based on condition
- Stop workflow on step failure (partial results)
- List skills via meta executor
- Remove skill via meta executor
- Handle unknown skill in workflow step (error)
