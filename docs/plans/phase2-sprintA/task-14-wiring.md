### Task 14: Integration Wiring

**Files:**
- Create: `src/tools/index.ts` — tool registration helper
- Modify: `src/cli/repl.ts` — register tools on startup
- Modify: `src/core/agent.ts` — accept system prompt in run()
- Test: `tests/integration/tools-wiring.test.ts`

**Context:** Wire all tools into the ToolRegistry and use the prompt assembler to build the system prompt for each session. This is the glue that connects everything.

---

**Step 1: Write the failing test**

Create `tests/integration/tools-wiring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { registerCoreTools } from "@/tools/index.js";
import { ToolRegistry } from "@/core/tools.js";

describe("core tools registration", () => {
  it("registers all 6 core tools", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const tools = registry.list();
    const names = tools.map((t) => t.name);

    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("bash");
    expect(tools).toHaveLength(6);
  });

  it("all tools have valid schemas", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const defs = registry.toToolDefinitions();

    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toBeDefined();
      expect((def.inputSchema as any).type).toBe("object");
    }
  });

  it("generates correct tool definitions for model", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const defs = registry.toToolDefinitions();

    const readDef = defs.find((d) => d.name === "read_file");
    expect(readDef).toBeDefined();
    expect((readDef!.inputSchema as any).properties.path).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/tools-wiring.test.ts`
Expected: FAIL — module not found

**Step 3: Create tool registration helper**

Create `src/tools/index.ts`:

```typescript
import type { ToolRegistry } from "../core/tools.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit.js";
import { createGlobTool } from "./glob.js";
import { createGrepTool } from "./grep.js";
import { createBashTool } from "./bash.js";

export function registerCoreTools(registry: ToolRegistry): void {
  registry.register(createReadTool());
  registry.register(createWriteTool());
  registry.register(createEditTool());
  registry.register(createGlobTool());
  registry.register(createGrepTool());
  registry.register(createBashTool());
}

export {
  createReadTool,
  createWriteTool,
  createEditTool,
  createGlobTool,
  createGrepTool,
  createBashTool,
};
```

**Step 4: Wire tools into REPL startup**

In `src/cli/repl.ts`, add tool registration after ToolRegistry creation. Find where `ToolRegistry` is instantiated and add:

```typescript
import { registerCoreTools } from "../tools/index.js";

// After creating registry:
registerCoreTools(this.toolRegistry);
```

**Step 5: Wire system prompt into agent loop**

In `src/core/agent.ts`, update `AgentLoop` constructor to accept optional system prompt:

```typescript
import { assembleSystemPrompt } from "./prompt/assembler.js";

// In the run() method, before the while loop:
const systemPrompt = await assembleSystemPrompt({
  modelId: this.adapter.id,
  workingDirectory: ctx.workingDirectory,
});
currentMessages.unshift({ role: "system", content: systemPrompt });
```

**Step 6: Run tests**

Run: `pnpm vitest run tests/integration/tools-wiring.test.ts`
Expected: PASS

Run: `pnpm vitest run`
Expected: All tests pass (existing tests may need minor updates for new constructor params)

**Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

**Step 8: Commit**

```bash
git add src/tools/index.ts src/cli/repl.ts src/core/agent.ts tests/integration/tools-wiring.test.ts
git commit -m "feat: wire core tools and system prompt into agent loop"
```
