import type { MatchResult, Replacer } from "./strategy.js";

function normalizeEscapes(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r");
}

export const escapeNormReplacer: Replacer = (content, oldString) => {
  const normOld = normalizeEscapes(oldString);
  const index = content.indexOf(normOld);
  if (index === -1) return null;
  return { index, matchedText: normOld };
};
