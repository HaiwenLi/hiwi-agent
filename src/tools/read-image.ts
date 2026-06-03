import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentPart, Tool, ToolContext, ToolResult } from "../types.js";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? null;
}

export function createReadImageTool(): Tool {
  return {
    name: "read_image",
    description:
      "Read an image file, encode it as base64, and return a vision-compatible content part that can be passed to vision-capable models.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative path to the image file" },
        detail: {
          type: "string",
          enum: ["low", "high", "auto"],
          description: 'Image detail level (default "auto")',
        },
      },
      required: ["path"],
    },
    capabilities: ["ReadOnly", "UserInteraction"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { path: rawPath, detail = "auto" } = input as {
        path: string;
        detail?: "low" | "high" | "auto";
      };

      const filePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workingDirectory, rawPath);

      const mime = getMimeType(filePath);
      if (!mime) {
        return {
          toolCallId: "",
          content: `Unsupported image type: ${filePath}. Supported: .png, .jpg, .jpeg, .gif, .webp`,
          isError: true,
        };
      }

      try {
        const buffer = await fs.readFile(filePath);
        const base64 = buffer.toString("base64");
        const filename = path.basename(filePath);

        const contentParts: ContentPart[] = [
          { type: "text", text: `Image loaded from ${filePath}` },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${base64}`,
              detail,
            },
          },
        ];

        return {
          toolCallId: "",
          content: JSON.stringify(contentParts),
          isError: false,
          title: filename,
          contentParts,
        };
      } catch {
        return {
          toolCallId: "",
          content: `File not found or cannot be read: ${filePath}`,
          isError: true,
        };
      }
    },
  };
}
