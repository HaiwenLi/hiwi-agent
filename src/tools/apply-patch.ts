import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolResult } from "../types.js";
import { applyHunk } from "./patch/apply.js";
import { parsePatch } from "./patch/parser.js";
import type { Hunk } from "./patch/types.js";

export function createApplyPatchTool(): Tool {
  return {
    name: "apply_patch",
    description:
      "Apply a patch to one or more files. Supports adding, deleting, updating, and moving files atomically.",
    inputSchema: {
      type: "object",
      properties: {
        patch: {
          type: "string",
          description:
            "The patch text containing *** Begin Patch / *** End Patch markers with file directives.",
        },
      },
      required: ["patch"],
    },
    capabilities: ["WriteFiles"],

    async execute(input: unknown, ctx): Promise<ToolResult> {
      const { patch } = input as { patch?: string };

      if (!patch) {
        return {
          
          content: "Missing required parameter: patch",
          isError: true,
        };
      }

      let hunks: Hunk[];
      try {
        hunks = parsePatch(patch);
      } catch (err) {
        return {
          
          content: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }

      let added = 0;
      let deleted = 0;
      let modified = 0;
      const errors: string[] = [];

      for (const hunk of hunks) {
        try {
          const filePath = path.isAbsolute(hunk.path)
            ? hunk.path
            : path.resolve(ctx.workingDirectory, hunk.path);

          switch (hunk.type) {
            case "add": {
              const content = applyHunk(hunk, "");
              await fs.mkdir(path.dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, content, "utf-8");
              added++;
              break;
            }

            case "delete": {
              await fs.unlink(filePath);
              deleted++;
              break;
            }

            case "update": {
              const existingContent = await fs.readFile(filePath, "utf-8");
              const newContent = applyHunk(hunk, existingContent);

              if (hunk.moveTo) {
                const moveToPath = path.isAbsolute(hunk.moveTo)
                  ? hunk.moveTo
                  : path.resolve(ctx.workingDirectory, hunk.moveTo);
                await fs.mkdir(path.dirname(moveToPath), { recursive: true });
                await fs.writeFile(moveToPath, newContent, "utf-8");
                await fs.unlink(filePath);
              } else {
                await fs.writeFile(filePath, newContent, "utf-8");
              }
              modified++;
              break;
            }
          }
        } catch (err) {
          errors.push(`${hunk.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const parts: string[] = [];
      if (added > 0) parts.push(`${added} added`);
      if (deleted > 0) parts.push(`${deleted} deleted`);
      if (modified > 0) parts.push(`${modified} modified`);

      let content = `Patch applied: ${parts.join(", ")}`;
      if (errors.length > 0) {
        content += `\nErrors:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      }

      return {
        
        content,
        isError: errors.length > 0,
        title: "Apply Patch",
      };
    },
  };
}
