import { promises as fs } from "node:fs";
import path from "node:path";
import type { MemoryEntry, MemoryFileStore } from "./file-store.js";

export interface Entity {
  name: string;
  type: "project" | "technology" | "person" | "concept" | "tool" | "file";
  aliases: string[];
}

export interface LinkedMemories {
  primary: MemoryEntry;
  related: Array<{
    memory: MemoryEntry;
    sharedEntities: string[];
    relevanceScore: number;
  }>;
}

interface EntityIndex {
  [entityName: string]: {
    type: Entity["type"];
    aliases: string[];
    memories: string[];
  };
}

const ALIAS_MAP: Record<string, string> = {
  TS: "TypeScript",
  ts: "TypeScript",
  JS: "JavaScript",
  js: "JavaScript",
  ReactJS: "React",
  "react.js": "React",
  Py: "Python",
  Go: "Go",
  Golang: "Go",
  golang: "Go",
  k8s: "Kubernetes",
  K8s: "Kubernetes",
  tsx: "TSX",
  jsx: "JSX",
};

const TECH_TERMS = new Set([
  "TypeScript",
  "JavaScript",
  "React",
  "Vue",
  "Angular",
  "Svelte",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C#",
  "Ruby",
  "PHP",
  "Node",
  "Deno",
  "Bun",
  "vitest",
  "jest",
  "mocha",
  "pytest",
  "docker",
  "Docker",
  "Kubernetes",
  "git",
  "Git",
  "npm",
  "pnpm",
  "yarn",
  "ESLint",
  "Prettier",
  "Biome",
  "SQLite",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "OpenAI",
  "Anthropic",
  "ModelAdapter",
]);

const FILE_PATTERN = /(?:src|lib|test|tests|docs|config)\/[\w./-]+\.\w+/g;
const CAPPED_WORD_PATTERN = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b/g;

function resolveAlias(name: string): string {
  return ALIAS_MAP[name] ?? name;
}

export class EntityLinker {
  private indexPath: string;

  constructor(private memoryStore: MemoryFileStore) {
    // biome-ignore lint/complexity/useLiteralKeys: basePath is private
    this.indexPath = path.join(memoryStore["basePath"], "entities.json");
  }

  async extractEntities(text: string): Promise<Entity[]> {
    const found = new Map<string, Entity>();

    for (const match of text.matchAll(FILE_PATTERN)) {
      const name = match[0];
      found.set(name, { name, type: "file", aliases: [] });
    }

    for (const term of TECH_TERMS) {
      if (text.includes(term)) {
        const resolved = resolveAlias(term);
        if (!found.has(resolved)) {
          found.set(resolved, { name: resolved, type: "technology", aliases: [] });
        }
      }
    }

    const wordPattern = /\b[A-Za-z]+\b/g;
    for (const match of text.matchAll(wordPattern)) {
      const word = match[0];
      const resolved = resolveAlias(word);
      if (resolved !== word && TECH_TERMS.has(resolved)) {
        if (!found.has(resolved)) {
          found.set(resolved, {
            name: resolved,
            type: "technology",
            aliases: getAliases(resolved),
          });
        }
      }
    }

    for (const match of text.matchAll(CAPPED_WORD_PATTERN)) {
      const word = match[0];
      const resolved = resolveAlias(word);
      if (TECH_TERMS.has(resolved)) {
        if (!found.has(resolved)) {
          found.set(resolved, {
            name: resolved,
            type: "technology",
            aliases: getAliases(resolved),
          });
        }
      }
    }

    return Array.from(found.values());
  }

  async updateIndex(memoryName: string, content: string): Promise<void> {
    const index = await this.readIndex();
    const entities = await this.extractEntities(content);

    for (const entity of entities) {
      if (!index[entity.name]) {
        index[entity.name] = {
          type: entity.type,
          aliases: entity.aliases,
          memories: [],
        };
      }
      if (!index[entity.name].memories.includes(memoryName)) {
        index[entity.name].memories.push(memoryName);
      }
    }

    await this.writeIndex(index);
  }

  async removeFromIndex(memoryName: string): Promise<void> {
    const index = await this.readIndex();

    for (const entityName of Object.keys(index)) {
      index[entityName].memories = index[entityName].memories.filter((m) => m !== memoryName);
      if (index[entityName].memories.length === 0) {
        delete index[entityName];
      }
    }

    await this.writeIndex(index);
  }

  async findByEntity(entityName: string): Promise<MemoryEntry[]> {
    const index = await this.readIndex();
    const entry = index[resolveAlias(entityName)];
    if (!entry) return [];

    const results: MemoryEntry[] = [];
    for (const memName of entry.memories) {
      const mem = await this.memoryStore.read(memName);
      if (mem) results.push(mem);
    }
    return results;
  }

  async link(memoryName: string): Promise<LinkedMemories> {
    const primary = await this.memoryStore.read(memoryName);
    if (!primary) {
      throw new Error(`Memory not found: ${memoryName}`);
    }

    const index = await this.readIndex();
    const primaryEntities = new Set<string>();

    for (const [entityName, entry] of Object.entries(index)) {
      if (entry.memories.includes(memoryName)) {
        primaryEntities.add(entityName);
      }
    }

    const relatedMap = new Map<string, { memory: MemoryEntry; sharedEntities: string[] }>();

    for (const entityName of primaryEntities) {
      const entry = index[entityName];
      if (!entry) continue;

      for (const otherName of entry.memories) {
        if (otherName === memoryName) continue;
        if (relatedMap.has(otherName)) {
          relatedMap.get(otherName)?.sharedEntities.push(entityName);
        } else {
          const mem = await this.memoryStore.read(otherName);
          if (mem) {
            relatedMap.set(otherName, { memory: mem, sharedEntities: [entityName] });
          }
        }
      }
    }

    const related = Array.from(relatedMap.values()).map((r) => ({
      memory: r.memory,
      sharedEntities: r.sharedEntities,
      relevanceScore: r.sharedEntities.length / Math.max(primaryEntities.size, 1),
    }));

    return { primary, related };
  }

  async rebuildIndex(): Promise<void> {
    const memories = await this.memoryStore.list();
    const index: EntityIndex = {};

    for (const mem of memories) {
      const entities = await this.extractEntities(mem.content);
      for (const entity of entities) {
        if (!index[entity.name]) {
          index[entity.name] = {
            type: entity.type,
            aliases: entity.aliases,
            memories: [],
          };
        }
        if (!index[entity.name].memories.includes(mem.name)) {
          index[entity.name].memories.push(mem.name);
        }
      }
    }

    await this.writeIndex(index);
  }

  private async readIndex(): Promise<EntityIndex> {
    try {
      const raw = await fs.readFile(this.indexPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async writeIndex(index: EntityIndex): Promise<void> {
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
  }
}

function getAliases(resolved: string): string[] {
  const aliases: string[] = [];
  for (const [alias, target] of Object.entries(ALIAS_MAP)) {
    if (target === resolved) aliases.push(alias);
  }
  return aliases;
}
