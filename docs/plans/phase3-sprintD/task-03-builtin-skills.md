# Task 03: Built-in Skills

**Files:**
- Create: `skills/paper-search/SKILL.md`
- Create: `skills/code-review/SKILL.md`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Skills / Built-in Skills

## Goal

Create two built-in skills that ship with hiwi-agent, demonstrating the skill system and providing immediate value.

## Paper Search Skill

```markdown
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
```

## Code Review Skill

```markdown
---
name: code-review
version: 1.0.0
type: domain
trigger: /review
description: Review code changes in the current project
tools:
  - read_file
  - glob
  - grep
  - bash
---

# Code Review

Review code for quality, security, and correctness issues.

## Instructions

1. If the user specifies a file, read that file
2. If the user specifies "diff" or "changes", run `git diff` to see uncommitted changes
3. If no target specified, run `git diff HEAD~1` to review the last commit
4. Analyze for:
   - **Security**: SQL injection, XSS, command injection, hardcoded secrets
   - **Correctness**: Logic errors, off-by-one, null/undefined access
   - **Performance**: N+1 queries, unnecessary allocations, missing indexes
   - **Style**: Naming, complexity, dead code
5. Rate each finding as: critical / warning / suggestion
6. Provide specific fix suggestions with code snippets
```

## Integration

These skills should be discovered by the existing `SkillLoader` from a `skills/` directory relative to the hiwi-agent installation. The skill loader's discovery paths need to include the built-in skills directory.

## Edge Cases

- Skills directory doesn't exist → create on first run
- Network unavailable for paper search → clear error
- No git repo for code review → report "not a git repository"

## Tests

- Skill loader discovers both built-in skills
- Paper search skill triggers on `/paper`
- Code review skill triggers on `/review`
- Skill frontmatter parses correctly (name, type, tools, trigger)
