import type { Hunk, UpdateFileHunk } from "./types.js";
import { seekSequence } from "./match.js";

/**
 * Apply a parsed hunk to file content and return the new content.
 *
 * - "add": returns lines joined with \n + trailing \n
 * - "delete": returns ""
 * - "update": finds context+oldLines in the content, replaces with newLines
 */
export function applyHunk(hunk: Hunk, content: string): string {
  switch (hunk.type) {
    case "add":
      return hunk.lines.join("\n") + (hunk.lines.length > 0 ? "\n" : "");

    case "delete":
      return "";

    case "update":
      return applyUpdate(hunk, content);
  }
}

function applyUpdate(hunk: UpdateFileHunk, content: string): string {
  let lines = content === "" ? [] : content.split("\n");

  // Remove trailing empty line from split if content ended with \n
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  // Process chunks in reverse order so earlier indices stay valid
  const sortedChunks = [...hunk.chunks].reverse();

  for (const chunk of sortedChunks) {
    // Strategy: find context to locate position, then match oldLines right after
    const contextLen = chunk.context.length;
    const oldLen = chunk.oldLines.length;

    let startPos = 0;

    if (contextLen > 0) {
      // Find the context in the file
      const ctxIdx = seekSequence(chunk.context, lines);
      if (ctxIdx === -1) {
        throw new Error(
          `Could not find context in ${hunk.path}: [${chunk.context.map((l) => JSON.stringify(l)).join(", ")}]`,
        );
      }
      startPos = ctxIdx + contextLen;
    }

    // If there are oldLines, verify they match at startPos
    if (oldLen > 0) {
      const oldIdx = seekSequence(chunk.oldLines, lines.slice(startPos));
      if (oldIdx !== 0) {
        throw new Error(
          `Old lines not found at expected position in ${hunk.path}: [${chunk.oldLines.map((l) => JSON.stringify(l)).join(", ")}]`,
        );
      }
    }

    // Replace oldLines with newLines
    lines = [
      ...lines.slice(0, startPos),
      ...chunk.newLines,
      ...lines.slice(startPos + oldLen),
    ];
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}
