import { Mem0Client } from "@/memory/mem0-client.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

function createMockSdkClient() {
  return {
    add: vi
      .fn()
      .mockResolvedValue([{ id: "mem-1", memory: "John is a TS developer", event: "ADD" }]),
    search: vi.fn().mockResolvedValue({
      results: [
        { id: "mem-1", memory: "John is a TS developer", score: 0.95, metadata: { type: "user" } },
      ],
    }),
    delete: vi.fn().mockResolvedValue({ message: "Memory deleted" }),
    getAll: vi.fn().mockResolvedValue({
      results: [{ id: "mem-1", memory: "John is a TS developer", metadata: {} }],
    }),
  };
}

describe("Mem0Client", () => {
  let client: Mem0Client;
  let mockSdk: ReturnType<typeof createMockSdkClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSdk = createMockSdkClient();
  });

  it("creates client with injected SDK client", () => {
    client = new Mem0Client({ client: mockSdk });
    expect(client.isConnected()).toBe(true);
  });

  it("creates client disabled when no client and no apiKey", () => {
    client = new Mem0Client({ apiKey: undefined });
    expect(client.isConnected()).toBe(false);
  });

  describe("add", () => {
    it("adds a memory via message array", async () => {
      client = new Mem0Client({ client: mockSdk });
      const result = await client.add(
        [{ role: "user", content: "John is a TypeScript developer" }],
        { userId: "user-1", metadata: { type: "user" } },
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    it("passes correct args to SDK add()", async () => {
      client = new Mem0Client({ client: mockSdk });
      await client.add([{ role: "user", content: "test content" }], {
        userId: "user-1",
        metadata: { type: "knowledge" },
      });
      expect(mockSdk.add).toHaveBeenCalledWith([{ role: "user", content: "test content" }], {
        userId: "user-1",
        metadata: { type: "knowledge" },
      });
    });

    it("returns ok(false) when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.add([{ role: "user", content: "test" }]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });
  });

  describe("search", () => {
    it("searches and returns normalized results", async () => {
      client = new Mem0Client({ client: mockSdk });
      const result = await client.search("TypeScript projects", {
        userId: "user-1",
        topK: 5,
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].id).toBe("mem-1");
        expect(result.value[0].score).toBe(0.95);
      }
    });

    it("passes correct args to SDK search()", async () => {
      client = new Mem0Client({ client: mockSdk });
      await client.search("test query", { userId: "user-1", topK: 5 });
      expect(mockSdk.search).toHaveBeenCalledWith("test query", { userId: "user-1", topK: 5 });
    });

    it("returns empty array when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.search("test query");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe("delete", () => {
    it("deletes a memory by id string", async () => {
      client = new Mem0Client({ client: mockSdk });
      const result = await client.delete("mem-id-123");
      expect(result.isOk()).toBe(true);
    });

    it("passes id string directly to SDK", async () => {
      client = new Mem0Client({ client: mockSdk });
      await client.delete("mem-id-123");
      expect(mockSdk.delete).toHaveBeenCalledWith("mem-id-123");
    });

    it("returns ok when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.delete("mem-id-123");
      expect(result.isOk()).toBe(true);
    });
  });

  describe("getAll", () => {
    it("lists all memories with pagination", async () => {
      client = new Mem0Client({ client: mockSdk });
      const result = await client.getAll({ userId: "user-1" });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
      }
    });

    it("returns empty array when mem0 is disabled", async () => {
      client = new Mem0Client({ apiKey: undefined });
      const result = await client.getAll({ userId: "user-1" });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  it("handles SDK errors gracefully", async () => {
    mockSdk.search.mockRejectedValueOnce(new Error("Network error"));
    client = new Mem0Client({ client: mockSdk });
    const result = await client.search("query");
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("mem0 search failed");
    }
  });
});
