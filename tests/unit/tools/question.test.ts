import { createQuestionTool } from "@/tools/question.js";
import type { Tool, ToolContext } from "@/types.js";
import { describe, expect, it, vi } from "vitest";

describe("question tool", () => {
  let tool: Tool;

  beforeEach(() => {
    tool = createQuestionTool();
  });

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("question");
    expect(tool.capabilities).toContain("UserInteraction");
  });

  it("asks a question and returns formatted answer", async () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "test",
      askUserQuestions: vi.fn().mockResolvedValue({ "What language?": "TypeScript" }),
    };

    const result = await tool.execute({ questions: [{ question: "What language?" }] }, ctx);

    expect(result.isError).toBe(false);
    expect(result.title).toBe("1 question(s) asked");
    expect(result.content).toContain("What language?");
    expect(result.content).toContain("TypeScript");
    expect(ctx.askUserQuestions).toHaveBeenCalledWith([{ question: "What language?" }]);
  });

  it("handles multiple questions", async () => {
    const answers = {
      "What language?": "TypeScript",
      "What framework?": "React",
    };
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "test",
      askUserQuestions: vi.fn().mockResolvedValue(answers),
    };

    const result = await tool.execute(
      {
        questions: [{ question: "What language?" }, { question: "What framework?" }],
      },
      ctx,
    );

    expect(result.isError).toBe(false);
    expect(result.title).toBe("2 question(s) asked");
    expect(result.content).toContain("What language? = TypeScript");
    expect(result.content).toContain("What framework? = React");
  });

  it("returns error when askUserQuestions is not available", async () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "test",
      // askUserQuestions is undefined
    };

    const result = await tool.execute({ questions: [{ question: "What?" }] }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content).toContain("not available");
  });

  it("returns error when questions parameter is empty", async () => {
    const ctx: ToolContext = {
      workingDirectory: "/tmp",
      sessionId: "test",
      askUserQuestions: vi.fn(),
    };

    const result = await tool.execute({ questions: [] }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content).toContain("non-empty");
  });
});
