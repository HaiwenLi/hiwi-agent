import { createGunzip } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { type Result, err, ok } from "neverthrow";
import * as tar from "tar-stream";
import { SkillLoader } from "./loader.js";
import type { Skill } from "./loader.js";
import type { SkillRegistry } from "./registry.js";

export class SkillImporter {
  constructor(
    private registry: SkillRegistry,
    private installDir: string,
  ) {}

  async importFromFile(filePath: string): Promise<Result<Skill, Error>> {
    let data: Buffer;
    try {
      data = await fs.readFile(filePath);
    } catch {
      return err(new Error(`File not found: ${filePath}`));
    }

    return this.extractAndInstall(data);
  }

  async importFromUrl(_url: string): Promise<Result<Skill, Error>> {
    try {
      const response = await fetch(_url);
      if (!response.ok) {
        return err(new Error(`HTTP ${response.status}: ${response.statusText}`));
      }
      const data = Buffer.from(await response.arrayBuffer());
      return this.extractAndInstall(data);
    } catch (error) {
      return err(new Error(`Import failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async extractAndInstall(data: Buffer): Promise<Result<Skill, Error>> {
    let skillMdContent: string | null = null;

    try {
      // Decompress gzip
      const decompressed = await this.gunzip(data);

      // Extract tar
      const extract = tar.extract();
      const entries: Map<string, string> = new Map();

      await new Promise<void>((resolve, reject) => {
        extract.on("entry", (header, stream, next) => {
          const chunks: Buffer[] = [];
          stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          stream.on("end", () => {
            entries.set(header.name, Buffer.concat(chunks).toString("utf-8"));
            next();
          });
          stream.on("error", reject);
        });
        extract.on("finish", resolve);
        extract.on("error", reject);

        const readable = Readable.from(decompressed);
        readable.pipe(extract as any);
      });

      const sk = entries.get("SKILL.md");
      if (!sk) {
        return err(new Error("Bundle missing SKILL.md"));
      }
      skillMdContent = sk;

      const loader = new SkillLoader([this.installDir]);
      // Parse and validate the skill
      const skillName = path.basename(path.dirname("SKILL.md"));
      const tempDir = path.join(this.installDir, skillName || "imported-skill");
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, "SKILL.md"), skillMdContent);

      const skills = await loader.discover();
      const skill = skills.find((s) => s.sourcePath.includes(tempDir));
      if (!skill) {
        // Clean up on failure
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        return err(new Error("Invalid skill: frontmatter validation failed"));
      }

      // Install to registry
      this.registry.register(skill);

      return ok(skill);
    } catch (error) {
      return err(new Error(`Extraction failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private gunzip(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = Readable.from([data]).pipe(createGunzip());
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }
}
