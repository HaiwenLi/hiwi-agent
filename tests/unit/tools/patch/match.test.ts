import { describe, it, expect } from "vitest";
import { seekSequence } from "@/tools/patch/match.js";

describe("seekSequence", () => {
  it("returns 0 for empty needle", () => {
    expect(seekSequence([], ["a", "b", "c"])).toBe(0);
  });

  it("finds exact match at start", () => {
    expect(seekSequence(["a", "b"], ["a", "b", "c", "d"])).toBe(0);
  });

  it("finds exact match in middle", () => {
    expect(seekSequence(["c", "d"], ["a", "b", "c", "d"])).toBe(2);
  });

  it("returns -1 for no match", () => {
    expect(seekSequence(["x", "y"], ["a", "b", "c"])).toBe(-1);
  });

  it("matches with trailing whitespace differences", () => {
    expect(seekSequence(["hello  ", "world  "], ["hello", "world"])).toBe(0);
  });

  it("matches when haystack has trailing whitespace", () => {
    expect(seekSequence(["hello", "world"], ["hello  ", "world  "])).toBe(0);
  });

  it("matches with full trim (leading and trailing whitespace)", () => {
    expect(seekSequence(["  hello  "], ["hello"])).toBe(0);
    expect(seekSequence(["hello"], ["  hello  "])).toBe(0);
  });

  it("matches with unicode normalization (smart quotes to straight quotes)", () => {
    // Smart single quotes: ‘ (left) and ’ (right)
    // Smart double quotes: “ (left) and ” (right)
    expect(seekSequence(["it’s a “test”"], ["it's a \"test\""])).toBe(0);
  });

  it("matches when needle has straight quotes and haystack has smart quotes", () => {
    expect(seekSequence(["it's a \"test\""], ["it’s a “test”"])).toBe(0);
  });

  it("returns -1 when content differs beyond whitespace", () => {
    expect(seekSequence(["hello"], ["world"])).toBe(-1);
  });

  it("handles single element arrays", () => {
    expect(seekSequence(["a"], ["x", "a", "y"])).toBe(1);
  });

  it("returns -1 when needle is longer than haystack", () => {
    expect(seekSequence(["a", "b", "c"], ["a", "b"])).toBe(-1);
  });

  it("finds match after earlier mismatches", () => {
    expect(seekSequence(["b", "c"], ["a", "b", "b", "c"])).toBe(2);
  });

  it("handles unicode normalization with trailing whitespace fallback", () => {
    expect(seekSequence(["‘hello’  "], ["'hello'  "])).toBe(0);
  });
});
