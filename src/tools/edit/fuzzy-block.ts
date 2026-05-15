import type { MatchResult, Replacer } from "./strategy.js";

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const aChars = new Set(a.split(""));
  const bChars = new Set(b.split(""));
  let common = 0;
  for (const c of aChars) {
    if (bChars.has(c)) common++;
  }
  return common / Math.max(aChars.size, bChars.size);
}

const SIMILARITY_THRESHOLD = 0.5;

export const fuzzyBlockReplacer: Replacer = (content, oldString) => {
  const oldLines = oldString.split("\n");
  if (oldLines.length < 2) return null;

  const contentLines = content.split("\n");

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const slice = contentLines.slice(i, i + oldLines.length);
    const firstSim = similarity(slice[0], oldLines[0]);
    const lastSim = similarity(slice[slice.length - 1], oldLines[oldLines.length - 1]);

    if (firstSim >= SIMILARITY_THRESHOLD && lastSim >= SIMILARITY_THRESHOLD) {
      const matchedText = slice.join("\n");
      const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return { index, matchedText };
    }
  }

  return null;
};
