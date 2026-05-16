import { blockAnchorReplacer } from "@/tools/edit/block-anchor.js";
import { escapeNormReplacer } from "@/tools/edit/escape-norm.js";
import { fuzzyBlockReplacer } from "@/tools/edit/fuzzy-block.js";
import { lineEndingNormReplacer } from "@/tools/edit/line-ending-norm.js";
import { lineTrimmedReplacer } from "@/tools/edit/line-trimmed.js";
import { multiFuzzyReplacer } from "@/tools/edit/multi-fuzzy.js";
import { simpleReplacer } from "@/tools/edit/simple.js";
import { whitespaceNormReplacer } from "@/tools/edit/whitespace-norm.js";
import { describe, expect, it } from "vitest";

const content = `function hello() {
  console.log("hello");
  return true;
}`;

describe("simple replacer", () => {
  it("finds exact match", () => {
    const result = simpleReplacer(content, '  console.log("hello");', '  console.log("world");');
    expect(result).not.toBeNull();
    expect(result?.index).toBe(content.indexOf('  console.log("hello");'));
  });

  it("returns null when no exact match", () => {
    const result = simpleReplacer(content, 'console.log("world");', '  console.log("replaced");');
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
    const result = blockAnchorReplacer(
      content,
      `function hello() {
\tsomething different in middle
\treturn true;
}`,
      `function hello() {
  console.log("replaced");
  return true;
}`,
    );
    expect(result).not.toBeNull();
  });

  it("returns null when anchors don't match", () => {
    const result = blockAnchorReplacer(
      content,
      `function nope() {
\tmiddle
\treturn false;
}`,
      "replacement",
    );
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
    const code = 'text = "hello\nworld"';
    const result = escapeNormReplacer(code, 'text = "hello\\nworld"', 'text = "replaced"');
    expect(result).not.toBeNull();
  });
});

describe("fuzzyBlock replacer", () => {
  it("matches with minor differences using similarity", () => {
    const code = "function add(a, b) {\n  return a + b;\n}";
    const result = fuzzyBlockReplacer(
      code,
      "function add(a,b) {\n  return a+b;\n}",
      "function add(a, b) {\n  return a - b;\n}",
    );
    expect(result).not.toBeNull();
  });
});

describe("multiFuzzy replacer", () => {
  it("finds all exact matches", () => {
    const code = "foo\nbar\nfoo\nbaz";
    const result = multiFuzzyReplacer(code, "foo", "qux");
    expect(result).not.toBeNull();
    const replaced = `${code.slice(0, result?.index)}qux${code.slice(result?.index + result?.matchedText.length)}`;
    expect(replaced).toContain("qux");
  });

  it("returns null when no exact matches", () => {
    const result = multiFuzzyReplacer("hello world", "xyz", "abc");
    expect(result).toBeNull();
  });
});
