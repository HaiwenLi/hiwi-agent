import { todoStore } from "../core/todo-store.js";
import type { TodoItem } from "../core/todo-store.js";
import type { Tool, ToolContext, ToolResult } from "../types.js";

export function createTodoTool(): Tool {
  return {
    name: "todo",
    description:
      "Manage a session-scoped todo list. Creates, replaces, or updates the task list for the current session.",
    inputSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "List of todo items to set for this session",
          items: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: "Description of the task",
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
                description: "Current status of the task",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Priority level of the task",
              },
            },
            required: ["content"],
          },
        },
      },
      required: ["todos"],
    },
    capabilities: ["StateUpdate"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { todos } = input as { todos: TodoItem[] };

      // Validate each todo item
      for (const todo of todos) {
        if (todo.status !== undefined && !todoStore.isValidStatus(todo.status)) {
          return {
            toolCallId: "",
            content: `Invalid status: "${todo.status}". Must be one of: pending, in_progress, completed, cancelled.`,
            isError: true,
          };
        }
        if (todo.priority !== undefined && !todoStore.isValidPriority(todo.priority)) {
          return {
            toolCallId: "",
            content: `Invalid priority: "${todo.priority}". Must be one of: high, medium, low.`,
            isError: true,
          };
        }
      }

      // Apply defaults for missing optional fields
      const normalized: TodoItem[] = todos.map((t) => ({
        content: t.content,
        status: t.status ?? "pending",
        priority: t.priority ?? "medium",
      }));

      // Store the todo list for this session
      todoStore.set(ctx.sessionId, normalized);

      // Format output lines: [status] (priority) content
      const lines = normalized.map((t) => `[${t.status}] (${t.priority}) ${t.content}`);

      // Count pending items (not completed, not cancelled)
      const pendingCount = normalized.filter(
        (t) => t.status !== "completed" && t.status !== "cancelled",
      ).length;

      return {
        toolCallId: "",
        content: lines.join("\n"),
        isError: false,
        title: `Todo: ${pendingCount} pending`,
      };
    },
  };
}
