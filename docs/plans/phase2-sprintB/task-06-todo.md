### Task 06: todo Tool

**Files:**
- Create: `src/tools/todo.ts`
- Create: `src/core/todo-store.ts`
- Test: `tests/unit/tools/todo.test.ts`

**Context:** Session-scoped task tracking. The agent can create, update, and query a todo list within a session. Ported from OpenCode `todo.ts`, simplified to an in-memory `Map<sessionId, TodoItem[]>` store (no Effect, no persistence).

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/todo.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { createTodoTool } from "@/tools/todo.js";
import { todoStore } from "@/core/todo-store.js";
import type { Tool, ToolContext } from "@/types.js";

describe("todo tool", () => {
  const tool = createTodoTool();
  const sessionId = "test-session";

  afterEach(() => {
    todoStore.clear(sessionId);
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("todo");
    expect(tool.capabilities).toContain("StateUpdate");
  });

  it("creates a new todo list", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId };
    const result = await tool.execute(
      {
        todos: [
          { content: "Write tests", status: "pending", priority: "high" },
          { content: "Implement", status: "in_progress", priority: "medium" },
        ],
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Write tests");
    expect(result.metadata?.todos).toHaveLength(2);
  });

  it("updates existing todos", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId };
    await tool.execute(
      { todos: [{ content: "Task A", status: "pending", priority: "high" }] },
      ctx,
    );
    const result = await tool.execute(
      { todos: [{ content: "Task A", status: "completed", priority: "high" }] },
      ctx,
    );
    expect(result.isError).toBe(false);
    const stored = todoStore.get(sessionId);
    expect(stored).toHaveLength(1);
    expect(stored![0].status).toBe("completed");
  });

  it("returns title with pending count", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId };
    const result = await tool.execute(
      {
        todos: [
          { content: "Done", status: "completed", priority: "low" },
          { content: "Pending", status: "pending", priority: "high" },
        ],
      },
      ctx,
    );
    expect(result.title).toContain("1 pending");
  });

  it("validates status values", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId };
    const result = await tool.execute(
      { todos: [{ content: "Bad", status: "invalid", priority: "high" }] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("status");
  });

  it("isolates sessions", async () => {
    const ctx1: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const ctx2: ToolContext = { workingDirectory: "/tmp", sessionId: "s2" };
    await tool.execute(
      { todos: [{ content: "S1 task", status: "pending", priority: "high" }] },
      ctx1,
    );
    expect(todoStore.get("s1")).toHaveLength(1);
    expect(todoStore.get("s2")).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/todo.test.ts`
Expected: FAIL — module not found

**Step 3: Implement todo store + tool**

Create `src/core/todo-store.ts`:

```typescript
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

const VALID_STATUSES = new Set(["pending", "in_progress", "completed", "cancelled"]);
const VALID_PRIORITIES = new Set(["high", "medium", "low"]);

const store = new Map<string, TodoItem[]>();

export const todoStore = {
  get(sessionId: string): TodoItem[] | undefined {
    return store.get(sessionId);
  },

  set(sessionId: string, todos: TodoItem[]): void {
    store.set(sessionId, todos);
  },

  clear(sessionId: string): void {
    store.delete(sessionId);
  },

  isValidStatus(status: string): boolean {
    return VALID_STATUSES.has(status);
  },

  isValidPriority(priority: string): boolean {
    return VALID_PRIORITIES.has(priority);
  },
};
```

Create `src/tools/todo.ts`:

```typescript
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { todoStore, type TodoItem } from "../core/todo-store.js";

export function createTodoTool(): Tool {
  return {
    name: "todo",
    description:
      "Update the session's task list. Each todo has content, status (pending/in_progress/completed/cancelled), and priority (high/medium/low). Replaces the entire list on each call.",
    inputSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "The updated todo list",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Brief task description" },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
                description: "Task status",
              },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
                description: "Priority level",
              },
            },
            required: ["content", "status", "priority"],
          },
        },
      },
      required: ["todos"],
    },
    capabilities: ["StateUpdate"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { todos } = input as { todos: TodoItem[] };

      for (const t of todos) {
        if (!todoStore.isValidStatus(t.status)) {
          return {
            toolCallId: "",
            content: `Invalid status "${t.status}". Must be pending, in_progress, completed, or cancelled.`,
            isError: true,
          };
        }
        if (!todoStore.isValidPriority(t.priority)) {
          return {
            toolCallId: "",
            content: `Invalid priority "${t.priority}". Must be high, medium, or low.`,
            isError: true,
          };
        }
      }

      todoStore.set(ctx.sessionId, todos);

      const pending = todos.filter((t) => t.status !== "completed" && t.status !== "cancelled");
      const lines = todos.map(
        (t) => `[${t.status}] (${t.priority}) ${t.content}`,
      );

      return {
        toolCallId: "",
        content: lines.join("\n"),
        isError: false,
        title: `${pending.length} pending`,
        metadata: { todos },
      };
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/todo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/todo-store.ts src/tools/todo.ts tests/unit/tools/todo.test.ts
git commit -m "feat: add todo tool with session-scoped task tracking"
```
