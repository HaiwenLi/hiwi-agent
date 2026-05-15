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
