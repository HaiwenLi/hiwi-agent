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
    const seen = new Map<string, Skill>();

    for (const searchPath of this.searchPaths) {
      const skills = await this.scanDirectory(searchPath);
      for (const skill of skills) {
        seen.set(skill.trigger, skill);
      }
    }

    return Array.from(seen.values());
  }

  private async scanDirectory(dir: string): Promise<Skill[]> {
    const skills: Skill[] = [];

    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name === "SKILL.md") {
        const skill = await this.parseSkillFile(fullPath);
        if (skill) skills.push(skill);
      } else if (entry.isDirectory()) {
        const nestedSkillPath = path.join(fullPath, "SKILL.md");
        try {
          await fs.access(nestedSkillPath);
          const skill = await this.parseSkillFile(nestedSkillPath);
          if (skill) skills.push(skill);
        } catch {
          // no SKILL.md in this subdirectory
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
        return null;
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
