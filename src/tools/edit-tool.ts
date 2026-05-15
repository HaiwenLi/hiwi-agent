import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import { type MatchResult, replaceMatch } from "./edit/strategy.js";
import { simpleReplacer } from "./edit/simple.js";
import { lineTrimmedReplacer } from "./edit/line-trimmed.js";
import { blockAnchorReplacer } from "./edit/block-anchor.js";
import { whitespaceNormReplacer } from "./edit/whitespace-norm.js";
import { lineEndingNormReplacer } from "./edit/line-ending-norm.js";
import { escapeNormReplacer } from "./edit/escape-norm.js";
import { fuzzyBlockReplacer } from "./edit/fuzzy-block.js";
import { multiFuzzyReplacer } from "./edit/multi-fuzzy.js";

type ReplacerFn = (content: string, oldString: string, newString: string) => MatchResult | null;

const STRATEGIES: ReplacerFn[] = [
  simpleReplacer,
  lineTrimmedReplacer,
  lineEndingNormReplacer,
  whitespaceNormReplacer,
  escapeNormReplacer,
  blockAnchorReplacer,
  fuzzyBlockReplacer,
  multiFuzzyReplacer,
];

export function createEditTool(): Tool {
  return {
    name: "edit_file",
    description: "Edit a file by replacing oldString with newString. Tries multiple matching strategies from exact to fuzzy. Use replaceAll to replace all occurrences.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative file path" },
        oldString: { type: "string", description: "Text to find in the file" },
        newString: { type: "string", description: "Replacement text" },
        replaceAll: { type: "boolean", description: "Replace all occurrences (default false)" },
      },
      required: ["path", "oldString", "newString"],
    },
    capabilities: ["WriteFiles"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { path: rawPath, oldString, newString, replaceAll } = input as {
        path: string;
        oldString: string;
        newString: string;
        replaceAll?: boolean;
      };

      const filePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workingDirectory, rawPath);

      try {
        const content = await fs.readFile(filePath, "utf-8");

        if (replaceAll) {
          return await executeReplaceAll(filePath, content, oldString, newString);
        }

        return await executeSingle(filePath, content, oldString, newString);
      } catch {
        return {
          toolCallId: "",
          content: `File not found: ${filePath}`,
          isError: true,
        };
      }
    },
  };
}

async function executeSingle(
  filePath: string,
  content: string,
  oldString: string,
  newString: string,
): Promise<ToolResult> {
  const exactCount = countOccurrences(content, oldString);
  if (exactCount > 1) {
    return {
      toolCallId: "",
      content: `oldString found ${exactCount} times in ${filePath}. Use replaceAll: true to replace all occurrences, or provide more context to make the match unique.`,
      isError: true,
      title: `Edit ${path.basename(filePath)}`,
    };
  }

  for (const strategy of STRATEGIES) {
    const match = strategy(content, oldString, newString);
    if (match) {
      const updated = replaceMatch(content, match, newString);
      await fs.writeFile(filePath, updated, "utf-8");

      return {
        toolCallId: "",
        content: `Replaced in ${filePath}`,
        isError: false,
        title: `Edit ${path.basename(filePath)}`,
      };
    }
  }

  return {
    toolCallId: "",
    content: `oldString not found in ${filePath}. The text you provided doesn't match any portion of the file. Please read the file first to see its exact content.`,
    isError: true,
    title: `Edit ${path.basename(filePath)}`,
  };
}

async function executeReplaceAll(
  filePath: string,
  content: string,
  oldString: string,
  newString: string,
): Promise<ToolResult> {
  const count = countOccurrences(content, oldString);
  if (count === 0) {
    return {
      toolCallId: "",
      content: `oldString not found in ${filePath}`,
      isError: true,
      title: `Edit ${path.basename(filePath)}`,
    };
  }

  const updated = content.split(oldString).join(newString);
  await fs.writeFile(filePath, updated, "utf-8");

  return {
    toolCallId: "",
    content: `Replaced ${count} occurrences in ${filePath}`,
    isError: false,
    title: `Edit ${path.basename(filePath)} (${count} replacements)`,
    metadata: { replacementCount: count },
  };
}

function countOccurrences(content: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = content.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}
