import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebSearchTool, formatSearchResults } from "@/tools/web-search.js";
import type { Tool, ToolContext } from "@/types.js";

const mockResults = [
  { title: "Result One", url: "https://example.com/1", text: "First result snippet" },
  { title: "Result Two", url: "https://example.com/2", text: "Second result snippet" },
];

function mockFetchResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  } as Response;
}

describe("web_search tool", () => {
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(() => {
    tool = createWebSearchTool();
    ctx = { workingDirectory: "/tmp", sessionId: "test" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("web_search");
    expect(tool.capabilities).toContain("NetworkAccess");
  });

  it("searches and returns formatted results", async () => {
    vi.stubGlobal(
      "fetch",
      () => Promise.resolve(mockFetchResponse({ results: mockResults })),
    );

    const result = await tool.execute({ query: "test query" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Result One");
    expect(result.content).toContain("https://example.com/1");
    expect(result.content).toContain("First result snippet");
  });

  it("sends query in request body", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(mockFetchResponse({ results: [] })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await tool.execute({ query: "hello world" }, ctx);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.query).toBe("hello world");
  });

  it("respects numResults parameter", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(mockFetchResponse({ results: [] })),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await tool.execute({ query: "test", numResults: 5 }, ctx);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.numResults).toBe(5);
  });

  it("returns message when no results found", async () => {
    vi.stubGlobal(
      "fetch",
      () => Promise.resolve(mockFetchResponse({ results: [] })),
    );

    const result = await tool.execute({ query: "obscure query" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("No search results found");
  });

  it("handles API errors (500 response)", async () => {
    vi.stubGlobal(
      "fetch",
      () => Promise.resolve(mockFetchResponse({ error: "Internal Server Error" }, 500)),
    );

    const result = await tool.execute({ query: "test" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("500");
  });

  it("handles network errors (rejected promise)", async () => {
    vi.stubGlobal(
      "fetch",
      () => Promise.reject(new Error("Network connection failed")),
    );

    const result = await tool.execute({ query: "test" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Network connection failed");
  });

  it("validates query is provided (empty input)", async () => {
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("query");
  });

  it("uses search URL from env when HIWI_SEARCH_URL is set", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve(mockFetchResponse({ results: [] })),
    );
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubEnv("HIWI_SEARCH_URL", "https://custom.search.api/v1/search");

    await tool.execute({ query: "test" }, ctx);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://custom.search.api/v1/search");
  });
});

describe("formatSearchResults", () => {
  it("formats results with title, URL, and snippet in numbered markdown format", () => {
    const formatted = formatSearchResults(mockResults);
    expect(formatted).toContain("1.");
    expect(formatted).toContain("Result One");
    expect(formatted).toContain("https://example.com/1");
    expect(formatted).toContain("First result snippet");
    expect(formatted).toContain("2.");
    expect(formatted).toContain("Result Two");
    expect(formatted).toContain("https://example.com/2");
    expect(formatted).toContain("Second result snippet");
  });

  it("returns fallback for empty results", () => {
    const formatted = formatSearchResults([]);
    expect(formatted).toBe("No search results found");
  });
});
