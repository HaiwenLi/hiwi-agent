### Task 01: Extend ToolContext + ToolResult Types

**Files:**
- Modify: `src/types.ts:84-87` (ToolContext)
- Modify: `src/types.ts:17-20` (ToolResult)
- Test: `tests/unit/types.test.ts`

**Context:** Current `ToolContext` only has `workingDirectory` and `sessionId`. Tools need abort signal and permission callback. Current `ToolResult` lacks `title` and `metadata` fields for richer output.

---

**Step 1: Write the failing tests**

Add to `tests/unit/types.test.ts`:

```typescript
import type { ToolContext, ToolResult } from "@/types.js";
import { describe, expect, it } from "vitest";

describe("ToolContext", () => {
  it("accepts optional abort signal", () => {
    const controller = new AbortController();
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      abort: controller.signal,
    };
    expect(ctx.abort).toBe(controller.signal);
  });

  it("accepts optional askPermission callback", async () => {
    const askPermission = async () => true;
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      askPermission,
    };
    expect(await ctx.askPermission!({ tool: "bash", capability: "ExecCode" })).toBe(true);
  });

  it("works without optional fields", () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
    };
    expect(ctx.abort).toBeUndefined();
    expect(ctx.askPermission).toBeUndefined();
  });
});

describe("ToolResult", () => {
  it("accepts optional title field", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "file contents",
      isError: false,
      title: "Read src/index.ts",
    };
    expect(result.title).toBe("Read src/index.ts");
  });

  it("accepts optional metadata field", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "3 files found",
      isError: false,
      metadata: { fileCount: 3, truncated: true },
    };
    expect(result.metadata?.fileCount).toBe(3);
  });

  it("works without optional fields", () => {
    const result: ToolResult = {
      toolCallId: "c1",
      content: "ok",
      isError: false,
    };
    expect(result.title).toBeUndefined();
    expect(result.metadata).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/types.test.ts`
Expected: FAIL — TypeScript errors, `abort`/`askPermission`/`title`/`metadata` not in interface

**Step 3: Update ToolContext interface**

In `src/types.ts`, replace the ToolContext interface:

```typescript
export interface PermissionRequest {
  tool: string;
  capability: string;
}

export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  abort?: AbortSignal;
  askPermission?: (req: PermissionRequest) => Promise<boolean>;
}
```

**Step 4: Update ToolResult interface**

In `src/types.ts`, replace the ToolResult interface:

```typescript
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError: boolean;
  title?: string;
  metadata?: Record<string, unknown>;
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/types.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `pnpm vitest run`
Expected: All existing tests still pass (additions are backward compatible)

**Step 7: Commit**

```bash
git add src/types.ts tests/unit/types.test.ts
git commit -m "feat: extend ToolContext with abort/askPermission, ToolResult with title/metadata"
```
