import { createGzip } from "node:zlib";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { type Result, err, ok } from "neverthrow";
import * as tar from "tar-stream";
import matter from "gray-matter";
import { SkillFrontmatterSchema } from "./loader.js";

export class SkillPackager {
  async pack(_skillName: string, skillDir: string): Promise<Result<Buffer, Error>> {
    const skillMdPath = path.join(skillDir, "SKILL.md");

    let raw: string;
    try {
      raw = await fs.readFile(skillMdPath, "utf-8");
    } catch {
      return err(new Error(`SKILL.md not found at ${skillMdPath}`));
    }

    const parsed = matter(raw);
    const validation = SkillFrontmatterSchema.safeParse(parsed.data);
    if (!validation.success) {
      return err(new Error(`Invalid skill frontmatter: ${validation.error.message}`));
    }

    try {
      const pack = tar.pack();
      const files = await fs.readdir(skillDir);

      for (const file of files) {
        const filePath = path.join(skillDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          const content = await fs.readFile(filePath);
          pack.entry({ name: file, size: content.length }, content);
        }
      }
      pack.finalize();

      const chunks: Buffer[] = [];
      for await (const chunk of Readable.from(pack).pipe(createGzip())) {
        chunks.push(Buffer.from(chunk));
      }

      return ok(Buffer.concat(chunks));
    } catch (error) {
      return err(new Error(`Packaging failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
}
