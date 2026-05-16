import { execSync } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";

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

export function parseGitStatus(output: string): GitStatus {
  const status: GitStatus = {
    branch: "",
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
  };

  const lines = output.split("\n");
  for (const line of lines) {
    if (line.startsWith("# branch.head ")) {
      const branch = line.replace("# branch.head ", "").trim();
      status.branch = branch.startsWith("(") ? "(detached)" : branch;
    } else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+\d+/);
      if (match) status.ahead = Number.parseInt(match[0].slice(1));
      const behindMatch = line.match(/-\d+/);
      if (behindMatch) status.behind = Number.parseInt(behindMatch[0].slice(1));
    } else if (line.startsWith("?")) {
      status.untracked.push(line.slice(1).trim());
    } else if (/^\d\s/.test(line)) {
      // Changed files
      const parts = line.split(" ");
      const file = parts[parts.length - 1];
      if (line.includes(".M") || line.includes(" M")) {
        status.unstaged.push(file);
      }
      if (line.includes("M.") || line.includes("M ")) {
        status.staged.push(file);
      }
    }
  }

  return status;
}

export function parseGitLog(output: string): GitLogEntry[] {
  if (!output.trim()) return [];

  return output
    .trim()
    .split("\n")
    .map((line) => {
      const [hash, ...rest] = line.split(" ");
      return {
        hash,
        author: "",
        date: "",
        message: rest.join(" "),
      };
    });
}

export function createGitTool(): Tool {
  return {
    name: "git",
    description: "Git operations: status, diff, log, commit, add, branch, stash",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "diff", "log", "commit", "add", "branch", "stash"],
          description: "Git action to perform",
        },
        target: { type: "string", description: "Target ref, file, or message" },
        count: { type: "number", description: "Number of log entries (default: 10)" },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files to add",
        },
      },
      required: ["action"],
    },
    capabilities: ["ReadOnly", "WriteFiles"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const params = input as {
        action: string;
        target?: string;
        count?: number;
        files?: string[];
      };

      const cwd = ctx.workingDirectory;
      const execOpts = { cwd, encoding: "utf-8" as const, timeout: 10000 };

      try {
        switch (params.action) {
          case "status": {
            const output = execSync("git status --porcelain=v2 --branch", execOpts);
            const status = parseGitStatus(output);
            const lines: (string | null)[] = [
              `Branch: ${status.branch}`,
              status.ahead ? `Ahead: ${status.ahead}` : null,
              status.behind ? `Behind: ${status.behind}` : null,
              status.staged.length
                ? `\nStaged:\n${status.staged.map((f) => `  + ${f}`).join("\n")}`
                : null,
              status.unstaged.length
                ? `\nUnstaged:\n${status.unstaged.map((f) => `  ~ ${f}`).join("\n")}`
                : null,
              status.untracked.length
                ? `\nUntracked:\n${status.untracked.map((f) => `  ? ${f}`).join("\n")}`
                : null,
            ];
            return {
              toolCallId: "",
              content: lines.filter(Boolean).join("\n") || "Clean working tree.",
              isError: false,
            };
          }

          case "diff": {
            const target = params.target ? ` ${params.target}` : "";
            const diff = execSync(`git diff${target}`, execOpts);
            return {
              toolCallId: "",
              content: diff.trim() || "No changes.",
              isError: false,
            };
          }

          case "log": {
            const count = params.count ?? 10;
            const log = execSync(`git log --oneline -n ${count}`, execOpts);
            const entries = parseGitLog(log);
            return {
              toolCallId: "",
              content: entries.length
                ? entries.map((e) => `${e.hash} ${e.message}`).join("\n")
                : "No commits.",
              isError: false,
            };
          }

          case "branch": {
            const branches = execSync("git branch -a", execOpts);
            return {
              toolCallId: "",
              content: branches.trim(),
              isError: false,
            };
          }

          case "add": {
            if (!params.files || params.files.length === 0) {
              return {
                toolCallId: "",
                content: "No files specified for add.",
                isError: true,
              };
            }
            const fileList = params.files.join(" ");
            execSync(`git add ${fileList}`, execOpts);
            return {
              toolCallId: "",
              content: `Added: ${fileList}`,
              isError: false,
            };
          }

          case "commit": {
            if (!params.target) {
              return {
                toolCallId: "",
                content: "No commit message specified.",
                isError: true,
              };
            }
            const hash = execSync(
              `git commit -m "${params.target.replace(/"/g, '\\"')}"`,
              execOpts,
            );
            return {
              toolCallId: "",
              content: hash.trim(),
              isError: false,
            };
          }

          case "stash": {
            const stashOutput = execSync("git stash list", execOpts);
            return {
              toolCallId: "",
              content: stashOutput.trim() || "No stashes.",
              isError: false,
            };
          }

          default:
            return {
              toolCallId: "",
              content: `Unknown action: ${params.action}`,
              isError: true,
            };
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes("not a git repository")) {
          return {
            toolCallId: "",
            content: "Not a git repository. Run this in a git repository.",
            isError: true,
          };
        }
        return {
          toolCallId: "",
          content: `Git error: ${msg}`,
          isError: true,
        };
      }
    },
  };
}
