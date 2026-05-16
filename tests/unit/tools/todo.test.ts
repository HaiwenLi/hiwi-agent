import { todoStore } from "@/core/todo-store.js";
import { createTodoTool } from "@/tools/todo.js";
import type { Tool, ToolContext } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("todo tool", () => {
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(() => {
    tool = createTodoTool();
    ctx = { workingDirectory: "/tmp", sessionId: "test-session" };
  });

  afterEach(() => {
    todoStore.clear("test-session");
    todoStore.clear("other-session");
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("todo");
    expect(tool.capabilities).toContain("StateUpdate");
  });

  it("creates a new todo list", async () => {
    const result = await tool.execute(
      {
        todos: [
          { content: "Write tests", status: "pending", priority: "high" },
          { content: "Implement feature", status: "pending", priority: "medium" },
        ],
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(result.content).toContain("Write tests");
    expect(result.content).toContain("Implement feature");

    const stored = todoStore.get("test-session");
    expect(stored).toHaveLength(2);
    expect(stored?.[0].content).toBe("Write tests");
  });

  it("updates existing todos", async () => {
    // Create initial todos
    await tool.execute(
      {
        todos: [
          { content: "Task A", status: "pending", priority: "high" },
          { content: "Task B", status: "pending", priority: "low" },
        ],
      },
      ctx,
    );

    // Update with new status
    const result = await tool.execute(
      {
        todos: [
          { content: "Task A", status: "completed", priority: "high" },
          { content: "Task B", status: "in_progress", priority: "medium" },
        ],
      },
      ctx,
    );

    expect(result.isError).toBe(false);

    const stored = todoStore.get("test-session");
    expect(stored?.[0].status).toBe("completed");
    expect(stored?.[1].status).toBe("in_progress");
    expect(stored?.[1].priority).toBe("medium");
  });

  it("returns title with pending count", async () => {
    const result = await tool.execute(
      {
        todos: [
          { content: "Done task", status: "completed", priority: "high" },
          { content: "Pending task", status: "pending", priority: "medium" },
          { content: "Cancelled task", status: "cancelled", priority: "low" },
        ],
      },
      ctx,
    );

    expect(result.title).toContain("1 pending");
  });

  it("validates status values", async () => {
    const result = await tool.execute(
      {
        todos: [{ content: "Bad task", status: "invalid_status", priority: "high" }],
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content).toContain("Invalid status");
  });

  it("isolates sessions", async () => {
    const otherCtx: ToolContext = { workingDirectory: "/tmp", sessionId: "other-session" };

    await tool.execute(
      {
        todos: [{ content: "Session A task", status: "pending", priority: "high" }],
      },
      ctx,
    );

    await tool.execute(
      {
        todos: [{ content: "Session B task", status: "pending", priority: "low" }],
      },
      otherCtx,
    );

    const storedA = todoStore.get("test-session");
    const storedB = todoStore.get("other-session");

    expect(storedA).toHaveLength(1);
    expect(storedA?.[0].content).toBe("Session A task");

    expect(storedB).toHaveLength(1);
    expect(storedB?.[0].content).toBe("Session B task");
  });
});
