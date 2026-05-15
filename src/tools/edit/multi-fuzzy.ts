import type { MatchResult, Replacer } from "./strategy.js";

export const multiFuzzyReplacer: Replacer = (content, oldString) => {
  const index = content.indexOf(oldString);
  if (index === -1) return null;
  return { index, matchedText: oldString };
};
