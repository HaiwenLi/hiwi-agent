import type { MatchResult, Replacer } from "./strategy.js";

export const blockAnchorReplacer: Replacer = (content, oldString) => {
  const oldLines = oldString.split("\n");
  if (oldLines.length < 2) return null;

  const firstLine = oldLines[0].trim();
  const lastLine = oldLines[oldLines.length - 1].trim();
  const contentLines = content.split("\n");

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;

    for (let j = i + 1; j < Math.min(i + oldLines.length + 5, contentLines.length); j++) {
      if (contentLines[j].trim() === lastLine) {
        const matchedLines = contentLines.slice(i, j + 1);
        const matchedText = matchedLines.join("\n");
        const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
        return { index, matchedText };
      }
    }
  }

  return null;
};
