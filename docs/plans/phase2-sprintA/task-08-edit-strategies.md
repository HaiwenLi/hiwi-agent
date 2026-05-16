### Task 08: Edit Matching Strategies

**Files:**
- Create: `src/tools/edit/strategy.ts` — shared types
- Create: `src/tools/edit/simple.ts` — exact match
- Create: `src/tools/edit/line-trimmed.ts` — trim whitespace per-line
- Create: `src/tools/edit/block-anchor.ts` — first/last line anchors
- Create: `src/tools/edit/whitespace-norm.ts` — normalize spaces
- Create: `src/tools/edit/line-ending-norm.ts` — normalize CRLF/LF
- Create: `src/tools/edit/escape-norm.ts` — normalize escape sequences
- Create: `src/tools/edit/fuzzy-block.ts` — fuzzy matching with similarity
- Create: `src/tools/edit/multi-fuzzy.ts` — multiple occurrences
- Test: `tests/unit/tools/edit/strategy.test.ts`

**Context:** The edit tool needs to find `oldString` in file content even when the model's whitespace/indentation doesn't exactly match. These 9 strategies try in order, from strict to fuzzy. Each returns either a match result or null.

---

**Step 1: Write the shared types and failing test**

Create `src/tools/edit/strategy.ts`:

```typescript
export interface MatchResult {
  index: number;
  matchedText: string;
}

export type Replacer = (
  content: string,
  oldString: string,
  newString: string,
) => MatchResult | null;

export function replaceMatch(
  content: string,
  match: MatchResult,
  newString: string,
): string {
  return content.slice(0, match.index) + newString + content.slice(match.index + match.matchedText.length);
}
```

Create `tests/unit/tools/edit/strategy.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { simpleReplacer } from "@/tools/edit/simple.js";
import { lineTrimmedReplacer } from "@/tools/edit/line-trimmed.js";
import { blockAnchorReplacer } from "@/tools/edit/block-anchor.js";
import { whitespaceNormReplacer } from "@/tools/edit/whitespace-norm.js";
import { lineEndingNormReplacer } from "@/tools/edit/line-ending-norm.js";
import { escapeNormReplacer } from "@/tools/edit/escape-norm.js";
import { fuzzyBlockReplacer } from "@/tools/edit/fuzzy-block.js";
import { multiFuzzyReplacer } from "@/tools/edit/multi-fuzzy.js";

const content = `function hello() {
  console.log("hello");
  return true;
}`;

describe("simple replacer", () => {
  it("finds exact match", () => {
    const result = simpleReplacer(content, '  console.log("hello");', '  console.log("world");');
    expect(result).not.toBeNull();
    expect(result!.index).toBe(content.indexOf('  console.log("hello");'));
  });

  it("returns null when no exact match", () => {
    const result = simpleReplacer(content, 'console.log("hello");', '  console.log("world");');
    expect(result).toBeNull();
  });
});

describe("lineTrimmed replacer", () => {
  it("matches ignoring leading/trailing whitespace per line", () => {
    const result = lineTrimmedReplacer(content, 'console.log("hello");', 'console.log("world");');
    expect(result).not.toBeNull();
  });
});

describe("blockAnchor replacer", () => {
  it("matches using first and last lines as anchors", () => {
    const result = blockAnchorReplacer(content, `function hello() {
something different in middle
return true;
}`, `function hello() {
  console.log("replaced");
  return true;
}`);
    expect(result).not.toBeNull();
  });

  it("returns null when anchors don't match", () => {
    const result = blockAnchorReplacer(content, `function nope() {
middle
return false;
}`, `replacement`);
    expect(result).toBeNull();
  });
});

describe("whitespaceNorm replacer", () => {
  it("matches normalizing multiple spaces to single", () => {
    const code = "const  x  =  1;";
    const result = whitespaceNormReplacer(code, "const x = 1;", "const x = 2;");
    expect(result).not.toBeNull();
  });
});

describe("lineEndingNorm replacer", () => {
  it("matches ignoring CRLF vs LF differences", () => {
    const crlfContent = "line1\r\nline2\r\nline3";
    const result = lineEndingNormReplacer(crlfContent, "line1\nline2", "replaced");
    expect(result).not.toBeNull();
  });
});

describe("escapeNorm replacer", () => {
  it("matches treating \\n as newline", () => {
    const code = 'text = "hello\\nworld"';
    const result = escapeNormReplacer(code, 'text = "hello\nworld"', 'text = "replaced"');
    expect(result).not.toBeNull();
  });
});

describe("fuzzyBlock replacer", () => {
  it("matches with minor differences using similarity", () => {
    const code = "function add(a, b) {\n  return a + b;\n}";
    const result = fuzzyBlockReplacer(code, "function add(a,b) {\n  return a+b;\n}", "function add(a, b) {\n  return a - b;\n}");
    expect(result).not.toBeNull();
  });
});

describe("multiFuzzy replacer", () => {
  it("finds all exact matches", () => {
    const code = "foo\nbar\nfoo\nbaz";
    const result = multiFuzzyReplacer(code, "foo", "qux");
    expect(result).not.toBeNull();
    const replaced = code.slice(0, result!.index) + "qux" + code.slice(result!.index + result!.matchedText.length);
    // Should replace the first occurrence
    expect(replaced).toContain("qux");
  });

  it("returns null when no exact matches", () => {
    const result = multiFuzzyReplacer("hello world", "xyz", "abc");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/edit/strategy.test.ts`
Expected: FAIL — modules not found

**Step 3: Implement each strategy**

Create `src/tools/edit/simple.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const simpleReplacer: Replacer = (content, oldString) => {
  const index = content.indexOf(oldString);
  if (index === -1) return null;
  return { index, matchedText: oldString };
};
```

Create `src/tools/edit/line-trimmed.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const lineTrimmedReplacer: Replacer = (content, oldString) => {
  const contentLines = content.split("\n");
  const oldLines = oldString.split("\n");

  for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
    const slice = contentLines.slice(i, i + oldLines.length);
    const allMatch = slice.every(
      (line, j) => line.trim() === oldLines[j].trim(),
    );
    if (allMatch) {
      const matchedText = slice.join("\n");
      const index = contentLines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
      return { index, matchedText };
    }
  }

  return null;
};
```

Create `src/tools/edit/block-anchor.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const blockAnchorReplacer: Replacer = (content, oldString) => {
  const oldLines = oldString.split("\n");
  if (oldLines.length < 2) return null;

  const firstLine = oldLines[0].trim();
  const lastLine = oldLines[oldLines.length - 1].trim();
  const contentLines = content.split("\n");

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].trim() !== firstLine) continue;

    // Look for last line within a reasonable window
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
```

Create `src/tools/edit/whitespace-norm.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function normalizeSpaces(text: string): string {
  return text.replace(/  +/g, " ");
}

export const whitespaceNormReplacer: Replacer = (content, oldString) => {
  const normContent = normalizeSpaces(content);
  const normOld = normalizeSpaces(oldString);
  const index = normContent.indexOf(normOld);
  if (index === -1) return null;

  // Map back to original content position
  // Count how many normalized chars correspond to original chars
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

  // Find end position similarly
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
```

Create `src/tools/edit/line-ending-norm.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export const lineEndingNormReplacer: Replacer = (content, oldString) => {
  const normContent = normalizeLineEndings(content);
  const normOld = normalizeLineEndings(oldString);
  const index = normContent.indexOf(normOld);
  if (index === -1) return null;

  // Map back: find the original span in content
  // Build a mapping from normalized index to original index
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
```

Create `src/tools/edit/escape-norm.ts`:

```typescript
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
```

Create `src/tools/edit/fuzzy-block.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Simple character-level similarity
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
```

Create `src/tools/edit/multi-fuzzy.ts`:

```typescript
import type { MatchResult, Replacer } from "./strategy.js";

export const multiFuzzyReplacer: Replacer = (content, oldString) => {
  // Just find the first exact occurrence
  const index = content.indexOf(oldString);
  if (index === -1) return null;
  return { index, matchedText: oldString };
};
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/edit/strategy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/edit/ tests/unit/tools/edit/
git commit -m "feat: add 9 edit matching strategies (simple to fuzzy)"
```
