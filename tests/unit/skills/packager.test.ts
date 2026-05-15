import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SkillPackager } from "@/skills/packager.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SkillPackager", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-packager-test");
  let packager: SkillPackager;

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    packager = new SkillPackager();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("exports a skill to a tar.gz buffer", async () => {
    const skillDir = path.join(tmpDir, "test-skill");
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        'name: "test-skill"',
        'version: "1.0.0"',
        'type: "domain"',
        'trigger: "/test-skill"',
        'description: "A test skill"',
        "---",
        "",
        "# Test Skill",
        "",
        "Test body.",
      ].join("\n"),
    );

    const result = await packager.pack("test-skill", skillDir);
    expect(result.isOk()).toBe(true);
    expect(Buffer.isBuffer(result.value)).toBe(true);

    // Should be a gzip file
    const magic = result.value.slice(0, 2);
    expect(magic[0]).toBe(0x1f);
    expect(magic[1]).toBe(0x8b);
  });

  it("rejects skills with missing required frontmatter", async () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    await fs.mkdir(skillDir, { recursive: true });

    // Missing trigger
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        'name: "bad-skill"',
        'type: "domain"',
        'description: "no trigger"',
        "---",
        "",
        "Body.",
      ].join("\n"),
    );

    const result = await packager.pack("bad-skill", skillDir);
    expect(result.isErr()).toBe(true);
  });

  it("includes assets in the bundle", async () => {
    const skillDir = path.join(tmpDir, "asset-skill");
    await fs.mkdir(skillDir, { recursive: true });

    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        'name: "asset-skill"',
        'version: "1.0.0"',
        'type: "domain"',
        'trigger: "/asset"',
        'description: "Has assets"',
        "---",
        "",
        "Body.",
      ].join("\n"),
    );

    await fs.writeFile(path.join(skillDir, "template.txt"), "some template");

    const result = await packager.pack("asset-skill", skillDir);
    expect(result.isOk()).toBe(true);
  });
});
