import { SkillComposer, type WorkflowDefinition } from "@/skills/composer.js";
import { SkillExecutor } from "@/skills/executor.js";
import type { Skill } from "@/skills/loader.js";
import { ToolRegistry } from "@/core/tools.js";
import type { ModelAdapter, Tool } from "@/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockAdapter(): ModelAdapter {
  return {
    id: "test-model",
    provider: "test",
    capabilities: {
      tools: true,
      vision: false,
      maxTokens: 4096,
      contextWindow: 128000,
    },
    chat: vi.fn(async () => ({
      content: "mock response",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    })),
    stream: async function* () {
      yield { type: "text-delta" as const, text: "mock stream" };
      yield {
        type: "finish" as const,
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
  };
}

function createMockSkill(name: string, trigger: string): Skill {
  return {
    name,
    trigger,
    type: "domain",
    description: `${name} skill`,
    prompt: `# ${name}\n\nDo stuff.`,
    sourcePath: `/fake/${name}/SKILL.md`,
  };
}

describe("SkillComposer", () => {
  let executor: SkillExecutor;
  let composer: SkillComposer;
  let adapter: ModelAdapter;

  beforeEach(() => {
    const registry = new ToolRegistry();
    executor = new SkillExecutor(registry);
    composer = new SkillComposer(executor);
    adapter = createMockAdapter();
  });

  it("executes a 2-step workflow", async () => {
    const step1Skill = createMockSkill("step1", "/step1");
    const step2Skill = createMockSkill("step2", "/step2");

    // Mock executor to return controlled results
    const executeSpy = vi.spyOn(executor, "execute");
    executeSpy
      .mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        _unsafeUnwrap: () => ({ events: [{ type: "text-delta", text: "Result from step 1" }] }),
        value: { events: [{ type: "text-delta", text: "Result from step 1" }] },
        error: undefined as any,
      } as any)
      .mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        _unsafeUnwrap: () => ({ events: [{ type: "text-delta", text: "Result from step 2" }] }),
        value: { events: [{ type: "text-delta", text: "Result from step 2" }] },
        error: undefined as any,
      } as any);

    const workflow: WorkflowDefinition = {
      steps: [
        { skill: "/step1", input: "Input for step 1" },
        { skill: "/step2", input: "Input for step 2" },
      ],
    };

    const result = await composer.execute(workflow, "initial input", {
      adapter,
      permissionMode: "normal",
      loopConfig: {
        maxLoops: 10,
        maxOutputTokensPerTurn: 2048,
        budgetTotal: 10,
        refundableTools: [],
        streaming: false,
        interruptible: false,
      },
    });

    expect(executeSpy).toHaveBeenCalledTimes(2);
    expect(result.isOk()).toBe(true);
  });

  it("skips workflow step when condition is false", async () => {
    const skill = createMockSkill("always", "/always");
    const executeSpy = vi.spyOn(executor, "execute");
    executeSpy.mockResolvedValue({
      isOk: () => true,
      isErr: () => false,
      value: { events: [{ type: "text-delta", text: "done" }] },
      error: undefined as any,
    } as any);

    const workflow: WorkflowDefinition = {
      steps: [
        { skill: "/always", input: "first" },
        { skill: "/skip", input: "should not run", condition: "false" },
      ],
    };

    await composer.execute(workflow, "input", {
      adapter,
      permissionMode: "normal",
      loopConfig: { maxLoops: 5, maxOutputTokensPerTurn: 1024, budgetTotal: 5, refundableTools: [], streaming: false, interruptible: false },
    });

    // Only first step should execute
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it("stops on step failure and returns partial results", async () => {
    const skill1 = createMockSkill("good", "/good");
    const skill2 = createMockSkill("bad", "/bad");

    const executeSpy = vi.spyOn(executor, "execute");
    executeSpy
      .mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: { events: [{ type: "text-delta", text: "step 1 ok" }] },
        error: undefined as any,
      } as any)
      .mockResolvedValueOnce({
        isOk: () => false,
        isErr: () => true,
        error: new Error("Step 2 failed"),
        value: undefined as any,
      } as any);

    const workflow: WorkflowDefinition = {
      steps: [
        { skill: "/good", input: "step1" },
        { skill: "/bad", input: "step2" },
        { skill: "/never", input: "step3" },
      ],
    };

    const result = await composer.execute(workflow, "input", {
      adapter,
      permissionMode: "normal",
      loopConfig: { maxLoops: 5, maxOutputTokensPerTurn: 1024, budgetTotal: 5, refundableTools: [], streaming: false, interruptible: false },
    });

    expect(result.isErr()).toBe(true);
    expect(executeSpy).toHaveBeenCalledTimes(2); // good runs, bad fails, never skipped
  });

  it("handles unknown skill in workflow step", async () => {
    const executeSpy = vi.spyOn(executor, "execute");
    executeSpy.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: new Error("Skill not found"),
      value: undefined as any,
    } as any);

    const workflow: WorkflowDefinition = {
      steps: [{ skill: "/nonexistent", input: "test" }],
    };

    const result = await composer.execute(workflow, "input", {
      adapter,
      permissionMode: "normal",
      loopConfig: { maxLoops: 5, maxOutputTokensPerTurn: 1024, budgetTotal: 5, refundableTools: [], streaming: false, interruptible: false },
    });

    expect(result.isErr()).toBe(true);
  });
});
