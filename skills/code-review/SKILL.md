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
