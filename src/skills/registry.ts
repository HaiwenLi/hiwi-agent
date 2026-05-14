import type { Skill } from "./loader.js";

export interface ListOptions {
  type?: "domain" | "workflow" | "meta";
}

export class SkillRegistry {
  private byTrigger = new Map<string, Skill>();
  private byName = new Map<string, Skill>();

  register(skill: Skill): void {
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
