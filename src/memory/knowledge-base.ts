import { err, ok } from "neverthrow";
import type { MemoryFileStore } from "./file-store.js";

export interface KnowledgeEntry {
  name: string;
  domain: string;
  pattern: string;
  examples?: string[];
  sources?: string[];
  confidence: number;
}

const DEFAULT_TOP_K = 5;

export class KnowledgeBase {
  constructor(private memoryStore: MemoryFileStore) {}

  async add(
    entry: Omit<KnowledgeEntry, "confidence">,
  ): Promise<import("neverthrow").Result<string, Error>> {
    try {
      const existing = await this.memoryStore.read(entry.name);
      if (existing) {
        const existingDomain = this.parseDomain(existing.content);
        if (existingDomain === entry.domain) {
          return ok(entry.name);
        }
      }

      const content = this.serializeEntry({ ...entry, confidence: 0.5 });
      await this.memoryStore.write(
        entry.name,
        "knowledge",
        `[${entry.domain}] ${entry.pattern.slice(0, 60)}`,
        content,
      );
      return ok(entry.name);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async search(query: string): Promise<import("neverthrow").Result<KnowledgeEntry[], Error>> {
    try {
      const all = await this.memoryStore.list({ type: "knowledge" });
      const queryWords = query.toLowerCase().split(/\s+/);
      const scored = all
        .map((mem) => ({
          entry: this.deserializeEntry(mem),
          score: this.scoreMatch(`${mem.content} ${mem.description}`, queryWords),
        }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);

      return ok(scored.map((s) => s.entry));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async getByDomain(domain: string): Promise<import("neverthrow").Result<KnowledgeEntry[], Error>> {
    try {
      const all = await this.memoryStore.list({ type: "knowledge" });
      const filtered = all.filter((mem) => {
        const parsed = this.deserializeEntry(mem);
        return parsed.domain === domain;
      });
      return ok(filtered.map((mem) => this.deserializeEntry(mem)));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async injectContext(
    query: string,
    topK = DEFAULT_TOP_K,
  ): Promise<import("neverthrow").Result<string, Error>> {
    try {
      const searchResult = await this.search(query);
      if (searchResult.isErr()) return err(searchResult.error);
      const entries = searchResult.value.slice(0, topK);
      if (entries.length === 0) return ok("");

      const lines = entries.map((e) => `- [${e.domain}] ${e.pattern}`);
      return ok(`## Relevant Knowledge\n${lines.join("\n")}`);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private serializeEntry(entry: KnowledgeEntry): string {
    const parts = [`domain: ${entry.domain}`, `pattern: ${entry.pattern}`];
    if (entry.examples?.length) parts.push(`examples: ${entry.examples.join(", ")}`);
    if (entry.sources?.length) parts.push(`sources: ${entry.sources.join(", ")}`);
    parts.push(`confidence: ${entry.confidence}`);
    return parts.join("\n");
  }

  private deserializeEntry(mem: { name: string; content: string }): KnowledgeEntry {
    const lines = mem.content.split("\n");
    const entry: KnowledgeEntry = {
      name: mem.name,
      domain: "",
      pattern: "",
      confidence: 0.5,
    };

    for (const line of lines) {
      if (line.startsWith("domain: ")) entry.domain = line.slice(8);
      else if (line.startsWith("pattern: ")) entry.pattern = line.slice(9);
      else if (line.startsWith("examples: ")) entry.examples = line.slice(10).split(", ");
      else if (line.startsWith("sources: ")) entry.sources = line.slice(9).split(", ");
      else if (line.startsWith("confidence: "))
        entry.confidence = Number.parseFloat(line.slice(12));
    }

    return entry;
  }

  private parseDomain(content: string): string {
    const line = content.split("\n").find((l) => l.startsWith("domain: "));
    return line ? line.slice(8) : "";
  }

  private scoreMatch(text: string, queryWords: string[]): number {
    const lower = text.toLowerCase();
    return queryWords.reduce((score, word) => score + (lower.includes(word) ? 1 : 0), 0);
  }
}
