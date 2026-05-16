import { type ChildProcess, spawn } from "node:child_process";
import type { Tool, ToolContext, ToolResult } from "../types.js";

interface BackgroundTask {
  id: string;
  process: ChildProcess;
  command: string;
  status: "running" | "completed" | "failed" | "stopped";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startTime: number;
}

const tasks = new Map<string, BackgroundTask>();
const CLEANUP_DELAY = 5 * 60 * 1000; // 5 minutes

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function scheduleCleanup(taskId: string): void {
  setTimeout(() => {
    const task = tasks.get(taskId);
    if (task && task.status !== "running") {
      tasks.delete(taskId);
    }
  }, CLEANUP_DELAY);
}

export function createTaskTool(): Tool {
  return {
    name: "task",
    description:
      "Run shell commands in the background. Start a command, check its status, retrieve output, or stop it. Use this for long-running operations that you want to monitor asynchronously.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute (required for 'start' action)",
        },
        taskId: {
          type: "string",
          description:
            "Task ID: omit to start a new task, provide an existing ID to check status/output/stop",
        },
        action: {
          type: "string",
          enum: ["start", "status", "output", "stop"],
          description:
            "Action to perform: 'start' runs a new command, 'status' checks if done, 'output' retrieves stdout, 'stop' kills the process. Defaults to 'start' for new tasks or 'status' for existing ones.",
        },
        offset: {
          type: "number",
          description: "Character offset for incremental output reading (only for 'output' action)",
        },
      },
      required: [],
    },
    capabilities: ["ExecCode"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const {
        command,
        taskId,
        action,
        offset = 0,
      } = (input as {
        command?: string;
        taskId?: string;
        action?: string;
        offset?: number;
      }) ?? {};

      // Determine the effective action
      const effectiveAction = action ?? (taskId ? "status" : "start");

      switch (effectiveAction) {
        case "start": {
          if (!command) {
            return {
              toolCallId: "",
              content: "Error: 'command' parameter is required for 'start' action.",
              isError: true,
            };
          }

          const id = taskId ?? generateTaskId();

          // Clean up any previous task with same ID
          const existing = tasks.get(id);
          if (existing) {
            try {
              existing.process.kill();
            } catch {
              /* ignore */
            }
            tasks.delete(id);
          }

          const child = spawn(command, {
            shell: true,
            cwd: ctx.workingDirectory,
            env: process.env,
            stdio: "pipe",
          });

          const bgTask: BackgroundTask = {
            id,
            process: child,
            command,
            status: "running",
            stdout: "",
            stderr: "",
            exitCode: null,
            startTime: Date.now(),
          };

          child.stdout?.on("data", (data: Buffer) => {
            bgTask.stdout += data.toString();
          });

          child.stderr?.on("data", (data: Buffer) => {
            bgTask.stderr += data.toString();
          });

          child.on("close", (code) => {
            bgTask.status = code === 0 ? "completed" : "failed";
            bgTask.exitCode = code;
            scheduleCleanup(id);
          });

          child.on("error", (err) => {
            bgTask.status = "failed";
            bgTask.stderr += `\nProcess error: ${err.message}`;
            scheduleCleanup(id);
          });

          tasks.set(id, bgTask);

          return {
            toolCallId: "",
            content: `Task started: ${id}\nCommand: ${command}`,
            isError: false,
            metadata: { taskId: id, status: "running" },
          };
        }

        case "status": {
          if (!taskId) {
            // List all active tasks
            const allTasks = Array.from(tasks.entries()).map(([id, t]) => ({
              id,
              command: t.command,
              status: t.status,
              exitCode: t.exitCode,
              runtime: `${Math.round((Date.now() - t.startTime) / 1000)}s`,
            }));

            if (allTasks.length === 0) {
              return { toolCallId: "", content: "No active tasks.", isError: false };
            }

            const formatted = allTasks
              .map((t) => `  ${t.id.slice(0, 16)}... [${t.status}] ${t.runtime} — ${t.command}`)
              .join("\n");

            return { toolCallId: "", content: `Active tasks:\n${formatted}`, isError: false };
          }

          const task = tasks.get(taskId);
          if (!task) {
            return {
              toolCallId: "",
              content: `Task not found: ${taskId}. It may have been cleaned up.`,
              isError: true,
            };
          }

          const runtime = `${Math.round((Date.now() - task.startTime) / 1000)}s`;
          return {
            toolCallId: "",
            content: `Task ${taskId}: ${task.status} (exit code: ${task.exitCode ?? "N/A"}, runtime: ${runtime})`,
            isError: false,
            metadata: { taskId, status: task.status, exitCode: task.exitCode },
          };
        }

        case "output": {
          if (!taskId) {
            return {
              toolCallId: "",
              content: "Error: 'taskId' parameter is required for 'output' action.",
              isError: true,
            };
          }

          const task = tasks.get(taskId);
          if (!task) {
            return {
              toolCallId: "",
              content: `Task not found: ${taskId}. It may have been cleaned up.`,
              isError: true,
            };
          }

          const output = task.stdout.slice(offset);

          if (!output && task.stderr) {
            return {
              toolCallId: "",
              content: task.stderr.slice(offset) || "(empty stderr)",
              isError: task.status === "failed",
              metadata: { taskId, offset, totalLength: task.stdout.length },
            };
          }

          return {
            toolCallId: "",
            content: output || "(no output yet)",
            isError: false,
            metadata: {
              taskId,
              offset,
              totalLength: task.stdout.length,
              hasMore: task.status === "running" || task.stdout.length > offset + output.length,
            },
          };
        }

        case "stop": {
          if (!taskId) {
            return {
              toolCallId: "",
              content: "Error: 'taskId' parameter is required for 'stop' action.",
              isError: true,
            };
          }

          const task = tasks.get(taskId);
          if (!task) {
            return {
              toolCallId: "",
              content: `Task not found: ${taskId}. It may have already been cleaned up.`,
              isError: true,
            };
          }

          try {
            task.process.kill();
            task.status = "stopped";
          } catch {
            // process may already be dead
            task.status = "stopped";
          }

          return {
            toolCallId: "",
            content: `Task stopped: ${taskId}\nFinal output:\n${task.stdout.slice(-2000)}`,
            isError: false,
            metadata: { taskId, finalStatus: "stopped" },
          };
        }

        default:
          return {
            toolCallId: "",
            content: `Unknown action: ${effectiveAction}`,
            isError: true,
          };
      }
    },
  };
}
