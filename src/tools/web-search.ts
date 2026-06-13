import type { Tool, ToolContext, ToolResult } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  text: string;
}

// ─── Helpers ────────────────────────────────────────────────────

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No search results found";
  }

  return results.map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.text}`).join("\n\n");
}

// ─── Tool Factory ───────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 25_000;
const DEFAULT_NUM_RESULTS = 8;

export function createWebSearchTool(): Tool {
  return {
    name: "web_search",
    description:
      "Search the web using the Exa API. Returns ranked results with titles, URLs, and text snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query string",
        },
        numResults: {
          type: "number",
          description: `Number of results to return (default ${DEFAULT_NUM_RESULTS})`,
        },
      },
      required: ["query"],
    },
    capabilities: ["NetworkAccess"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { query, numResults } = input as {
        query?: string;
        numResults?: number;
      };

      if (!query || query.trim().length === 0) {
        return {
          
          content: "Error: query is required and must be a non-empty string",
          isError: true,
        };
      }

      const searchUrl = process.env.HIWI_SEARCH_URL ?? "https://api.exa.ai/search";
      const apiKey = process.env.HIWI_SEARCH_KEY ?? "";

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

      try {
        const response = await fetch(searchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-api-key": apiKey } : {}),
          },
          body: JSON.stringify({
            query,
            numResults: numResults ?? DEFAULT_NUM_RESULTS,
            type: "auto",
            contents: {
              text: { maxCharacters: 1000 },
            },
          }),
          signal: ctx.abort ?? controller.signal,
        });

        if (!response.ok) {
          return {
            
            content: `Search API error: ${response.status} ${response.statusText}`,
            isError: true,
          };
        }

        const data = (await response.json()) as {
          results?: Array<{ title?: string; url?: string; text?: string }>;
        };

        const results: SearchResult[] = (data.results ?? []).map((r) => ({
          title: r.title ?? "(untitled)",
          url: r.url ?? "",
          text: r.text ?? "",
        }));

        const preview = query.length > 50 ? `${query.slice(0, 50)}...` : query;

        return {
          
          content: formatSearchResults(results),
          isError: false,
          title: `Search "${preview}" (${results.length} results)`,
          metadata: { resultCount: results.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          
          content: `Search error: ${message}`,
          isError: true,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
