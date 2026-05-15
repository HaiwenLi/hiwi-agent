import type { MatchResult, Replacer } from "./strategy.js";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export const lineEndingNormReplacer: Replacer = (content, oldString) => {
  const normContent = normalizeLineEndings(content);
  const normOld = normalizeLineEndings(oldString);
  const index = normContent.indexOf(normOld);
  if (index === -1) return null;

  let origIdx = 0;
  let normIdx = 0;
  while (normIdx < index && origIdx < content.length) {
    if (content[origIdx] === "\r" && content[origIdx + 1] === "\n") {
      origIdx += 2;
      normIdx += 1;
    } else {
      origIdx++;
      normIdx++;
    }
  }

  const startOrig = origIdx;
  while (normIdx < index + normOld.length && origIdx < content.length) {
    if (content[origIdx] === "\r" && content[origIdx + 1] === "\n") {
      origIdx += 2;
      normIdx += 1;
    } else {
      origIdx++;
      normIdx++;
    }
  }

  return { index: startOrig, matchedText: content.slice(startOrig, origIdx) };
};
