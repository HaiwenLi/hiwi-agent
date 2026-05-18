import { type Result, err, ok } from "neverthrow";

export interface Mem0SearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: Record<string, unknown>;
  userId?: string;
  agentId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Mem0AddOptions {
  userId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0SearchOptions {
  userId?: string;
  agentId?: string;
  topK?: number;
  threshold?: number;
}

export interface Mem0GetAllOptions {
  userId?: string;
  agentId?: string;
  page?: number;
  pageSize?: number;
}

export interface Mem0SdkClient {
  add: Function;
  search: Function;
  delete: Function;
  getAll: Function;
}

export interface Mem0OSSConfig {
  embedder: {
    provider: string;
    config: Record<string, unknown>;
  };
  vectorStore: {
    provider: string;
    config: Record<string, unknown>;
  };
  llm?: {
    provider: string;
    config: Record<string, unknown>;
  };
}

export class Mem0Client {
  private client: Mem0SdkClient | null = null;
  private enabled = false;

  constructor(options?: { client?: Mem0SdkClient }) {
    if (options?.client) {
      this.client = options.client;
      this.enabled = true;
    }
  }

  async init(options: { apiKey?: string; host?: string; oss?: Mem0OSSConfig }): Promise<void> {
    if (options.oss) {
      const { Memory } = await import("mem0ai/oss");
      const memory = new Memory(options.oss);
      this.client = {
        add: (messages: unknown, opts?: unknown) =>
          memory.add(
            messages as Parameters<typeof memory.add>[0],
            opts as Parameters<typeof memory.add>[1],
          ),
        search: async (query: string, opts?: unknown) => {
          const results = await memory.search(query, opts as Parameters<typeof memory.search>[1]);
          if (Array.isArray(results)) return { results };
          return results;
        },
        delete: (id: string) => memory.delete(id),
        getAll: (opts?: unknown) => memory.getAll(opts as Parameters<typeof memory.getAll>[0]),
      };
      this.enabled = true;
    } else if (options.apiKey) {
      try {
        const { MemoryClient } = await import("mem0ai");
        this.client = new MemoryClient({
          apiKey: options.apiKey,
          host: options.host,
        }) as Mem0SdkClient;
        this.enabled = true;
      } catch {
        this.client = null;
        this.enabled = false;
      }
    }
  }

  isConnected(): boolean {
    return this.enabled;
  }

  async add(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    options?: Mem0AddOptions,
  ): Promise<Result<boolean, Error>> {
    if (!this.enabled || !this.client) return ok(false);

    try {
      await this.client.add(messages, options);
      return ok(true);
    } catch (error) {
      return err(
        new Error(`mem0 add failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  async search(
    query: string,
    options?: Mem0SearchOptions,
  ): Promise<Result<Mem0SearchResult[], Error>> {
    if (!this.enabled || !this.client) return ok([]);

    try {
      const response = (await this.client.search(query, options)) as {
        results?: Array<{
          id: string;
          memory: string;
          score: number;
          metadata?: Record<string, unknown>;
          userId?: string;
          agentId?: string;
          createdAt?: string;
          updatedAt?: string;
        }>;
      };

      const results = Array.isArray(response) ? response : (response.results ?? []);

      return ok(
        results.map((r) => ({
          id: r.id,
          memory: r.memory,
          score: r.score,
          metadata: r.metadata,
          userId: r.userId,
          agentId: r.agentId,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      );
    } catch (error) {
      return err(
        new Error(`mem0 search failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  async delete(memoryId: string): Promise<Result<boolean, Error>> {
    if (!this.enabled || !this.client) return ok(true);

    try {
      await this.client.delete(memoryId);
      return ok(true);
    } catch (error) {
      return err(
        new Error(`mem0 delete failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  async getAll(options?: Mem0GetAllOptions): Promise<Result<Mem0SearchResult[], Error>> {
    if (!this.enabled || !this.client) return ok([]);

    try {
      const response = (await this.client.getAll(options)) as {
        results?: Array<{
          id: string;
          memory: string;
          score?: number;
          metadata?: Record<string, unknown>;
        }>;
      };

      const results = Array.isArray(response) ? response : (response.results ?? []);

      return ok(
        results.map((r) => ({
          id: r.id,
          memory: r.memory,
          score: r.score ?? 0,
          metadata: r.metadata,
        })),
      );
    } catch (error) {
      return err(
        new Error(`mem0 getAll failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }
}
