### Task 08: Sprint B Wiring — Registration + Integration

**Files:**
- Modify: `src/tools/index.ts` — add Sprint B tool registrations
- Modify: `src/cli/repl.ts` — wire session-scoped services
- Test: `tests/integration/tools-wiring.test.ts`

**Context:** Registers all Sprint B tools in the ToolRegistry and ensures integration with the REPL. Extends the existing `registerCoreTools` from Sprint A with `registerExtraTools`.

---

**Step 1: Write the failing tests**

Create `tests/integration/tools-wiring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@/core/tools.js";
import { registerCoreTools } from "@/tools/index.js";
import { registerExtraTools } from "@/tools/index.js";

describe("tool registration", () => {
  it("registers all Sprint A core tools", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("bash");
  });

  it("registers all Sprint B extra tools", () => {
    const registry = new ToolRegistry();
    registerExtraTools(registry);
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("apply_patch");
    expect(names).toContain("web_fetch");
    expect(names).toContain("web_search");
    expect(names).toContain("repo_overview");
    expect(names).toContain("question");
    expect(names).toContain("todo");
    expect(names).toContain("lsp");
  });

  it("registers all tools together without conflicts", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    registerExtraTools(registry);
    const names = registry.list().map((t) => t.name);
    expect(names).toHaveLength(13); // 6 core + 7 extra
    // No duplicate names
    expect(new Set(names).size).toBe(names.length);
  });

  it("all tools produce valid tool definitions for model", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    registerExtraTools(registry);
    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(13);
    for (const def of defs) {
      expect(def.function.name).toBeTruthy();
      expect(def.function.description).toBeTruthy();
      expect(def.function.parameters.type).toBe("object");
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/tools-wiring.test.ts`
Expected: FAIL — `registerExtraTools` is not exported

**Step 3: Add Sprint B registrations to src/tools/index.ts**

Add to the existing `src/tools/index.ts`:

```typescript
import { createApplyPatchTool } from "./apply-patch.js";
import { createWebFetchTool } from "./web-fetch.js";
import { createWebSearchTool } from "./web-search.js";
import { createRepoOverviewTool } from "./repo-overview.js";
import { createQuestionTool } from "./question.js";
import { createTodoTool } from "./todo.js";
import { createLspTool } from "./lsp.js";

export function registerExtraTools(registry: ToolRegistry): void {
  registry.register(createApplyPatchTool());
  registry.register(createWebFetchTool());
  registry.register(createWebSearchTool());
  registry.register(createRepoOverviewTool());
  registry.register(createQuestionTool());
  registry.register(createTodoTool());
  registry.register(createLspTool());
}
```

In `src/cli/repl.ts`, update the tool registration to call `registerExtraTools` after `registerCoreTools`:

```typescript
import { registerCoreTools, registerExtraTools } from "../tools/index.js";

// In the REPL initialization:
registerCoreTools(registry);
registerExtraTools(registry);
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/tools-wiring.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/index.ts src/cli/repl.ts tests/integration/tools-wiring.test.ts
git commit -m "feat: wire Sprint B extra tools into registry and REPL"
```
