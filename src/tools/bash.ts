import { execSync, spawnSync, spawn } from "node:child_process";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { TruncationService } from "./truncation.js";

const DEFAULT_TIMEOUT = 120_000;
const TITLE_MAX_LENGTH = 60;

export function createBashTool(truncationDir?: string): Tool {
  const truncation = new TruncationService(
    truncationDir ?? `${process.cwd()}/.hiwi/tmp/truncation`,
  );

  return {
    name: "bash",
    description:
      "Execute a shell command and return its output. Supports timeout, working directory, and output truncation.",
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
      const {
        command,
        timeout = DEFAULT_TIMEOUT,
        workdir,
      } = input as {
        command: string;
        timeout?: number;
        workdir?: string;
      };

      const cwd = workdir
        ? path.isAbsolute(workdir)
          ? workdir
          : path.resolve(ctx.workingDirectory, workdir)
        : ctx.workingDirectory;

      try {
        const result = await runCommand(command, cwd, timeout, ctx.abort);
        const title =
          command.length > TITLE_MAX_LENGTH ? `${command.slice(0, TITLE_MAX_LENGTH)}...` : command;

        if (result.exitCode !== 0) {
          return {
            
            content:
              result.stderr || result.stdout || `Command exited with code ${result.exitCode}`,
            isError: true,
            title: `Bash: ${title}`,
            metadata: { exitCode: result.exitCode },
          };
        }

        const output = result.stdout + (result.stderr ? `\n${result.stderr}` : "");
        const truncated = truncation.truncate(output);

        return {
          
          content: truncated.type === "full" ? truncated.text : truncated.preview,
          isError: false,
          title: `Bash: ${title}`,
          metadata: { exitCode: 0, truncated: truncated.type === "truncated" },
        };
      } catch (error) {
        return {
          
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

export function tryRtkRewrite(
  command: string,
  options?: { rtkPath?: string },
): string {
  if (process.env.RTK_DISABLED === "1") return command;
  const rtkPath = options?.rtkPath ?? "rtk";
  const result = spawnSync(rtkPath, ["rewrite", command], {
    encoding: "utf-8",
    timeout: 2000,
    windowsHide: true,
  });
  if (result.error) return command;
  const stdout = result.stdout?.trim();
  const rewritten = stdout && stdout !== command ? stdout : "";
  return rewritten || command;
}

function runCommand(
  command: string,
  cwd: string,
  timeout: number,
  abort?: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const rewritten = tryRtkRewrite(command);
    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd" : "/bin/bash";
    const shellArgs = isWindows ? ["/c", rewritten] : ["-c", rewritten];

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let resolved = false;

    const doResolve = (result: CommandResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString("utf-8");
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      doResolve({ exitCode: 1, stdout, stderr: `Command timed out after ${timeout}ms` });
    }, timeout);

    if (abort) {
      const onAbort = () => {
        clearTimeout(timer);
        child.kill("SIGTERM");
        doResolve({ exitCode: 1, stdout, stderr: "Command aborted" });
      };
      if (abort.aborted) {
        clearTimeout(timer);
        onAbort();
      } else {
        abort.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.on("close", (code) => {
      clearTimeout(timer);
      doResolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      doResolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}
