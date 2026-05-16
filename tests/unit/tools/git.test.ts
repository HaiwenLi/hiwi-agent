import { createGitTool, parseGitLog, parseGitStatus } from "@/tools/git.js";
import type { ToolContext } from "@/types.js";
import { describe, expect, it } from "vitest";

describe("createGitTool", () => {
  const tool = createGitTool();
  const ctx: ToolContext = {
    workingDirectory: "/test/repo",
    sessionId: "s1",
  };

  it("has correct tool name and schema", () => {
    expect(tool.name).toBe("git");
    expect(tool.inputSchema.properties.action).toBeDefined();
    expect(tool.inputSchema.required).toContain("action");
  });

  it("has read-only capabilities for status action", () => {
    // The tool itself reports ReadOnly since git status is safe
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("parses git status output", () => {
    const output = [
      "# branch.oid abc123",
      "# branch.head master",
      "# branch.ab +2 -0",
      "? untracked-file.txt",
      "1 .M N... 100644 100644 100644 hash1 hash2 modified.ts",
    ].join("\n");

    const status = parseGitStatus(output);

    expect(status.branch).toBe("master");
    expect(status.ahead).toBe(2);
    expect(status.behind).toBe(0);
    expect(status.untracked).toContain("untracked-file.txt");
    expect(status.unstaged.length).toBeGreaterThan(0);
  });

  it("parses git log output", () => {
    const output = [
      "abc1234 Fix login bug",
      "def5678 Add user module",
      "ghi9012 Initial commit",
    ].join("\n");

    const entries = parseGitLog(output);

    expect(entries).toHaveLength(3);
    expect(entries[0].hash).toBe("abc1234");
    expect(entries[0].message).toBe("Fix login bug");
  });

  it("handles empty git log output", () => {
    const entries = parseGitLog("");
    expect(entries).toHaveLength(0);
  });

  it("handles detached HEAD in status", () => {
    const output = ["# branch.oid abc123", "# branch.head (detached)"].join("\n");

    const status = parseGitStatus(output);

    expect(status.branch).toBe("(detached)");
  });
});
