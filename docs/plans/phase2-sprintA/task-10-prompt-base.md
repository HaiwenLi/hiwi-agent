### Task 10: Provider Prompt Templates

**Files:**
- Create: `src/core/prompt/base-anthropic.txt`
- Create: `src/core/prompt/base-gpt.txt`
- Create: `src/core/prompt/base-default.txt`
- Test: `tests/unit/core/prompt/base-prompts.test.ts`

**Context:** Three system prompt variants adapted from OpenCode. Selected by model ID at runtime. Each is a plain text file embedded at build time.

---

**Step 1: Write the failing test**

Create `tests/unit/core/prompt/base-prompts.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { ANTHROPIC_PROMPT, GPT_PROMPT, DEFAULT_PROMPT, selectBasePrompt } from "@/core/prompt/prompts.js";

describe("provider prompts", () => {
  it("anthropic prompt contains coding instructions", () => {
    expect(ANTHROPIC_PROMPT.length).toBeGreaterThan(100);
    expect(ANTHROPIC_PROMPT).toContain("tool");
  });

  it("gpt prompt contains coding instructions", () => {
    expect(GPT_PROMPT.length).toBeGreaterThan(100);
    expect(GPT_PROMPT).toContain("tool");
  });

  it("default prompt contains coding instructions", () => {
    expect(DEFAULT_PROMPT.length).toBeGreaterThan(100);
    expect(DEFAULT_PROMPT).toContain("tool");
  });
});

describe("selectBasePrompt", () => {
  it("selects anthropic prompt for claude models", () => {
    expect(selectBasePrompt("claude-sonnet-4-6")).toBe(ANTHROPIC_PROMPT);
    expect(selectBasePrompt("claude-opus-4-7")).toBe(ANTHROPIC_PROMPT);
  });

  it("selects gpt prompt for openai models", () => {
    expect(selectBasePrompt("gpt-4o")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("o3-mini")).toBe(GPT_PROMPT);
    expect(selectBasePrompt("o1-pro")).toBe(GPT_PROMPT);
  });

  it("selects default prompt for unknown models", () => {
    expect(selectBasePrompt("deepseek-v4-flash")).toBe(DEFAULT_PROMPT);
    expect(selectBasePrompt("glm-4-plus")).toBe(DEFAULT_PROMPT);
    expect(selectBasePrompt("llama-3")).toBe(DEFAULT_PROMPT);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/prompt/base-prompts.test.ts`
Expected: FAIL — module not found

**Step 3: Create prompt template files**

Create `src/core/prompt/base-anthropic.txt`:

```
You are hiwi-agent, a coding assistant. You help users with software engineering tasks.

Guidelines:
- Use tools to accomplish tasks. Read files before editing, search before assuming.
- Be concise. Provide direct answers, not explanations unless asked.
- Reference code with file_path:line_number format.
- Make minimal, focused edits. Don't add features beyond what was requested.
- Use parallel tool calls when operations are independent.
- When editing, read the file first to see exact content.
- Default to writing no comments in code.
- Trust internal code and framework guarantees. Validate only at system boundaries.
- Write safe, secure code. No command injection, XSS, SQL injection.

Tool usage:
- read_file: Read files and directories with line numbers. Use offset/limit for large files.
- write_file: Create or overwrite files. Creates parent directories.
- edit_file: Edit files by replacing old text with new text. Multiple matching strategies.
- glob: Find files by name pattern. Sorted by modification time.
- grep: Search file contents with regex. Filter by file pattern.
- bash: Execute shell commands with timeout and output capture.

After completing a task, briefly state what changed and what's next.
```

Create `src/core/prompt/base-gpt.txt`:

```
You are hiwi-agent, a coding assistant running in a terminal. You help with software engineering tasks.

You have access to tools for reading, writing, editing, searching files and running commands.

Guidelines:
- Be direct and concise. Max 4 lines unless detail is requested.
- Use tools proactively. Don't guess file contents — read them.
- Make minimal changes. Don't refactor beyond the task scope.
- Write no comments unless they explain non-obvious behavior.
- Check for security issues in code you write.
- Prefer editing existing files over creating new ones.

Tool usage:
- read_file: Read files/directories. Returns line-numbered content.
- write_file: Write files. Creates directories if needed.
- edit_file: Replace text in files. Multiple matching strategies from exact to fuzzy.
- glob: Find files by name pattern.
- grep: Search content with regex patterns.
- bash: Run shell commands with timeout.

Read files before editing them. Use glob/grep to locate code before modifying.
```

Create `src/core/prompt/base-default.txt`:

```
You are hiwi-agent, an AI coding assistant. Help with software engineering tasks using the available tools.

Available tools: read_file, write_file, edit_file, glob, grep, bash.

Guidelines:
- Use tools to read, search, and modify code.
- Be concise in responses.
- Read files before editing.
- Make minimal, focused changes.
- Write secure code.
```

**Step 4: Create the prompts module**

Create `src/core/prompt/prompts.ts`:

```typescript
import ANTHROPIC_PROMPT_RAW from "./base-anthropic.txt";
import GPT_PROMPT_RAW from "./base-gpt.txt";
import DEFAULT_PROMPT_RAW from "./base-default.txt";

export const ANTHROPIC_PROMPT = ANTHROPIC_PROMPT_RAW;
export const GPT_PROMPT = GPT_PROMPT_RAW;
export const DEFAULT_PROMPT = DEFAULT_PROMPT_RAW;

export function selectBasePrompt(modelId: string): string {
  if (modelId.includes("claude")) return ANTHROPIC_PROMPT;
  if (modelId.includes("gpt") || modelId.includes("o1") || modelId.includes("o3")) return GPT_PROMPT;
  return DEFAULT_PROMPT;
}
```

**Step 5: Update tsconfig to support .txt imports**

Check if tsup handles raw imports. If not, add a declaration. Create `src/raw.d.ts`:

```typescript
declare module "*.txt" {
  const content: string;
  export default content;
}
```

**Step 6: Run tests**

Run: `pnpm vitest run tests/unit/core/prompt/base-prompts.test.ts`
Expected: May need tsup raw import config. If text imports fail, inline the strings in `prompts.ts` directly:

```typescript
export const ANTHROPIC_PROMPT = `You are hiwi-agent, a coding assistant...`;
export const GPT_PROMPT = `You are hiwi-agent, a coding assistant running in a terminal...`;
export const DEFAULT_PROMPT = `You are hiwi-agent, an AI coding assistant...`;

export function selectBasePrompt(modelId: string): string {
  if (modelId.includes("claude")) return ANTHROPIC_PROMPT;
  if (modelId.includes("gpt") || modelId.includes("o1") || modelId.includes("o3")) return GPT_PROMPT;
  return DEFAULT_PROMPT;
}
```

Prefer inlining for simplicity — no build config changes needed.

**Step 7: Commit**

```bash
git add src/core/prompt/ tests/unit/core/prompt/
git commit -m "feat: add provider prompt templates with model-based selection"
```
