import { MockAdapter } from "@/adapters/mock.js";
import { ToolRegistry } from "@/core/tools.js";
import { SkillExecutor } from "@/skills/executor.js";
import type { Skill } from "@/skills/loader.js";
import { SkillRegistry } from "@/skills/registry.js";
import type { AgentLoopConfig, PermissionMode, Tool } from "@/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  prompt:
    overrides.prompt ??
    "You are a test assistant. Follow these steps:\n1. Analyze input\n2. Respond",
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
  let executor: SkillExecutor;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
    skillRegistry = new SkillRegistry();
    executor = new SkillExecutor(toolRegistry);
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

      const skill: Skill = {
        name: "no-tools-skill",
        type: "domain",
        description: "No tools declared",
        trigger: "/no-tools",
        prompt: "Do stuff",
        sourcePath: "/skills/test/SKILL.md",
      };
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

      const result = await executor.execute(skill, "test", {
        adapter: null as unknown as ModelAdapter,
        permissionMode: "normal",
        loopConfig: DEFAULT_LOOP_CONFIG,
      });

      expect(result.isErr()).toBe(true);
    });

    it("inherits current permission mode", async () => {
      const skill = makeSkill({ tools: ["bash"] });
      const bashTool = makeTool("bash");
      bashTool.capabilities = ["ExecCode"];

      const mockAdapter = new MockAdapter([
        {
          content: "",
          toolCalls: [{ id: "c1", name: "bash", input: { command: "ls" } }],
          finishReason: "tool-calls",
        },
        { content: "Done", toolCalls: [], finishReason: "stop" },
      ]);

      const onPermission = vi.fn(async () => true);
      const options = { onPermission };
      const tr = new ToolRegistry(options);
      tr.register(bashTool);
      const exec = new SkillExecutor(tr, options);

      await exec.execute(skill, "run ls", {
        adapter: mockAdapter,
        permissionMode: "normal",
        loopConfig: DEFAULT_LOOP_CONFIG,
      });

      expect(onPermission).toHaveBeenCalled();
    });
  });
});
