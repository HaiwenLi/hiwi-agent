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
