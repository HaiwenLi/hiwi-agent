import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SkillLoader } from "@/skills/loader.js";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(__dirname, "../../../skills");

describe("Built-in Skills", () => {
  it("both built-in skills exist and are discoverable", async () => {
    await fs.access(skillsDir);

    const loader = new SkillLoader([skillsDir]);
    const skills = await loader.discover();

    expect(skills.length).toBeGreaterThanOrEqual(2);

    const paperSearch = skills.find((s) => s.name === "paper-search");
    const codeReview = skills.find((s) => s.name === "code-review");

    expect(paperSearch).toBeDefined();
    expect(paperSearch!.trigger).toBe("/paper");
    expect(paperSearch!.type).toBe("domain");
    expect(paperSearch!.description).toBeDefined();
    expect(paperSearch!.prompt).toBeDefined();

    expect(codeReview).toBeDefined();
    expect(codeReview!.trigger).toBe("/review");
    expect(codeReview!.type).toBe("domain");
    expect(codeReview!.description).toBeDefined();
    expect(codeReview!.prompt).toBeDefined();
  });

  it("paper-search skill parses correctly", async () => {
    const loader = new SkillLoader([skillsDir]);
    const skills = await loader.discover();
    const ps = skills.find((s) => s.name === "paper-search");
    expect(ps).toBeDefined();
    expect(ps!.tools).toContain("web_fetch");
    expect(ps!.tools).toContain("web_search");
    expect(ps!.prompt).toContain("Search for academic papers");
  });

  it("code-review skill parses correctly", async () => {
    const loader = new SkillLoader([skillsDir]);
    const skills = await loader.discover();
    const cr = skills.find((s) => s.name === "code-review");
    expect(cr).toBeDefined();
    expect(cr!.tools).toContain("read_file");
    expect(cr!.tools).toContain("grep");
    expect(cr!.prompt).toContain("Review code for quality");
  });
});
