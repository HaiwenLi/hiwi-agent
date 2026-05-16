### Task 03: web_search Tool

**Files:**
- Create: `src/tools/web-search.ts`
- Test: `tests/unit/tools/web-search.test.ts`

**Context:** Web search via Exa or custom MCP-style search APIs. Ported from OpenCode `websearch.ts` + `mcp-websearch.ts`. Simplified to a single provider with configurable URL + API key. Provider is selected from config or env var `HIWI_SEARCH_PROVIDER`.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/web-search.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebSearchTool, formatSearchResults } from "@/tools/web-search.js";
import type { Tool, ToolContext } from "@/types.js";

describe("web_search tool", () => {
  const tool = createWebSearchTool();

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("web_search");
    expect(tool.capabilities).toContain("NetworkAccess");
  });

  it("searches and returns formatted results", async () => {
    const mockResults = {
      results: [
        { title: "Result 1", url: "https://a.com", text: "Snippet 1" },
        { title: "Result 2", url: "https://b.com", text: "Snippet 2" },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
      headers: new Headers(),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ query: "test query" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Result 1");
    expect(result.content).toContain("https://a.com");
    vi.restoreAllMocks();
  });

  it("sends query in request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", mockFetch);

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    await tool.execute({ query: "hello world" }, ctx);
    expect(mockFetch).toHaveBeenCalled();
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.query ?? callBody.objective).toContain("hello");
    vi.restoreAllMocks();
  });

  it("respects numResults parameter", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", mockFetch);

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    await tool.execute({ query: "test", numResults: 5 }, ctx);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.numResults ?? callBody.num_results).toBe(5);
    vi.restoreAllMocks();
  });

  it("returns message when no results found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
      headers: new Headers(),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ query: "obscure" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("No search results");
    vi.restoreAllMocks();
  });

  it("handles API errors gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers(),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ query: "test" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("500");
    vi.restoreAllMocks();
  });

  it("handles network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ query: "test" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Network error");
    vi.restoreAllMocks();
  });

  it("validates query is provided", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("query");
  });

  it("uses search URL from env when available", async () => {
    process.env.HIWI_SEARCH_URL = "https://custom-search.api/search";
    process.env.HIWI_SEARCH_KEY = "test-key";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", mockFetch);

    const customTool = createWebSearchTool();
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    await customTool.execute({ query: "test" }, ctx);
    expect(mockFetch.mock.calls[0][0]).toBe("https://custom-search.api/search");

    delete process.env.HIWI_SEARCH_URL;
    delete process.env.HIWI_SEARCH_KEY;
    vi.restoreAllMocks();
  });
});

describe("formatSearchResults", () => {
  it("formats results with title, URL, and snippet", () => {
    const results = formatSearchResults([
      { title: "Test", url: "https://example.com", text: "A snippet" },
    ]);
    expect(results).toContain("Test");
    expect(results).toContain("https://example.com");
    expect(results).toContain("A snippet");
  });

  it("returns fallback for empty results", () => {
    expect(formatSearchResults([])).toContain("No search results");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/web-search.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createWebSearchTool**

Create `src/tools/web-search.ts`:

```typescript
import type { Tool, ToolContext, ToolResult } from "../types.js";

interface SearchResult {
  title: string;
  url: string;
  text: string;
}

const DEFAULT_SEARCH_URL = "https://api.exa.ai/search";
const REQUEST_TIMEOUT = 25_000;

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No search results found";

  return results
    .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.text}`)
    .join("\n\n");
}

export function createWebSearchTool(): Tool {
  return {
    name: "web_search",
    description:
      "Search the web and return formatted results with titles, URLs, and snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        numResults: {
          type: "number",
          description: "Number of results. Defaults to 8.",
        },
      },
      required: ["query"],
    },
    capabilities: ["NetworkAccess"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { query, numResults = 8 } = input as {
        query?: string;
        numResults?: number;
      };

      if (!query) {
        return {
          toolCallId: "",
          content: "Missing required parameter: query",
          isError: true,
        };
      }

      const searchUrl = process.env.HIWI_SEARCH_URL ?? DEFAULT_SEARCH_URL;
      const apiKey = process.env.HIWI_SEARCH_KEY ?? "";

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json",
        };
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
          headers["x-api-key"] = apiKey;
        }

        const response = await fetch(searchUrl, {
          method: "POST",
          signal: controller.signal,
          headers,
          body: JSON.stringify({
            query,
            numResults,
            type: "auto",
            contents: { text: { maxCharacters: 1000 } },
          }),
        });

        if (!response.ok) {
          return {
            toolCallId: "",
            content: `Search API error: ${response.status} ${response.statusText}`,
            isError: true,
          };
        }

        const data = await response.json();
        const results: SearchResult[] = (data.results ?? []).map(
          (r: Record<string, string>) => ({
            title: r.title ?? "Untitled",
            url: r.url ?? "",
            text: r.text ?? "",
          }),
        );

        return {
          toolCallId: "",
          content: formatSearchResults(results),
          isError: false,
          title: `Search: ${query.slice(0, 50)}`,
          metadata: { provider: "exa", resultCount: results.length },
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return { toolCallId: "", content: "Search request timed out", isError: true };
        }
        return {
          toolCallId: "",
          content: `Search error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/web-search.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/web-search.ts tests/unit/tools/web-search.test.ts
git commit -m "feat: add web_search tool with Exa API integration"
```
