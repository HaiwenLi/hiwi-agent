---
name: paper-search
version: 1.0.0
type: domain
trigger: /paper
description: Search academic papers from Semantic Scholar and arXiv
tools:
  - web_fetch
  - web_search
---

# Paper Search

Search for academic papers and return structured results.

## Instructions

1. Parse the user's query for research topic, author, or paper title
2. Search Semantic Scholar API: `https://api.semanticscholar.org/graph/v1/paper/search?query={topic}&limit=5&fields=title,authors,year,abstract,citationCount,url`
3. If the query mentions "arxiv" or "preprint", also search arXiv API: `http://export.arxiv.org/api/query?search_query=all:{topic}&max_results=5`
4. Format results as:
   - **Title** (Year) — Authors
   - Citations: N
   - Abstract: first 200 chars...
   - URL
5. If user asks for "summary" or "explain", fetch the full paper URL and provide a structured summary
