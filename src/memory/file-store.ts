import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface MemoryEntry {
  name: string;
  type: string;
  description: string;
  content: string;
  created: string;
  updated: string;
}

export interface ListOptions {
  type?: string;
}

const INDEX_HEADER = "# Memory Index\n\n";
const MAX_INDEX_LINES = 200;

export class MemoryFileStore {
  private basePath: string;
  private initialized = false;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.basePath, { recursive: true });
    const indexPath = path.join(this.basePath, "MEMORY.md");
    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, INDEX_HEADER, "utf-8");
    }
    this.initialized = true;
  }

  async readIndex(): Promise<string> {
    const indexPath = path.join(this.basePath, "MEMORY.md");
    return fs.readFile(indexPath, "utf-8");
  }

  async write(name: string, type: string, description: string, content: string): Promise<void> {
    await this.init();
    const filePath = path.join(this.basePath, `${name}.md`);
    const now = new Date().toISOString();

    let created = now;
    try {
      const existing = await fs.readFile(filePath, "utf-8");
      const parsed = matter(existing);
      if (parsed.data.created) created = parsed.data.created;
    } catch {
      // new file
    }

    const frontmatter = {
      name,
      description,
      type,
      created,
      updated: now,
    };

    const fileContent = matter.stringify(content, frontmatter);
    await fs.writeFile(filePath, fileContent, "utf-8");

    await this.rebuildIndex();
  }

  async read(name: string): Promise<MemoryEntry | null> {
    const filePath = path.join(this.basePath, `${name}.md`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = matter(raw);
      return {
        name: parsed.data.name ?? name,
        type: parsed.data.type ?? "unknown",
        description: parsed.data.description ?? "",
        content: parsed.content.trim(),
        created: parsed.data.created ?? "",
        updated: parsed.data.updated ?? "",
      };
    } catch {
      return null;
    }
  }

  async delete(name: string): Promise<void> {
    const filePath = path.join(this.basePath, `${name}.md`);
    try {
      await fs.unlink(filePath);
      await this.rebuildIndex();
    } catch {
      // already deleted
    }
  }

  async list(options?: ListOptions): Promise<MemoryEntry[]> {
    await this.init();
    const files = await fs.readdir(this.basePath);
    const mdFiles = files.filter((f) => f.endsWith(".md") && f !== "MEMORY.md");

    const entries: MemoryEntry[] = [];
    for (const file of mdFiles) {
      const name = file.replace(/\.md$/, "");
      const entry = await this.read(name);
      if (entry && (!options?.type || entry.type === options.type)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  private async rebuildIndex(): Promise<void> {
    const entries = await this.list();
    const lines = entries.map((e) => `- [${e.name}](${e.name}.md) — ${e.description}`);

    const truncated = lines.slice(0, MAX_INDEX_LINES);
    const content = `${INDEX_HEADER}${truncated.join("\n")}\n`;

    const indexPath = path.join(this.basePath, "MEMORY.md");
    await fs.writeFile(indexPath, content, "utf-8");
  }
}
