// ─── Todo Store ────────────────────────────────────────────────
// Session-scoped in-memory storage for todo items.

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

export const VALID_STATUSES = new Set<string>(["pending", "in_progress", "completed", "cancelled"]);

export const VALID_PRIORITIES = new Set<string>(["high", "medium", "low"]);

// Map from sessionId to that session's todo list
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
