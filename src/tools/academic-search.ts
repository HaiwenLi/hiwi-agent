import type { Tool, ToolContext, ToolResult } from "../types.js";

export interface Paper {
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  citationCount: number;
  url: string;
  source: "semantic-scholar" | "arxiv";
  arxivId?: string;
}

export function createAcademicSearchTool(): Tool {
  return {
    name: "academic_search",
    description: "Search academic papers from Semantic Scholar and arXiv",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default: 5)" },
        source: { type: "string", enum: ["all", "semantic-scholar", "arxiv"] },
        yearFrom: { type: "number" },
        yearTo: { type: "number" },
      },
      required: ["query"],
    },
    capabilities: ["ReadOnly", "Network"],

    async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
      const params = input as {
        query: string;
        limit?: number;
        source?: string;
        yearFrom?: number;
        yearTo?: number;
      };

      const query = encodeURIComponent(params.query);
      const limit = params.limit ?? 5;
      const yearFrom = params.yearFrom;
      const yearTo = params.yearTo;

      try {
        const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${query}&limit=${limit}&fields=title,authors,year,abstract,citationCount,url`;
        const response = await fetch(url);

        if (!response.ok) {
          return {
            
            content: `Semantic Scholar API error: HTTP ${response.status}`,
            isError: true,
          };
        }

        const data = (await response.json()) as {
          data?: Array<{
            paperId: string;
            title: string;
            authors?: Array<{ name: string }>;
            year?: number;
            abstract?: string;
            citationCount?: number;
            url?: string;
          }>;
        };

        const papers = data.data ?? [];
        if (papers.length === 0) {
          return {
            
            content: "No papers found. Try a broader query.",
            isError: false,
          };
        }

        let filtered = papers.map((p) => ({
          title: p.title ?? "Unknown",
          authors: (p.authors ?? []).map((a) => a.name),
          year: p.year ?? 0,
          abstract: (p.abstract ?? "").slice(0, 200),
          citationCount: p.citationCount ?? 0,
          url: p.url ?? `https://api.semanticscholar.org/${p.paperId}`,
          source: "semantic-scholar" as const,
        }));

        if (yearFrom !== undefined) {
          filtered = filtered.filter((p) => p.year >= yearFrom);
        }
        if (yearTo !== undefined) {
          filtered = filtered.filter((p) => p.year <= yearTo);
        }

        const lines = filtered.map((p) => {
          const parts: string[] = [];
          parts.push(`**${p.title}** (${p.year}) — ${p.authors.join(", ")}`);
          parts.push(`  Citations: ${p.citationCount}`);
          parts.push(`  ${p.abstract.slice(0, 200)}`);
          parts.push(`  URL: ${p.url}`);
          return parts.join("\n");
        });

        return {
          
          content: lines.join("\n\n"),
          isError: false,
        };
      } catch (error) {
        return {
          
          content: `Error searching papers: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
