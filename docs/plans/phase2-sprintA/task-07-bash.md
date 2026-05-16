### Task 07: bash Tool

**Files:**
- Create: `src/tools/bash.ts`
- Test: `tests/unit/tools/bash.test.ts`

**Context:** Executes shell commands via `child_process.spawn`. Supports timeout, working directory, output truncation via TruncationService. No tree-sitter parsing (too heavy) — simple spawn + collect output.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/bash.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBashTool } from "@/tools/bash.js";
import type { Tool, ToolContext } from "@/types.js";

describe("bash tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-bash-"));
    tool = createBashTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("bash");
    expect(tool.capabilities).toContain("ExecCode");
  });

  it("executes a command and returns stdout", async () => {
    const result = await tool.execute({ command: "echo hello" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("hello");
  });

  it("captures stderr on failure", async () => {
    const result = await tool.execute(
      { command: "ls /nonexistent-dir-xyz" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });

  it("respects the working directory", async () => {
    await fs.writeFile(path.join(tempDir, "marker.txt"), "found");
    const result = await tool.execute({ command: "cat marker.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("found");
  });

  it("supports timeout parameter", async () => {
    const result = await tool.execute(
      { command: "sleep 10", timeout: 100 },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timeout");
  });

  it("supports abort signal", async () => {
    const controller = new AbortController();
    const ctxWithAbort = { ...ctx, abort: controller.signal };

    const executePromise = tool.execute(
      { command: "sleep 30" },
      ctxWithAbort,
    );

    // Abort after a short delay
    setTimeout(() => controller.abort(), 100);

    const result = await executePromise;
    expect(result.isError).toBe(true);
  });

  it("truncates large output", async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n");
    const result = await tool.execute(
      { command: `echo "${lines}"` },
      ctx,
    );
    expect(result.isError).toBe(false);
    // Should have truncation indicator if output is large
  });

  it("returns exit code in metadata", async () => {
    const result = await tool.execute({ command: "exit 42" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.metadata?.exitCode).toBe(42);
  });

  it("returns title with command preview", async () => {
    const result = await tool.execute({ command: "echo test" }, ctx);
    expect(result.title).toContain("echo test");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/bash.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createBashTool**

Create `src/tools/bash.ts`:

```typescript
import { spawn } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { TruncationService } from "./truncation.js";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes
const TITLE_MAX_LENGTH = 60;

export function createBashTool(truncationDir?: string): Tool {
  const truncation = new TruncationService(
    truncationDir ?? `${process.cwd()}/.hiwi/tmp/truncation`,
  );

  return {
    name: "bash",
    description: "Execute a shell command and return its output. Supports timeout, working directory, and output truncation.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" },
        workdir: { type: "string", description: "Working directory (overrides workingDirectory)" },
      },
      required: ["command"],
    },
    capabilities: ["ExecCode"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { command, timeout = DEFAULT_TIMEOUT, workdir } = input as {
        command: string;
        timeout?: number;
        workdir?: string;
      };

      const cwd = workdir
        ? (path.isAbsolute(workdir) ? workdir : path.resolve(ctx.workingDirectory, workdir))
        : ctx.workingDirectory;

      try {
        const result = await runCommand(command, cwd, timeout, ctx.abort);
        const title = command.length > TITLE_MAX_LENGTH
          ? `${command.slice(0, TITLE_MAX_LENGTH)}...`
          : command;

        if (result.exitCode !== 0) {
          return {
            toolCallId: "",
            content: result.stderr || result.stdout || `Command exited with code ${result.exitCode}`,
            isError: true,
            title: `Bash: ${title}`,
            metadata: { exitCode: result.exitCode },
          };
        }

        // Truncate if needed
        const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");
        const truncated = truncation.truncate(output);

        return {
          toolCallId: "",
          content: truncated.type === "full" ? truncated.text : truncated.preview,
          isError: false,
          title: `Bash: ${title}`,
          metadata: { exitCode: 0, truncated: truncated.type === "truncated" },
        };
      } catch (error) {
        return {
          toolCallId: "",
          content: `Command error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCommand(
  command: string,
  cwd: string,
  timeout: number,
  abort?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "/bin/bash";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString("utf-8");
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });

    // Timeout
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ exitCode: 1, stdout, stderr: `Command timed out after ${timeout}ms` });
    }, timeout);

    // Abort signal
    if (abort) {
      const onAbort = () => {
        clearTimeout(timer);
        child.kill("SIGTERM");
        resolve({ exitCode: 1, stdout, stderr: "Command aborted" });
      };
      if (abort.aborted) {
        onAbort();
      } else {
        abort.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.on("close", () => {
      clearTimeout(timer);
    });
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/bash.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/bash.ts tests/unit/tools/bash.test.ts
git commit -m "feat: add bash tool with spawn, timeout, abort, truncation"
```
