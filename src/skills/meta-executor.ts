import type { SkillRegistry } from "./registry.js";

export type MetaAction =
  | { type: "list-skills" }
  | { type: "install-skill"; url: string }
  | { type: "remove-skill"; name: string }
  | { type: "configure"; key: string; value: string }
  | { type: "self-improve"; feedback: string };

export class MetaExecutor {
  private config = new Map<string, string>();

  constructor(private skillRegistry: SkillRegistry) {}

  async execute(action: MetaAction): Promise<string> {
    switch (action.type) {
      case "list-skills": {
        const skills = this.skillRegistry.list();
        if (skills.length === 0) return "No skills registered.";
        return skills
          .map((s) => `${s.trigger} — ${s.description} [${s.type}]`)
          .join("\n");
      }
      case "remove-skill": {
        const skill = this.skillRegistry.getByName(action.name);
        if (!skill) return `Skill not found: ${action.name}`;
        this.skillRegistry.unregister(action.name);
        return `Removed skill: ${action.name}`;
      }
      case "install-skill": {
        return `Install from ${action.url} not yet implemented.`;
      }
      case "configure": {
        this.config.set(action.key, action.value);
        return `Configured: ${action.key}=${action.value}`;
      }
      case "self-improve": {
        return `Self-improvement feedback recorded: ${action.feedback.slice(0, 100)}`;
      }
      default: {
        throw new Error(`Unknown meta action: ${(action as any).type}`);
      }
    }
  }

  getConfig(key: string): string | undefined {
    return this.config.get(key);
  }
}
