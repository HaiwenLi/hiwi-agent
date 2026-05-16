# Sprint 3: Skills System — TDD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the skill subsystem — SKILL.md discovery/parsing, skill registry with `/command` triggers, and skill execution engine that injects skill prompt into system prompt and runs the standard Agent Loop.

**Architecture:** Skills are SKILL.md files (Markdown + YAML frontmatter). Discovered from 4 directories (global, project, opencode-compat, claude-compat). Injected into system prompt, then executed via the standard Agent Loop. No independent permissions — inherits current mode. Failure aborts skill, falls back to normal chat.

**Tech Stack:** Vitest, Zod, gray-matter (frontmatter), neverthrow

**Prerequisite:** Sprint 1 (core engine) and Sprint 2 (memory) complete

**Reference:** `docs/plans/checkpoint-2026-05-13-implementation-planning.md` (Skills section), `docs/plans/2026-05-13-personal-agent-design.md` (Section 5)

---

## Task 1: Skill Loader

**Files:**
- Create: `src/skills/loader.ts`
- Create: `tests/unit/skills/loader.test.ts`

Discovers SKILL.md files across multiple directories, parses frontmatter (name, version, type, tools, trigger, description), validates required fields, and returns structured Skill objects.

**Step 1: Write the failing tests**

```typescript
// tests/unit/skills/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SkillLoader } from "@/skills/loader.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("SkillLoader", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-skill-test");
  const globalSkills = path.join(tmpDir, "global-skills");
  const projectSkills = path.join(tmpDir, "project", ".agent", "skills");

  beforeEach(async () => {
    await fs.mkdir(globalSkills, { recursive: true });
    await fs.mkdir(projectSkills, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeSkill(
    dir: string,
    filename: string,
    frontmatter: Record<string, unknown>,
    body: string,
  ): Promise<void> {
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => {
        if (Array.isArray(v)) return `${k}: [${v.map((s) => `"${s}"`).join(", ")}]`;
        if (typeof v === "string") return `${k}: "${v}"`;
        return `${k}: ${v}`;
      })
      .join("\n");
    await fs.writeFile(path.join(dir, filename), `---\n${fm}\n---\n\n${body}`);
  }

  it("discovers SKILL.md in global skills directory", async () => {
    await writeSkill(globalSkills, "SKILL.md", {
      name: "paper-search",
      version: "1.0.0",
      type: "domain",
      tools: ["web_search", "file_write"],
      description: "Search and analyze academic papers",
      trigger: "/paper-search",
    }, "# Paper Search Skill\n\nSearch papers from Semantic Scholar.");

    const loader = new SkillLoader([globalSkills]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("paper-search");
    expect(skills[0].trigger).toBe("/paper-search");
  });

  it("discovers skills from multiple directories", async () => {
    await writeSkill(globalSkills, "SKILL.md", {
      name: "global-skill",
      type: "domain",
      description: "Global skill",
      trigger: "/global",
    }, "Global skill body");

    await writeSkill(projectSkills, "SKILL.md", {
      name: "project-skill",
      type: "workflow",
      description: "Project skill",
      trigger: "/project",
    }, "Project skill body");

    const loader = new SkillLoader([globalSkills, projectSkills]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["global-skill", "project-skill"]);
  });

  it("parses skill body as the prompt content", async () => {
    const body = "# Paper Search\n\n## Steps\n1. Parse query\n2. Search\n3. Summarize";
    await writeSkill(globalSkills, "SKILL.md", {
      name: "test-skill",
      type: "domain",
      description: "Test",
      trigger: "/test",
    }, body);

    const loader = new SkillLoader([globalSkills]);
    const skills = await loader.discover();
    expect(skills[0].prompt).toContain("# Paper Search");
    expect(skills[0].prompt).toContain("Parse query");
  });

  it("skips invalid SKILL.md files (missing required fields)", async () => {
    // Missing trigger
    await fs.writeFile(
      path.join(globalSkills, "SKILL.md"),
      "---\nname: bad-skill\ntype: domain\ndescription: no trigger\n---\n\nBody",
    );

    const loader = new SkillLoader([globalSkills]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(0);
  });

  it("skips directories that don't exist", async () => {
    const loader = new SkillLoader(["/nonexistent/path"]);
    const skills = await loader.discover();
    expect(skills).toEqual([]);
  });

  it("handles nested skill directories (one SKILL.md per directory)", async () => {
    const paperDir = path.join(globalSkills, "paper-search");
    const codeDir = path.join(globalSkills, "code-review");
    await fs.mkdir(paperDir, { recursive: true });
    await fs.mkdir(codeDir, { recursive: true });

    await writeSkill(paperDir, "SKILL.md", {
      name: "paper-search",
      type: "domain",
      description: "Search papers",
      trigger: "/paper-search",
    }, "Paper search prompt");

    await writeSkill(codeDir, "SKILL.md", {
      name: "code-review",
      type: "domain",
      description: "Review code",
      trigger: "/code-review",
    }, "Code review prompt");

    const loader = new SkillLoader([globalSkills]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(2);
  });

  it("parses all frontmatter fields correctly", async () => {
    await writeSkill(globalSkills, "SKILL.md", {
      name: "full-skill",
      version: "2.0.0",
      type: "workflow",
      category: "research",
      tools: ["web_search", "file_write", "bash"],
      description: "A full featured skill",
      trigger: "/full",
    }, "Full skill body");

    const loader = new SkillLoader([globalSkills]);
    const skills = await loader.discover();
    const skill = skills[0];

    expect(skill.name).toBe("full-skill");
    expect(skill.version).toBe("2.0.0");
    expect(skill.type).toBe("workflow");
    expect(skill.category).toBe("research");
    expect(skill.tools).toEqual(["web_search", "file_write", "bash"]);
    expect(skill.description).toBe("A full featured skill");
    expect(skill.trigger).toBe("/full");
  });

  it("deduplicates skills by trigger (project overrides global)", async () => {
    await writeSkill(globalSkills, "SKILL.md", {
      name: "dup-skill",
      type: "domain",
      description: "Global version",
      trigger: "/dup",
    }, "Global body");

    await writeSkill(projectSkills, "SKILL.md", {
      name: "dup-skill",
      type: "domain",
      description: "Project version",
      trigger: "/dup",
    }, "Project body");

    // Project dir comes later → overrides
    const loader = new SkillLoader([globalSkills, projectSkills]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe("Project version");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/skills/loader.test.ts
```

Expected: FAIL

**Step 3: Create src/skills/loader.ts**

```typescript
// src/skills/loader.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";

export interface Skill {
  name: string;
  version?: string;
  type: "domain" | "workflow" | "meta";
  category?: string;
  tools?: string[];
  description: string;
  trigger: string;
  prompt: string;
  sourcePath: string;
}

const SkillFrontmatterSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  type: z.enum(["domain", "workflow", "meta"]).default("domain"),
  category: z.string().optional(),
  tools: z.array(z.string()).optional(),
  description: z.string(),
  trigger: z.string().refine((t) => t.startsWith("/"), {
    message: "trigger must start with /",
  }),
});

export class SkillLoader {
  private searchPaths: string[];

  constructor(searchPaths: string[]) {
    this.searchPaths = searchPaths;
  }

  async discover(): Promise<Skill[]> {
    const seen = new Map<string, Skill>(); // deduplicate by trigger

    for (const searchPath of this.searchPaths) {
      const skills = await this.scanDirectory(searchPath);
      for (const skill of skills) {
        // Later paths override earlier ones (project overrides global)
        seen.set(skill.trigger, skill);
      }
    }

    return Array.from(seen.values());
  }

  private async scanDirectory(dir: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return []; // directory doesn't exist
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name === "SKILL.md") {
        const skill = await this.parseSkillFile(fullPath);
        if (skill) skills.push(skill);
      } else if (entry.isDirectory()) {
        // Check for nested SKILL.md
        const nestedSkillPath = path.join(fullPath, "SKILL.md");
        try {
          await fs.access(nestedSkillPath);
          const skill = await this.parseSkillFile(nestedSkillPath);
          if (skill) skills.push(skill);
        } catch {
          // no SKILL.md in this subdirectory, skip
        }
      }
    }

    return skills;
  }

  private async parseSkillFile(filePath: string): Promise<Skill | null> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = matter(raw);

      const result = SkillFrontmatterSchema.safeParse(parsed.data);
      if (!result.success) {
        return null; // skip invalid files
      }

      return {
        name: result.data.name,
        version: result.data.version,
        type: result.data.type,
        category: result.data.category,
        tools: result.data.tools,
        description: result.data.description,
        trigger: result.data.trigger,
        prompt: parsed.content.trim(),
        sourcePath: filePath,
      };
    } catch {
      return null;
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/skills/loader.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/loader.ts tests/unit/skills/loader.test.ts
git commit -m "feat: skill loader with multi-directory discovery, frontmatter parsing, dedup"
```

---

## Task 2: Skill Registry

**Files:**
- Create: `src/skills/registry.ts`
- Create: `tests/unit/skills/registry.test.ts`

Central registry for loaded skills. Supports lookup by trigger command, lookup by name, list all skills, and hot-reload from disk. The registry is what the CLI checks when the user types a `/command`.

**Step 1: Write the failing tests**

```typescript
// tests/unit/skills/registry.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { SkillRegistry } from "@/skills/registry.js";
import type { Skill } from "@/skills/loader.js";

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  name: overrides.name ?? "test-skill",
  type: overrides.type ?? "domain",
  description: overrides.description ?? "A test skill",
  trigger: overrides.trigger ?? "/test",
  prompt: overrides.prompt ?? "You are a test skill agent.",
  sourcePath: overrides.sourcePath ?? "/skills/test-skill/SKILL.md",
  ...overrides,
});

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it("registers and retrieves a skill by trigger", () => {
    const skill = makeSkill({ trigger: "/paper-search" });
    registry.register(skill);
    expect(registry.getByTrigger("/paper-search")).toBe(skill);
  });

  it("registers and retrieves a skill by name", () => {
    const skill = makeSkill({ name: "paper-search" });
    registry.register(skill);
    expect(registry.getByName("paper-search")).toBe(skill);
  });

  it("lists all registered skills", () => {
    registry.register(makeSkill({ name: "a", trigger: "/a" }));
    registry.register(makeSkill({ name: "b", trigger: "/b" }));
    expect(registry.list()).toHaveLength(2);
  });

  it("returns undefined for unknown trigger", () => {
    expect(registry.getByTrigger("/nonexistent")).toBeUndefined();
  });

  it("returns undefined for unknown name", () => {
    expect(registry.getByName("nonexistent")).toBeUndefined();
  });

  it("unregisters a skill", () => {
    const skill = makeSkill({ name: "remove-me", trigger: "/remove" });
    registry.register(skill);
    registry.unregister("remove-me");
    expect(registry.getByName("remove-me")).toBeUndefined();
    expect(registry.getByTrigger("/remove")).toBeUndefined();
  });

  it("replaces skill when re-registered with same trigger", () => {
    registry.register(makeSkill({ name: "old", trigger: "/dup", prompt: "old prompt" }));
    registry.register(makeSkill({ name: "new", trigger: "/dup", prompt: "new prompt" }));

    const skill = registry.getByTrigger("/dup");
    expect(skill?.prompt).toBe("new prompt");
    expect(skill?.name).toBe("new");
  });

  it("filters skills by type", () => {
    registry.register(makeSkill({ name: "a", type: "domain", trigger: "/a" }));
    registry.register(makeSkill({ name: "b", type: "workflow", trigger: "/b" }));
    registry.register(makeSkill({ name: "c", type: "domain", trigger: "/c" }));

    const domain = registry.list({ type: "domain" });
    expect(domain).toHaveLength(2);
    expect(domain.every((s) => s.type === "domain")).toBe(true);
  });

  it("checks if a trigger is registered", () => {
    registry.register(makeSkill({ trigger: "/exists" }));
    expect(registry.hasTrigger("/exists")).toBe(true);
    expect(registry.hasTrigger("/nope")).toBe(false);
  });

  it("returns trigger list for autocomplete", () => {
    registry.register(makeSkill({ name: "a", trigger: "/alpha" }));
    registry.register(makeSkill({ name: "b", trigger: "/beta" }));

    const triggers = registry.getTriggers();
    expect(triggers).toEqual(["/alpha", "/beta"]);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/skills/registry.test.ts
```

Expected: FAIL

**Step 3: Create src/skills/registry.ts**

```typescript
// src/skills/registry.ts
import type { Skill } from "./loader.js";

export interface ListOptions {
  type?: "domain" | "workflow" | "meta";
}

export class SkillRegistry {
  private byTrigger = new Map<string, Skill>();
  private byName = new Map<string, Skill>();

  register(skill: Skill): void {
    // Remove old entry if overwriting
    const existing = this.byTrigger.get(skill.trigger);
    if (existing) {
      this.byName.delete(existing.name);
    }

    this.byTrigger.set(skill.trigger, skill);
    this.byName.set(skill.name, skill);
  }

  unregister(name: string): void {
    const skill = this.byName.get(name);
    if (skill) {
      this.byTrigger.delete(skill.trigger);
      this.byName.delete(name);
    }
  }

  getByTrigger(trigger: string): Skill | undefined {
    return this.byTrigger.get(trigger);
  }

  getByName(name: string): Skill | undefined {
    return this.byName.get(name);
  }

  hasTrigger(trigger: string): boolean {
    return this.byTrigger.has(trigger);
  }

  list(options?: ListOptions): Skill[] {
    const all = Array.from(this.byTrigger.values());
    if (options?.type) {
      return all.filter((s) => s.type === options.type);
    }
    return all;
  }

  getTriggers(): string[] {
    return Array.from(this.byTrigger.keys());
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/skills/registry.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/registry.ts tests/unit/skills/registry.test.ts
git commit -m "feat: skill registry with trigger/name lookup, type filter, autocomplete"
```

---

## Task 3: Skill Executor

**Files:**
- Create: `src/skills/executor.ts`
- Create: `tests/unit/skills/executor.test.ts`

Takes a loaded skill, injects its prompt into the system prompt, filters available tools to the skill's declared `tools` list, then runs the standard Agent Loop. On skill failure: abort, report error, fallback to normal chat. Inherits current permission mode — no independent permissions.

**Step 1: Write the failing tests**

```typescript
// tests/unit/skills/executor.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SkillExecutor } from "@/skills/executor.js";
import { SkillRegistry } from "@/skills/registry.js";
import { ToolRegistry } from "@/core/tools.js";
import { MockAdapter } from "@/adapters/mock.js";
import { AgentLoop } from "@/core/agent.js";
import type { Skill } from "@/skills/loader.js";
import type { AgentLoopConfig, Tool, ToolContext, PermissionMode } from "@/types.js";

const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: ["read_file"],
  streaming: false,
  interruptible: true,
};

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  name: overrides.name ?? "test-skill",
  type: overrides.type ?? "domain",
  description: overrides.description ?? "Test skill",
  trigger: overrides.trigger ?? "/test",
  prompt: overrides.prompt ?? "You are a test assistant. Follow these steps:\n1. Analyze input\n2. Respond",
  tools: overrides.tools ?? ["read_file", "glob"],
  sourcePath: "/skills/test/SKILL.md",
});

const makeTool = (name: string): Tool => ({
  name,
  description: `${name} tool`,
  inputSchema: { type: "object" },
  capabilities: ["ReadOnly"],
  execute: vi.fn(async () => ({
    toolCallId: "c1",
    content: `${name} result`,
    isError: false,
  })),
});

describe("SkillExecutor", () => {
  let toolRegistry: ToolRegistry;
  let skillRegistry: SkillRegistry;
  let adapter: MockAdapter;
  let executor: SkillExecutor;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    skillRegistry = new SkillRegistry();
    adapter = new MockAdapter([]);
    executor = new SkillExecutor(toolRegistry, skillRegistry);
  });

  describe("buildSystemPrompt", () => {
    it("injects skill prompt into system prompt", () => {
      const skill = makeSkill({ prompt: "You are a paper search expert." });
      const prompt = executor.buildSystemPrompt(skill, "original system prompt");

      expect(prompt).toContain("paper search expert");
      expect(prompt).toContain("original system prompt");
    });

    it("includes skill metadata in system prompt header", () => {
      const skill = makeSkill({ name: "paper-search", type: "domain", tools: ["web_search"] });
      const prompt = executor.buildSystemPrompt(skill, "");

      expect(prompt).toContain("paper-search");
      expect(prompt).toContain("domain");
      expect(prompt).toContain("web_search");
    });
  });

  describe("filterTools", () => {
    it("returns only tools declared by the skill", () => {
      toolRegistry.register(makeTool("read_file"));
      toolRegistry.register(makeTool("glob"));
      toolRegistry.register(makeTool("bash"));
      toolRegistry.register(makeTool("web_search"));

      const skill = makeSkill({ tools: ["read_file", "glob"] });
      const filtered = executor.filterTools(skill);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.name).sort()).toEqual(["glob", "read_file"]);
    });

    it("returns all tools if skill declares no tools", () => {
      toolRegistry.register(makeTool("read_file"));
      toolRegistry.register(makeTool("bash"));

      const skill = makeSkill({ tools: undefined });
      const filtered = executor.filterTools(skill);

      expect(filtered).toHaveLength(2);
    });

    it("returns empty if skill tools dont match registered tools", () => {
      toolRegistry.register(makeTool("bash"));

      const skill = makeSkill({ tools: ["nonexistent_tool"] });
      const filtered = executor.filterTools(skill);

      expect(filtered).toHaveLength(0);
    });
  });

  describe("execute", () => {
    it("runs skill via agent loop and returns events", async () => {
      const skill = makeSkill({ tools: ["read_file"] });
      skillRegistry.register(skill);
      toolRegistry.register(makeTool("read_file"));

      const mockAdapter = new MockAdapter([
        { content: "I'll analyze that for you.", toolCalls: [], finishReason: "stop" },
      ]);

      const result = await executor.execute(skill, "search for papers on transformers", {
        adapter: mockAdapter,
        permissionMode: "normal",
        loopConfig: DEFAULT_LOOP_CONFIG,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.events.length).toBeGreaterThan(0);
        const finish = result.value.events.find((e) => e.type === "finish");
        expect(finish?.finishReason).toBe("completed");
      }
    });

    it("executes skill tools when agent loop calls them", async () => {
      const readTool = makeTool("read_file");
      const skill = makeSkill({ tools: ["read_file"] });
      skillRegistry.register(skill);
      toolRegistry.register(readTool);

      const mockAdapter = new MockAdapter([
        {
          content: "",
          toolCalls: [{ id: "c1", name: "read_file", input: { path: "/data/papers.txt" } }],
          finishReason: "tool-calls",
        },
        { content: "Found 5 papers.", toolCalls: [], finishReason: "stop" },
      ]);

      const result = await executor.execute(skill, "search papers", {
        adapter: mockAdapter,
        permissionMode: "yolo",
        loopConfig: DEFAULT_LOOP_CONFIG,
      });

      expect(result.isOk()).toBe(true);
      expect(readTool.execute).toHaveBeenCalled();
    });

    it("returns error if skill execution fails", async () => {
      const skill = makeSkill({ tools: ["crash_tool"] });
      skillRegistry.register(skill);

      // No adapter → will fail
      const result = await executor.execute(skill, "test", {
        adapter: null as any,
        permissionMode: "normal",
        loopConfig: DEFAULT_LOOP_CONFIG,
      });

      expect(result.isErr()).toBe(true);
    });

    it("inherits current permission mode", async () => {
      const skill = makeSkill({ tools: ["bash"] });
      skillRegistry.register(skill);
      const bashTool = makeTool("bash");
      bashTool.capabilities = ["ExecCode"];
      toolRegistry.register(bashTool);

      const mockAdapter = new MockAdapter([
        {
          content: "",
          toolCalls: [{ id: "c1", name: "bash", input: { command: "ls" } }],
          finishReason: "tool-calls",
        },
        { content: "Done", toolCalls: [], finishReason: "stop" },
      ]);

      // In "normal" mode, ExecCode tool should require permission
      const onPermission = vi.fn(async () => true);
      const tr = new ToolRegistry({ onPermission });
      tr.register(bashTool);
      const exec = new SkillExecutor(tr, skillRegistry);

      await exec.execute(skill, "run ls", {
        adapter: mockAdapter,
        permissionMode: "normal",
        loopConfig: DEFAULT_LOOP_CONFIG,
      });

      expect(onPermission).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/skills/executor.test.ts
```

Expected: FAIL

**Step 3: Create src/skills/executor.ts**

```typescript
// src/skills/executor.ts
import { err, ok, type Result } from "neverthrow";
import type { AgentLoopEvent, AgentLoopConfig, ModelAdapter, PermissionMode, Tool } from "../types.js";
import type { Skill } from "./loader.js";
import type { ToolRegistry } from "../core/tools.js";
import { AgentLoop } from "../core/agent.js";

export interface SkillExecuteOptions {
  adapter: ModelAdapter;
  permissionMode: PermissionMode;
  loopConfig: AgentLoopConfig;
  systemPrompt?: string;
  context?: { workingDirectory: string; sessionId: string };
}

export interface SkillExecuteResult {
  events: AgentLoopEvent[];
}

export class SkillExecutor {
  private toolRegistry: ToolRegistry;
  private skillToolRegistry?: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  buildSystemPrompt(skill: Skill, basePrompt: string = ""): string {
    const header = [
      `## Active Skill: ${skill.name}`,
      `**Type:** ${skill.type}`,
      skill.tools?.length ? `**Available tools:** ${skill.tools.join(", ")}` : null,
      "",
    ]
      .filter(Boolean)
      .join("\n");

    const parts = [header, skill.prompt];
    if (basePrompt) {
      parts.unshift(basePrompt);
    }
    return parts.join("\n\n");
  }

  filterTools(skill: Skill): Tool[] {
    const allTools = this.toolRegistry.list();

    if (!skill.tools || skill.tools.length === 0) {
      return allTools;
    }

    const allowedNames = new Set(skill.tools);
    return allTools.filter((t) => allowedNames.has(t.name));
  }

  async execute(
    skill: Skill,
    userMessage: string,
    options: SkillExecuteOptions,
  ): Promise<Result<SkillExecuteResult, Error>> {
    try {
      // Build filtered tool registry for this skill
      const filteredTools = this.filterTools(skill);
      const skillToolRegistry = this.createFilteredRegistry(filteredTools);

      // Build messages with skill system prompt
      const systemPrompt = this.buildSystemPrompt(skill, options.systemPrompt);
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userMessage },
      ];

      // Run agent loop with skill's filtered tools
      const loop = new AgentLoop(
        options.adapter,
        skillToolRegistry,
        options.permissionMode,
        options.loopConfig,
        options.context,
      );

      const events: AgentLoopEvent[] = [];
      for await (const event of loop.run(messages)) {
        events.push(event);
      }

      return ok({ events });
    } catch (error) {
      return err(new Error(`Skill execution failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private createFilteredRegistry(tools: Tool[]): ToolRegistry {
    const { ToolRegistry: TR } = require("../core/tools.js");
    const registry = new TR();
    for (const tool of tools) {
      registry.register(tool);
    }
    return registry;
  }
}
```

**Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/skills/executor.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/skills/executor.ts tests/unit/skills/executor.test.ts
git commit -m "feat: skill executor with tool filtering, system prompt injection, agent loop"
```

---

## Task 4: Integration Test + Update Exports

**Files:**
- Create: `tests/integration/skill-execution.test.ts`
- Modify: `src/index.ts`

End-to-end: write SKILL.md files → discover → register → execute with mock adapter → verify tool filtering and system prompt injection.

**Step 1: Write the integration test**

```typescript
// tests/integration/skill-execution.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SkillLoader } from "@/skills/loader.js";
import { SkillRegistry } from "@/skills/registry.js";
import { SkillExecutor } from "@/skills/executor.js";
import { ToolRegistry } from "@/core/tools.js";
import { MockAdapter } from "@/adapters/mock.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { AgentLoopConfig, Tool } from "@/types.js";

const LOOP_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: ["read_file"],
  streaming: false,
  interruptible: true,
};

describe("Integration: Skill Execution E2E", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-skill-integration");
  const skillsDir = path.join(tmpDir, "skills");

  beforeEach(async () => {
    await fs.mkdir(skillsDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("discovers, registers, and executes a skill end-to-end", async () => {
    // 1. Write a SKILL.md
    const codeReviewDir = path.join(skillsDir, "code-review");
    await fs.mkdir(codeReviewDir, { recursive: true });
    await fs.writeFile(
      path.join(codeReviewDir, "SKILL.md"),
      [
        "---",
        'name: "code-review"',
        "type: domain",
        "tools: [read_file, glob]",
        'description: "Review code for quality issues"',
        'trigger: "/code-review"',
        "---",
        "",
        "# Code Review Skill",
        "",
        "You are a code review expert.",
        "1. Read the files",
        "2. Identify issues",
        "3. Suggest fixes",
      ].join("\n"),
    );

    // 2. Set up tools
    const toolRegistry = new ToolRegistry();
    const readFile: Tool = {
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object" },
      capabilities: ["ReadOnly"],
      execute: async () => ({ toolCallId: "c1", content: "function foo() { return 1 }", isError: false }),
    };
    const glob: Tool = {
      name: "glob",
      description: "Search files",
      inputSchema: { type: "object" },
      capabilities: ["ReadOnly"],
      execute: async () => ({ toolCallId: "c2", content: "src/index.ts", isError: false }),
    };
    const bash: Tool = {
      name: "bash",
      description: "Run commands",
      inputSchema: { type: "object" },
      capabilities: ["ExecCode"],
      execute: async () => ({ toolCallId: "c3", content: "ok", isError: false }),
    };
    toolRegistry.register(readFile);
    toolRegistry.register(glob);
    toolRegistry.register(bash);

    // 3. Discover and register skills
    const loader = new SkillLoader([skillsDir]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(1);

    const skillRegistry = new SkillRegistry();
    for (const skill of skills) {
      skillRegistry.register(skill);
    }

    // 4. Verify skill is registered
    expect(skillRegistry.hasTrigger("/code-review")).toBe(true);

    // 5. Execute skill
    const executor = new SkillExecutor(toolRegistry);
    const skill = skillRegistry.getByTrigger("/code-review")!;

    // Verify tool filtering — skill declares [read_file, glob], not bash
    const filteredTools = executor.filterTools(skill);
    expect(filteredTools.map((t) => t.name).sort()).toEqual(["glob", "read_file"]);

    // Verify system prompt injection
    const sysPrompt = executor.buildSystemPrompt(skill);
    expect(sysPrompt).toContain("code-review");
    expect(sysPrompt).toContain("You are a code review expert");

    // 6. Run full execution
    const mockAdapter = new MockAdapter([
      {
        content: "",
        toolCalls: [{ id: "c1", name: "read_file", input: { path: "src/index.ts" } }],
        finishReason: "tool-calls",
      },
      { content: "Found 2 issues: missing error handling, unused variable.", toolCalls: [], finishReason: "stop" },
    ]);

    const result = await executor.execute(skill, "Review src/index.ts", {
      adapter: mockAdapter,
      permissionMode: "yolo",
      loopConfig: LOOP_CONFIG,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const events = result.value.events;
      expect(events.some((e) => e.type === "tool-call" && e.toolName === "read_file")).toBe(true);
      expect(events.some((e) => e.type === "text-delta" && e.text?.includes("issues"))).toBe(true);
      expect(events.find((e) => e.type === "finish")?.finishReason).toBe("completed");
    }
  });

  it("project skill overrides global skill", async () => {
    const globalDir = path.join(tmpDir, "global");
    const projectDir = path.join(tmpDir, "project");
    await fs.mkdir(globalDir, { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });

    // Global version
    await fs.writeFile(
      path.join(globalDir, "SKILL.md"),
      '---\nname: "test"\ntype: domain\ndescription: "Global"\ntrigger: "/test"\n---\n\nGlobal prompt',
    );
    // Project version (overrides)
    await fs.writeFile(
      path.join(projectDir, "SKILL.md"),
      '---\nname: "test"\ntype: domain\ndescription: "Project"\ntrigger: "/test"\n---\n\nProject prompt',
    );

    const loader = new SkillLoader([globalDir, projectDir]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe("Project");
    expect(skills[0].prompt).toBe("Project prompt");
  });
});
```

**Step 2: Update src/index.ts to export Sprint 3 modules**

```typescript
// Add to src/index.ts:
// Skills
export { SkillLoader, type Skill } from "./skills/loader.js";
export { SkillRegistry, type ListOptions as SkillListOptions } from "./skills/registry.js";
export { SkillExecutor, type SkillExecuteOptions, type SkillExecuteResult } from "./skills/executor.js";
```

**Step 3: Run all tests**

```bash
pnpm test
```

Expected: ALL PASS

**Step 4: Commit**

```bash
git add tests/integration/skill-execution.test.ts src/index.ts
git commit -m "test: integration tests for full skill discovery and execution E2E"
```

---

## Sprint 3 Summary

### Files Created (3 source + 4 test)

| Category | Source Files | Test Files |
|----------|-------------|------------|
| Loader | `src/skills/loader.ts` | `tests/unit/skills/loader.test.ts` |
| Registry | `src/skills/registry.ts` | `tests/unit/skills/registry.test.ts` |
| Executor | `src/skills/executor.ts` | `tests/unit/skills/executor.test.ts` |
| Integration | — | `tests/integration/skill-execution.test.ts` |

### Key Design Points

- **SKILL.md** — Markdown + YAML frontmatter, validated with Zod
- **4 discovery paths** — global, project, opencode-compat, claude-compat (passed as searchPaths array)
- **Deduplication** — later paths override earlier (project > global)
- **Tool filtering** — skill declares `tools: [...]`, executor filters available tools accordingly
- **System prompt injection** — skill prompt wrapped with metadata header, prepended to base prompt
- **Standard Agent Loop** — skills reuse the same loop, no special execution path
- **Inherited permissions** — no independent permission model, uses current session mode
- **Failure handling** — executor returns `Result` type, caller falls back to normal chat on error
