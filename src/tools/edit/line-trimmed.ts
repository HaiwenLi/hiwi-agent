import type { MatchResult, Replacer } from "./strategy.js";

export const lineTrimmedReplacer: Replacer = (content, oldString) => {
  const contentLines = content.split("\n");
  const oldLines = oldString.split("\n");

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const slice = contentLines.slice(i, i + oldLines.length);
    const allMatch = slice.every((line, j) => line.trim() === oldLines[j].trim());
    if (allMatch) {
      const matchedText = slice.join("\n");
      const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return { index, matchedText };
    }
  }

  return null;
};
