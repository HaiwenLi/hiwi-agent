import { type Result, err, ok } from "neverthrow";
import type { MemoryEntry, MemoryFileStore } from "./file-store.js";
import type { Mem0Client } from "./mem0-client.js";

export interface RecallOptions {
  type?: string;
  limit?: number;
}

export interface MergedMemoryResult {
  name: string;
  type: string;
  description: string;
  content: string;
  score: number;
  source: "file" | "mem0";
}

export class MemoryManager {
  private fileStore: MemoryFileStore;
  private mem0: Mem0Client;

  constructor(fileStore: MemoryFileStore, mem0: Mem0Client) {
    this.fileStore = fileStore;
    this.mem0 = mem0;
  }

  async remember(
    name: string,
    type: string,
    description: string,
    content: string,
  ): Promise<Result<boolean, Error>> {
    try {
      await this.fileStore.write(name, type, description, content);

      if (this.mem0.isConnected()) {
        await this.mem0.add([{ role: "user", content }], { metadata: { name, type, description } });
      }

      return ok(true);
    } catch (error) {
      return err(
        new Error(
          `Failed to save memory: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async recall(
    query: string,
    options?: RecallOptions,
  ): Promise<Result<MergedMemoryResult[], Error>> {
    try {
      const results: MergedMemoryResult[] = [];
      const seen = new Set<string>();

      const allEntries = await this.fileStore.list({ type: options?.type });
      const queryLower = query.toLowerCase();
      for (const entry of allEntries) {
        const text = `${entry.name} ${entry.description} ${entry.content}`.toLowerCase();
        if (text.includes(queryLower)) {
          if (!seen.has(entry.name)) {
            seen.add(entry.name);
            results.push({
              name: entry.name,
              type: entry.type,
              description: entry.description,
              content: entry.content,
              score: 1.0,
              source: "file",
            });
          }
        }
      }

      if (this.mem0.isConnected()) {
        const mem0Result = await this.mem0.search(query, { topK: options?.limit ?? 10 });
        if (mem0Result.isOk()) {
          for (const r of mem0Result.value) {
            const key = r.memory.slice(0, 50);
            if (!seen.has(key)) {
              seen.add(key);
              results.push({
                name: (r.metadata?.name as string) ?? r.id,
                type: (r.metadata?.type as string) ?? "unknown",
                description: r.memory.slice(0, 100),
                content: r.memory,
                score: r.score,
                source: "mem0",
              });
            }
          }
        }
      }

      results.sort((a, b) => {
        if (a.source === "file" && b.source !== "file") return -1;
        if (a.source !== "file" && b.source === "file") return 1;
        return b.score - a.score;
      });

      return ok(results.slice(0, options?.limit ?? 10));
    } catch (error) {
      return err(
        new Error(
          `Memory recall failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async forget(name: string): Promise<Result<boolean, Error>> {
    try {
      const entry = await this.fileStore.read(name);
      if (!entry) {
        return err(new Error(`Memory not found: ${name}`));
      }
      await this.fileStore.delete(name);
      return ok(true);
    } catch (error) {
      return err(
        new Error(
          `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  async getSystemContext(): Promise<string> {
    return this.fileStore.readIndex();
  }

  async list(): Promise<Result<MemoryEntry[], Error>> {
    try {
      const entries = await this.fileStore.list();
      return ok(entries);
    } catch (error) {
      return err(
        new Error(
          `Failed to list memories: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }
}
