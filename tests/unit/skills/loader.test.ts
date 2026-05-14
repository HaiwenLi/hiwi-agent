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
