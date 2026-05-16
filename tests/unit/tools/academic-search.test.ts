import { type Paper, createAcademicSearchTool } from "@/tools/academic-search.js";
import type { ToolContext } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Academic Search Tool", () => {
  let tool: ReturnType<typeof createAcademicSearchTool>;
  let ctx: ToolContext;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tool = createAcademicSearchTool();
    ctx = {
      workingDirectory: "/test",
      sessionId: "session-1",
    };

    // Mock fetch
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("academic_search");
    expect(tool.description).toBeDefined();
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.properties.query).toBeDefined();
    expect(tool.inputSchema.required).toContain("query");
  });

  it("searches Semantic Scholar and returns structured papers", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            paperId: "abc123",
            title: "Attention Is All You Need",
            authors: [{ name: "Vaswani" }, { name: "Shazeer" }],
            year: 2017,
            abstract: "The dominant sequence transduction models...",
            citationCount: 95000,
            url: "https://api.semanticscholar.org/abc123",
          },
        ],
      }),
    } as any);

    const result = await tool.execute({ query: "attention mechanism" }, ctx);

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Attention Is All You Need");
    expect(result.content).toContain("2017");
    expect(result.content).toContain("Vaswani");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("handles no results gracefully", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as any);

    const result = await tool.execute({ query: "xyznonexistentquery123" }, ctx);

    expect(result.content).toContain("No papers found");
  });

  it("handles API error gracefully", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as any);

    const result = await tool.execute({ query: "test" }, ctx);

    expect(result.content).toContain("error");
  });

  it("filters by year range", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { paperId: "1", title: "Old Paper", authors: [], year: 2018 },
          { paperId: "2", title: "New Paper", authors: [], year: 2024 },
        ],
      }),
    } as any);

    const result = await tool.execute({ query: "test", yearFrom: 2020, yearTo: 2025 }, ctx);

    expect(result.content).toContain("New Paper");
    expect(result.content).not.toContain("Old Paper");
  });

  it("handles network error gracefully", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Connection timeout"));

    const result = await tool.execute({ query: "test" }, ctx);

    expect(result.content).toContain("Error");
  });
});
