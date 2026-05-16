# Task 06: Git Operations Tool

**Files:**
- Create: `src/tools/git.ts`
- Create: `tests/unit/tools/git.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — Tools / Git

## Goal

Add a dedicated git tool that provides structured git operations instead of raw shell commands. Returns parsed, structured data that the LLM can reason about.

## Interface

```typescript
// src/tools/git.ts

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitLogEntry {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export function createGitTool(): Tool;
```

## Supported Operations

| Action | Git Command | Returns |
|--------|-------------|---------|
| `status` | `git status --porcelain=v2 --branch` | Structured `GitStatus` |
| `diff` | `git diff [target]` | Formatted diff string |
| `log` | `git log --oneline -n <count>` | `GitLogEntry[]` |
| `commit` | `git commit -m <msg>` | Commit hash |
| `add` | `git add <files>` | Confirmation |
| `branch` | `git branch -a` | Branch list |
| `stash` | `git stash list` / `git stash pop` | Stash entries or pop result |

## Tool Schema

```json
{
  "name": "git",
  "description": "Git operations: status, diff, log, commit, add, branch, stash",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["status", "diff", "log", "commit", "add", "branch", "stash"],
        "description": "Git action to perform"
      },
      "target": { "type": "string", "description": "Target ref, file, or message" },
      "count": { "type": "number", "description": "Number of log entries (default: 10)" },
      "files": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Files to add"
      }
    },
    "required": ["action"]
  }
}
```

## Safety

- **commit** and **add** require `normal` permission mode (not auto-approved in `auto` mode)
- **status**, **diff**, **log**, **branch** are read-only (auto-approved)
- **stash** requires confirmation (can lose changes)
- No `push`, `reset --hard`, or `clean` — those must be done via `bash` tool intentionally

## Edge Cases

- Not a git repository → clear error "Run this in a git repository"
- Merge conflicts in status → report conflicted files
- Empty diff → "No changes"
- Commit with no staged changes → "Nothing to commit"
- Detached HEAD → warn in status

## Tests

- Parse status output (staged, unstaged, untracked)
- Format diff output
- Parse log entries
- Commit with message
- Add specific files
- List branches
- Handle non-git directory (error)
- Handle empty diff
- Permission mode enforcement (commit requires normal mode)
