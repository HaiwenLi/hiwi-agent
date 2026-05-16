import type { Skill } from "@/skills/loader.js";
import { type MetaAction, MetaExecutor } from "@/skills/meta-executor.js";
import { SkillRegistry } from "@/skills/registry.js";
import { beforeEach, describe, expect, it } from "vitest";

function createSkill(
  name: string,
  trigger: string,
  type: "domain" | "workflow" | "meta" = "domain",
): Skill {
  return {
    name,
    trigger,
    type,
    description: `${name} skill`,
    prompt: `# ${name}\n\nBody.`,
    sourcePath: `/fake/${name}/SKILL.md`,
  };
}

describe("MetaExecutor", () => {
  let registry: SkillRegistry;
  let meta: MetaExecutor;

  beforeEach(() => {
    registry = new SkillRegistry();
    meta = new MetaExecutor(registry);
  });

  it("lists all skills", async () => {
    registry.register(createSkill("paper-search", "/paper", "domain"));
    registry.register(createSkill("code-review", "/review", "domain"));
    registry.register(createSkill("research-flow", "/research-review", "workflow"));

    const action: MetaAction = { type: "list-skills" };
    const result = await meta.execute(action);

    expect(result).toContain("/paper");
    expect(result).toContain("/review");
    expect(result).toContain("/research-review");
  });

  it("removes a skill by name", async () => {
    registry.register(createSkill("paper-search", "/paper", "domain"));
    registry.register(createSkill("code-review", "/review", "domain"));

    const action: MetaAction = { type: "remove-skill", name: "paper-search" };
    const result = await meta.execute(action);

    expect(result).toContain("Removed");
    expect(registry.list()).toHaveLength(1);
    expect(registry.getByName("paper-search")).toBeUndefined();
  });

  it("handles remove of nonexistent skill", async () => {
    const action: MetaAction = { type: "remove-skill", name: "no-such-skill" };
    const result = await meta.execute(action);

    expect(result).toContain("not found");
  });

  it("configures agent settings", async () => {
    const action: MetaAction = {
      type: "configure",
      key: "streaming",
      value: "true",
    };
    const result = await meta.execute(action);

    expect(result).toContain("Configured");
    expect(meta.getConfig("streaming")).toBe("true");
  });

  it("handles unknown meta action", async () => {
    const action = { type: "unknown-action" } as unknown as MetaAction;
    await expect(meta.execute(action)).rejects.toThrow();
  });
});
