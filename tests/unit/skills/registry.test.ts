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
