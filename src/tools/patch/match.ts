/**
 * Seek a needle sequence within a haystack of strings using a 4-strategy fallback:
 *
 * 1. Exact match
 * 2. Trim trailing whitespace
 * 3. Full trim (both leading and trailing)
 * 4. Unicode normalization (smart quotes -> straight quotes)
 *
 * Returns the starting index of the first match, or -1 if not found.
 * Returns 0 for an empty needle.
 */
export function seekSequence(needle: string[], haystack: string[]): number {
  if (needle.length === 0) return 0;
  if (needle.length > haystack.length) return -1;

  // Strategy 1: Exact match
  const idx1 = findMatch(needle, haystack, (s) => s);
  if (idx1 !== -1) return idx1;

  // Strategy 2: Trim trailing whitespace
  const idx2 = findMatch(needle, haystack, trimTrailing);
  if (idx2 !== -1) return idx2;

  // Strategy 3: Full trim
  const idx3 = findMatch(needle, haystack, (s) => s.trim());
  if (idx3 !== -1) return idx3;

  // Strategy 4: Unicode normalization
  const idx4 = findMatch(needle, haystack, normalizeUnicode);
  if (idx4 !== -1) return idx4;

  return -1;
}

function findMatch(
  needle: string[],
  haystack: string[],
  normalize: (s: string) => string,
): number {
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (normalize(needle[j]) !== normalize(haystack[i + j])) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}

function trimTrailing(s: string): string {
  return s.replace(/\s+$/, "");
}

/** Map smart quotes to straight quotes, then full-trim for robustness. */
function normalizeUnicode(s: string): string {
  return s
    .replace(/[‘’]/g, "'")  // smart single quotes
    .replace(/[“”]/g, '"')   // smart double quotes
    .trim();
}
