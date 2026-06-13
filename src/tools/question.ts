import type { QuestionPrompt, Tool, ToolContext, ToolResult } from "../types.js";

export function createQuestionTool(): Tool {
  return {
    name: "question",
    description:
      "Ask the user one or more questions and return their answers. Supports optional multiple-choice options per question.",
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Array of questions to ask the user",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question text" },
              options: {
                type: "array",
                description: "Optional multiple-choice options",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "Option label" },
                    description: {
                      type: "string",
                      description: "Optional description of the option",
                    },
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
          
          content: "questions parameter must be a non-empty array",
          isError: true,
        };
      }

      if (!ctx.askUserQuestions) {
        return {
          
          content: "User interaction is not available in this context",
          isError: true,
        };
      }

      const answers = await ctx.askUserQuestions(questions);

      const lines = Object.entries(answers).map(([question, answer]) => `${question} = ${answer}`);

      return {
        
        content: lines.join("\n"),
        isError: false,
        title: `${questions.length} question(s) asked`,
        metadata: { questionCount: questions.length },
      };
    },
  };
}
