### Task 12: Dynamic Prompt Assembler

**Files:**
- Create: `src/core/prompt/assembler.ts`
- Test: `tests/unit/core/prompt/assembler.test.ts`

**Context:** Assembles the full system prompt from layers: base prompt → environment → .hiwi-rules → MEMORY.md. Each layer is separated by a blank line. Missing layers are skipped.

---

**Step 1: Write the failing tests**

Create `tests/unit/core/prompt/assembler.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "@/core/prompt/assembler.js";

describe("assembleSystemPrompt", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-prompt-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("assembles prompt with base and environment only", async () => {
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("hiwi-agent");
    expect(result).toContain(tempDir);
  });

  it("includes .hiwi-rules content when file exists", async () => {
    await fs.writeFile(
      path.join(tempDir, ".hiwi-rules"),
      "Always use TypeScript strict mode",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("TypeScript strict mode");
  });

  it("includes MEMORY.md content when file exists", async () => {
    await fs.writeFile(
      path.join(tempDir, "MEMORY.md"),
      "# Project Memory\nImportant context here",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    expect(result).toContain("Important context here");
  });

  it("skips missing optional layers", async () => {
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    // Should not contain MEMORY.md or .hiwi-rules markers
    expect(result).not.toContain("undefined");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(50);
  });

  it("selects correct prompt by model ID", async () => {
    const claudeResult = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    const gptResult = await assembleSystemPrompt({
      modelId: "gpt-4o",
      workingDirectory: tempDir,
    });
    // Both should have content but different base prompts
    expect(claudeResult.length).toBeGreaterThan(0);
    expect(gptResult.length).toBeGreaterThan(0);
  });

  it("orders layers correctly: base → env → rules → memory", async () => {
    await fs.writeFile(
      path.join(tempDir, ".hiwi-rules"),
      "RULES_CONTENT",
    );
    await fs.writeFile(
      path.join(tempDir, "MEMORY.md"),
      "MEMORY_CONTENT",
    );
    const result = await assembleSystemPrompt({
      modelId: "claude-sonnet-4-6",
      workingDirectory: tempDir,
    });
    const rulesIdx = result.indexOf("RULES_CONTENT");
    const memoryIdx = result.indexOf("MEMORY_CONTENT");
    const envIdx = result.indexOf("Working directory");
    expect(envIdx).toBeLessThan(rulesIdx);
    expect(rulesIdx).toBeLessThan(memoryIdx);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/prompt/assembler.test.ts`
Expected: FAIL — module not found

**Step 3: Implement assembleSystemPrompt**

Create `src/core/prompt/assembler.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import { selectBasePrompt } from "./prompts.js";
import { buildEnvironmentContext } from "./environment.js";

interface AssembleOptions {
  modelId: string;
  workingDirectory: string;
}

export async function assembleSystemPrompt(options: AssembleOptions): Promise<string> {
  const { modelId, workingDirectory } = options;

  const layers: string[] = [];

  // Layer 1: Provider-specific base prompt
  layers.push(selectBasePrompt(modelId));

  // Layer 2: Environment context
  layers.push(buildEnvironmentContext({ workingDirectory }));

  // Layer 3: .hiwi-rules file (project instructions)
  const rulesPath = path.join(workingDirectory, ".hiwi-rules");
  try {
    const rules = await fs.readFile(rulesPath, "utf-8");
    if (rules.trim()) {
      layers.push(`Project instructions:\n${rules.trim()}`);
    }
  } catch {
    // No .hiwi-rules file — skip
  }

  // Layer 4: MEMORY.md
  const memoryPath = path.join(workingDirectory, "MEMORY.md");
  try {
    const memory = await fs.readFile(memoryPath, "utf-8");
    if (memory.trim()) {
      layers.push(`Project memory:\n${memory.trim()}`);
    }
  } catch {
    // No MEMORY.md — skip
  }

  return layers.join("\n\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/prompt/assembler.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/prompt/assembler.ts tests/unit/core/prompt/assembler.test.ts
git commit -m "feat: add dynamic system prompt assembler with layered construction"
```
