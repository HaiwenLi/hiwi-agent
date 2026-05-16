# Task 03: Academic Search Tool

**Files:**
- Create: `src/tools/academic-search.ts`
- Create: `tests/unit/tools/academic-search.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Tools / Academic

## Goal

Add a built-in tool for searching academic papers via Semantic Scholar and arXiv APIs. Provides structured results with titles, authors, abstracts, and citation counts.

## Interface

```typescript
// src/tools/academic-search.ts

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

export interface AcademicSearchOptions {
  query: string;
  limit?: number;          // default 5
  source?: "all" | "semantic-scholar" | "arxiv";  // default "all"
  yearFrom?: number;
  yearTo?: number;
}

export function createAcademicSearchTool(): Tool;
```

## Behavior

1. Parse search query from tool input
2. Search Semantic Scholar API:
   - `GET https://api.semanticscholar.org/graph/v1/paper/search`
   - Fields: title, authors, year, abstract, citationCount, url
3. Optionally search arXiv API:
   - `GET http://export.arxiv.org/api/query`
   - Parse Atom XML response
4. Merge and rank results by citation count + relevance
5. Return formatted results

## Tool Schema

```json
{
  "name": "academic_search",
  "description": "Search academic papers from Semantic Scholar and arXiv",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Search query" },
      "limit": { "type": "number", "description": "Max results (default: 5)" },
      "source": { "type": "string", "enum": ["all", "semantic-scholar", "arxiv"] },
      "yearFrom": { "type": "number" },
      "yearTo": { "type": "number" }
    },
    "required": ["query"]
  }
}
```

## Edge Cases

- API rate limiting (Semantic Scholar: 100 req/5min for unauthenticated) → cache results, show rate limit message
- arXiv XML parsing errors → fallback to basic text extraction
- No results found → suggest broader query
- Network timeout (10s) → report timeout with partial results if available

## Tests

- Search Semantic Scholar and parse results
- Search arXiv and parse XML
- Merge results from both sources
- Filter by year range
- Handle API rate limiting
- Handle no results gracefully
- Handle network timeout
