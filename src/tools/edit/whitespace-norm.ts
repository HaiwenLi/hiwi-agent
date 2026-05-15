import type { MatchResult, Replacer } from "./strategy.js";

function normalizeSpaces(text: string): string {
  return text.replace(/  +/g, " ");
}

export const whitespaceNormReplacer: Replacer = (content, oldString) => {
  const normContent = normalizeSpaces(content);
  const normOld = normalizeSpaces(oldString);
  const index = normContent.indexOf(normOld);
  if (index === -1) return null;

  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < index && origIdx < content.length) {
    if (normContent[normIdx] === content[origIdx]) {
      normIdx++;
      origIdx++;
    } else if (content[origIdx] === " ") {
      origIdx++;
    } else {
      normIdx++;
      origIdx++;
    }
  }

  const normEnd = index + normOld.length;
  let origEnd = origIdx;
  let normIdx2 = normIdx;
  while (normIdx2 < normEnd && origEnd < content.length) {
    if (normContent[normIdx2] === content[origEnd]) {
      normIdx2++;
      origEnd++;
    } else if (content[origEnd] === " ") {
      origEnd++;
    } else {
      normIdx2++;
      origEnd++;
    }
  }

  return { index: origIdx, matchedText: content.slice(origIdx, origEnd) };
};
