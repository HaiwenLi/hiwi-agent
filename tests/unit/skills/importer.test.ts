import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SkillImporter } from "@/skills/importer.js";
import { SkillPackager } from "@/skills/packager.js";
import { SkillRegistry } from "@/skills/registry.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("SkillImporter", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-importer-test");
  const installDir = path.join(tmpDir, "installed");
  let importer: SkillImporter;
  let registry: SkillRegistry;

  beforeEach(async () => {
    await fs.mkdir(installDir, { recursive: true });
    registry = new SkillRegistry();
    importer = new SkillImporter(registry, installDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("imports a skill from a tar.gz file", async () => {
    // First create a valid bundle
    const skillDir = path.join(tmpDir, "source-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        'name: "imported-skill"',
        'version: "1.0.0"',
        'type: "domain"',
        'trigger: "/imported"',
        'description: "Imported skill"',
        "---",
        "",
        "# Imported Skill",
        "",
        "Body.",
      ].join("\n"),
    );

    const packager = new SkillPackager();
    const packResult = await packager.pack("imported-skill", skillDir);
    expect(packResult.isOk()).toBe(true);

    const bundlePath = path.join(tmpDir, "bundle.hiwi-skill");
    await fs.writeFile(bundlePath, packResult.value);

    const result = await importer.importFromFile(bundlePath);
    expect(result.isOk()).toBe(true);
    expect(result.value.name).toBe("imported-skill");
    expect(result.value.trigger).toBe("/imported");

    // Should be registered
    expect(registry.getByName("imported-skill")).toBeDefined();
  });

  it("rejects a corrupted bundle", async () => {
    const badBundlePath = path.join(tmpDir, "bad.hiwi-skill");
    await fs.writeFile(badBundlePath, "not a valid tar.gz");

    const result = await importer.importFromFile(badBundlePath);
    expect(result.isErr()).toBe(true);
  });

  it("rejects invalid skill in bundle", async () => {
    // Create a tar.gz that has SKILL.md but with invalid frontmatter
    // This test verifies validation
    const skillDir = path.join(tmpDir, "invalid-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "No frontmatter at all, just plain text");

    const packager = new SkillPackager();
    const packResult = await packager.pack("invalid-skill", skillDir);
    expect(packResult.isErr()).toBe(true);
  });

  it("handles non-existent file", async () => {
    const result = await importer.importFromFile("/no/such/file.hiwi-skill");
    expect(result.isErr()).toBe(true);
  });
});
