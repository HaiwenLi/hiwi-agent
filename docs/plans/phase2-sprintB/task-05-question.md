### Task 05: question Tool

**Files:**
- Modify: `src/types.ts` — add `QuestionPrompt`, extend `ToolContext`
- Create: `src/tools/question.ts`
- Test: `tests/unit/tools/question.test.ts`

**Context:** Lets the agent ask the user multi-choice questions during execution. Ported from OpenCode `question.ts`, simplified to a callback on `ToolContext` (no Effect dependency). The REPL provides the actual UI implementation.

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/question.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createQuestionTool } from "@/tools/question.js";
import type { Tool, ToolContext } from "@/types.js";

describe("question tool", () => {
  const tool = createQuestionTool();

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("question");
    expect(tool.capabilities).toContain("UserInteraction");
  });

  it("asks questions and returns formatted answers", async () => {
    const answers = { "What language?": "TypeScript" };
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      askUserQuestions: async () => answers,
    };
    const result = await tool.execute(
      { questions: [{ question: "What language?" }] },
      ctx,
    );
    expect(result.isError).toBe(false);
    expect(result.content).toContain("TypeScript");
    expect(result.title).toContain("1 question(s)");
  });

  it("handles multiple questions", async () => {
    const answers = { "Q1?": "A1", "Q2?": "A2" };
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      askUserQuestions: async () => answers,
    };
    const result = await tool.execute(
      {
        questions: [
          { question: "Q1?" },
          { question: "Q2?", options: [{ label: "A2" }] },
        ],
      },
      ctx,
    );
    expect(result.isError).toBe(false);
    expect(result.content).toContain("A1");
    expect(result.content).toContain("A2");
  });

  it("returns error when askUserQuestions is not available", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute(
      { questions: [{ question: "Q?" }] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("question handler");
  });

  it("validates questions parameter is non-empty", async () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "s1",
      askUserQuestions: async () => ({}),
    };
    const result = await tool.execute({ questions: [] }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("at least one");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/question.test.ts`
Expected: FAIL — module not found

**Step 3: Extend ToolContext + implement createQuestionTool**

In `src/types.ts`, add to the `ToolContext` interface:

```typescript
export interface QuestionPrompt {
  question: string;
  options?: Array<{ label: string; description?: string }>;
}

// Add to ToolContext:
export interface ToolContext {
  workingDirectory: string;
  sessionId: string;
  abort?: AbortSignal;
  askPermission?: (req: PermissionRequest) => Promise<boolean>;
  askUserQuestions?: (questions: QuestionPrompt[]) => Promise<Record<string, string>>;
}
```

Create `src/tools/question.ts`:

```typescript
import type { Tool, ToolContext, ToolResult, QuestionPrompt } from "../types.js";

export function createQuestionTool(): Tool {
  return {
    name: "question",
    description:
      "Ask the user one or more questions. Each question can have optional multiple-choice options. Returns the user's answers.",
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Questions to ask the user",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question to ask" },
              options: {
                type: "array",
                description: "Optional answer choices",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Option label" },
                    description: { type: "string", description: "Optional explanation" },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["question"],
          },
        },
      },
      required: ["questions"],
    },
    capabilities: ["UserInteraction"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { questions } = input as { questions: QuestionPrompt[] };

      if (!questions || questions.length === 0) {
        return {
          toolCallId: "",
          content: "Must provide at least one question",
          isError: true,
        };
      }

      if (!ctx.askUserQuestions) {
        return {
          toolCallId: "",
          content: "No question handler available in this context",
          isError: true,
        };
      }

      const answers = await ctx.askUserQuestions(questions);

      const lines = questions.map(
        (q) => `${q.question} = ${answers[q.question] ?? "(no answer)"}`,
      );
      return {
        toolCallId: "",
        content: lines.join("\n"),
        isError: false,
        title: `${questions.length} question(s) asked`,
        metadata: { answers },
      };
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/question.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/tools/question.ts tests/unit/tools/question.test.ts
git commit -m "feat: add question tool with askUserQuestions callback"
```
