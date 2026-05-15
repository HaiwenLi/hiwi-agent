import type {
  AddFileHunk,
  DeleteFileHunk,
  Hunk,
  UpdateChunk,
  UpdateFileHunk,
} from "./types.js";

/**
 * Parse a patch text into an array of Hunks.
 *
 * Supports:
 * - *** Begin Patch / *** End Patch markers
 * - *** Add File: <path>
 * - *** Delete File: <path>
 * - *** Update File: <path>
 * - *** Move to: <path>
 * - @@ context @@ chunk headers with +/-/space prefixed lines
 */
export function parsePatch(patchText: string): Hunk[] {
  // Normalize CRLF to LF
  const text = patchText.replace(/\r\n/g, "\n");

  if (!text.trim()) {
    throw new Error("Empty patch text");
  }

  // Find Begin/End markers
  const beginIdx = text.indexOf("*** Begin Patch");
  const endIdx = text.indexOf("*** End Patch");

  if (beginIdx === -1) {
    throw new Error("Missing *** Begin Patch marker");
  }

  // Extract content between markers
  const contentStart = beginIdx + "*** Begin Patch".length;
  const content = endIdx !== -1 ? text.slice(contentStart, endIdx) : text.slice(contentStart);

  const lines = content.split("\n");
  const hunks: Hunk[] = [];

  let i = 0;

  // Skip leading empty lines
  while (i < lines.length && lines[i].trim() === "") {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length);
      const fileLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("*** ")) {
        fileLines.push(lines[i]);
        i++;
      }
      // Remove trailing empty line if present
      if (fileLines.length > 0 && fileLines[fileLines.length - 1] === "") {
        fileLines.pop();
      }
      hunks.push({
        type: "add",
        path: filePath,
        lines: fileLines,
      } satisfies AddFileHunk);
    } else if (line.startsWith("*** Delete File: ")) {
      const filePath = line.slice("*** Delete File: ".length);
      hunks.push({
        type: "delete",
        path: filePath,
      } satisfies DeleteFileHunk);
      i++;
    } else if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length);
      let moveTo: string | undefined;
      i++;

      // Check for Move to directive
      if (i < lines.length && lines[i].startsWith("*** Move to: ")) {
        moveTo = lines[i].slice("*** Move to: ".length);
        i++;
      }

      const chunks: UpdateChunk[] = [];

      while (i < lines.length && !lines[i].startsWith("*** ")) {
        // Look for @@ context @@ chunk header
        if (lines[i].startsWith("@@")) {
          const { contextLines, endLineIdx } = parseContextHeader(lines, i);
          i = endLineIdx + 1;

          const oldLines: string[] = [];
          const newLines: string[] = [];

          while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("*** ")) {
            const chunkLine = lines[i];
            if (chunkLine.startsWith("-")) {
              oldLines.push(chunkLine.slice(1));
            } else if (chunkLine.startsWith("+")) {
              newLines.push(chunkLine.slice(1));
            } else if (chunkLine.startsWith(" ")) {
              // Context line - goes into both old and new
              oldLines.push(chunkLine);
              newLines.push(chunkLine);
            }
            i++;
          }

          chunks.push({
            context: contextLines,
            oldLines,
            newLines,
          });
        } else {
          // Skip empty lines between chunks
          i++;
        }
      }

      hunks.push({
        type: "update",
        path: filePath,
        ...(moveTo !== undefined ? { moveTo } : {}),
        chunks,
      } satisfies UpdateFileHunk);
    } else {
      // Skip unknown lines
      i++;
    }
  }

  if (hunks.length === 0) {
    throw new Error("Patch contains no hunks");
  }

  return hunks;
}

/**
 * Parse a @@ context @@ header, which may span multiple lines.
 * Returns the context lines between the @@ markers and the index of the closing @@ line.
 */
function parseContextHeader(lines: string[], startIdx: number): { contextLines: string[]; endLineIdx: number } {
  const firstLine = lines[startIdx];

  // Try single-line match: @@ ... @@
  const singleMatch = firstLine.match(/^@@\s*(.*?)\s*@@$/);
  if (singleMatch) {
    const inner = singleMatch[1];
    return {
      contextLines: inner === "" ? [] : inner.split("\n"),
      endLineIdx: startIdx,
    };
  }

  // Multi-line: @@ opens on firstLine, closing @@ is on a later line
  const afterOpen = firstLine.replace(/^@@\s*/, "");
  const contextParts: string[] = [];
  if (afterOpen !== "") {
    contextParts.push(afterOpen);
  }

  let idx = startIdx + 1;
  while (idx < lines.length) {
    if (lines[idx].endsWith("@@")) {
      const beforeClose = lines[idx].replace(/\s*@@$/, "");
      if (beforeClose !== "") {
        contextParts.push(beforeClose);
      }
      return { contextLines: contextParts, endLineIdx: idx };
    }
    contextParts.push(lines[idx]);
    idx++;
  }

  // No closing @@ found - treat as empty context
  return { contextLines: [], endLineIdx: startIdx };
}
