import type { ContentPart } from "../types.js";

export function extractText(content: string | ContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

export function safeJsonParse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function stripThinkTags(text: string): { thinkContent: string; cleanContent: string } {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let thinkContent = "";
  const cleanContent = text
    .replace(thinkRegex, (_, content) => {
      thinkContent += content;
      return "";
    })
    .trim();
  return { thinkContent, cleanContent };
}

export function endsWithPartialTag(buffer: string, tag: string): boolean {
  for (let len = 1; len < tag.length; len++) {
    if (buffer.endsWith(tag.substring(0, len))) return true;
  }
  return false;
}

export interface StreamingThinkContext {
  thinkMode: boolean;
  thinkBuffer: string;
}

export function createThinkContext(): StreamingThinkContext {
  return { thinkMode: false, thinkBuffer: "" };
}

export function* processThinkStream(
  deltaContent: string,
  ctx: StreamingThinkContext,
): Generator<{ type: "text-delta" | "reasoning-delta"; text: string }> {
  ctx.thinkBuffer += deltaContent;
  while (ctx.thinkBuffer) {
    if (ctx.thinkMode) {
      const closeIdx = ctx.thinkBuffer.indexOf("</think>");
      if (closeIdx >= 0) {
        if (closeIdx > 0) {
          yield { type: "reasoning-delta", text: ctx.thinkBuffer.substring(0, closeIdx) };
        }
        ctx.thinkBuffer = ctx.thinkBuffer.substring(closeIdx + 8);
        ctx.thinkMode = false;
      } else if (endsWithPartialTag(ctx.thinkBuffer, "</think>")) {
        break;
      } else {
        yield { type: "reasoning-delta", text: ctx.thinkBuffer };
        ctx.thinkBuffer = "";
      }
    } else {
      const openIdx = ctx.thinkBuffer.indexOf("<think>");
      if (openIdx >= 0) {
        if (openIdx > 0) {
          yield { type: "text-delta", text: ctx.thinkBuffer.substring(0, openIdx) };
        }
        ctx.thinkBuffer = ctx.thinkBuffer.substring(openIdx + 7);
        ctx.thinkMode = true;
      } else if (endsWithPartialTag(ctx.thinkBuffer, "<think>")) {
        break;
      } else {
        yield { type: "text-delta", text: ctx.thinkBuffer };
        ctx.thinkBuffer = "";
      }
    }
  }
}
