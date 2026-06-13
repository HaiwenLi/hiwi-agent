/**
 * edit-strategy-chain.test.ts — Full edit strategy fallback chain with REAL temp files.
 *
 * Tests the end-to-end edit tool execution across all 8 strategies,
 * plus replaceAll mode, error paths, and edge cases.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditTool } from "@/tools/edit-tool.js";
import type { ToolContext } from "@/types.js";

describe("edit strategy chain", () => {
  let tempDir: string;
  let editTool: ReturnType<typeof createEditTool>;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-edit-"));
    editTool = createEditTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  async function writeFile(name: string, content: string): Promise<string> {
    const filePath = path.join(tempDir, name);
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  async function readFile(name: string): Promise<string> {
    return fs.readFile(path.join(tempDir, name), "utf-8");
  }

  async function edit(name: string, oldStr: string, newStr: string, replaceAll = false) {
    return editTool.execute(
      { path: name, oldString: oldStr, newString: newStr, replaceAll },
      ctx,
    );
  }

  // ─── Individual strategy verification (8 tests) ────────────────
  // NOTE: These tests verify the end-to-end edit behavior. The specific strategy
  // applied internally is an implementation detail — the test names describe which
  // strategy is expected to handle each case, but they all go through editTool.execute.

  it("simple strategy matches exact text", async () => {
    await writeFile("simple.txt", "hello world");
    const result = await edit("simple.txt", "hello", "hi");
    expect(result.isError).toBe(false);
    expect(await readFile("simple.txt")).toBe("hi world");
  });

  it("line-trimmed strategy matches with trailing whitespace", async () => {
    // File has trailing spaces on lines; oldString has none — simple fails, lineTrimmed succeeds
    await writeFile("trimmed.txt", "line1  \nline2  ");
    const result = await edit("trimmed.txt", "line1\nline2", "replaced1\nreplaced2");
    expect(result.isError).toBe(false);
    const updated = await readFile("trimmed.txt");
    expect(updated).toBe("replaced1\nreplaced2");
  });

  it("line-ending strategy matches CRLF content with LF oldString", async () => {
    // File uses CRLF; oldString uses LF — simple/lineTrimmed fail, lineEndingNorm succeeds.
    // Write raw CRLF bytes to ensure the file truly has \r\n on disk (fs.writeFile
    // may or may not preserve them depending on OS).
    const filePath = path.join(tempDir, "crlf.txt");
    const buf = Buffer.from("line1\r\nline2\r\n", "utf-8");
    await fs.writeFile(filePath, buf);

    const result = await edit("crlf.txt", "line1\nline2", "alpha\nbeta");
    expect(result.isError).toBe(false);
    const updated = await readFile("crlf.txt");
    // The matched original text includes the \r\n characters; replacement swaps
    // them out so the result uses the newString line endings (plain \n).
    expect(updated).toBe("alpha\nbeta\n");
  });

  it("whitespace strategy matches with extra spaces", async () => {
    // File has multiple spaces where oldString has single spaces
    await writeFile("spaces.txt", "hello   world");
    const result = await edit("spaces.txt", "hello world", "hey world");
    expect(result.isError).toBe(false);
    // The matchedText includes the original extra spaces, so replacement replaces them
    expect(await readFile("spaces.txt")).toBe("hey world");
  });

  it("escape strategy matches \\n in oldString to real newline", async () => {
    // File contains a real newline; oldString uses literal \\n
    await writeFile("escape.txt", "hello\nworld");
    const result = await edit("escape.txt", "hello\\nworld", "goodbye\nworld");
    expect(result.isError).toBe(false);
    expect(await readFile("escape.txt")).toBe("goodbye\nworld");
  });

  it("block-anchor strategy matches first+last line of multi-line block", async () => {
    // File has a 5-line function; oldString provides first and last line only (2 lines).
    // blockAnchor finds first line "function add(a, b) {", then searches within
    // oldLines.length + 5 = 7 lines for the last line "}".
    const fileContent = [
      "function add(a, b) {",
      "  const sum = a + b;",
      "  console.log(sum);",
      "  return sum;",
      "}",
    ].join("\n");
    await writeFile("anchor.ts", fileContent);

    // oldString is only 2 lines: first line + last line
    const result = await edit(
      "anchor.ts",
      "function add(a, b) {\n}",
      "function add(a: number, b: number) {\n  return a + b;\n}",
    );
    expect(result.isError).toBe(false);
    const updated = await readFile("anchor.ts");
    expect(updated).toBe("function add(a: number, b: number) {\n  return a + b;\n}");
  });

  it("fuzzy-block strategy matches similar lines", async () => {
    // Content and oldString differ in middle line (42 vs 43), but first and last
    // lines are identical (similarity = 1.0 for those, well above 0.5 threshold).
    const fileContent = "function foo() {\n  return 42;\n}";
    await writeFile("fuzzy.ts", fileContent);

    const result = await edit(
      "fuzzy.ts",
      "function foo() {\n  return 43;\n}",
      "function foo() {\n  return 99;\n}",
    );
    expect(result.isError).toBe(false);
    expect(await readFile("fuzzy.ts")).toBe("function foo() {\n  return 99;\n}");
  });

  it("strategy ordering: earlier strategy tried first", async () => {
    // When simpleReplacer would match, it handles it — no fallback needed
    await writeFile("order.txt", "exact match here");
    const result = await edit("order.txt", "exact match", "replaced");
    expect(result.isError).toBe(false);
    expect(await readFile("order.txt")).toBe("replaced here");
  });

  // ─── Full chain with edit tool (8 tests) ───────────────────────

  it("editing TypeScript imports", async () => {
    await writeFile("imports.ts", 'import { foo } from "./bar";\n\nconst x = foo();\n');
    const result = await edit("imports.ts", '"./bar"', '"./baz"');
    expect(result.isError).toBe(false);
    const updated = await readFile("imports.ts");
    expect(updated).toBe('import { foo } from "./baz";\n\nconst x = foo();\n');
  });

  it("editing function body", async () => {
    const code = [
      "function greet(name: string): string {",
      "  return 'Hello, ' + name;",
      "}",
    ].join("\n");
    await writeFile("func.ts", code);

    const result = await edit(
      "func.ts",
      "  return 'Hello, ' + name;",
      "  return `Hello, ${name}`;",
    );
    expect(result.isError).toBe(false);
    const updated = await readFile("func.ts");
    expect(updated).toContain("`Hello, ${name}`");
    expect(updated).not.toContain("'Hello, ' + name");
  });

  it("editing reformatted code (whitespace changed)", async () => {
    // File has extra indentation; oldString uses normalized spacing
    const fileContent = "const   obj   =   {   key:   'value'   };";
    await writeFile("reformatted.ts", fileContent);

    const result = await edit(
      "reformatted.ts",
      "const obj = { key: 'value' };",
      "const obj = { key: 'updated' };",
    );
    expect(result.isError).toBe(false);
    expect(await readFile("reformatted.ts")).toBe("const obj = { key: 'updated' };");
  });

  it("replaceAll mode replaces all occurrences", async () => {
    await writeFile("todos.txt", "TODO: fix bug\nSome code\nTODO: add tests\nMore code\nTODO: review");
    const result = await edit("todos.txt", "TODO", "FIXME", true);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("3 occurrences");
    const updated = await readFile("todos.txt");
    expect(updated).toBe("FIXME: fix bug\nSome code\nFIXME: add tests\nMore code\nFIXME: review");
  });

  it("replaceAll returns error when not found", async () => {
    await writeFile("no-todo.txt", "nothing to see here");
    const result = await edit("no-todo.txt", "TODO", "FIXME", true);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("single replace: error when multiple matches", async () => {
    await writeFile("dupes.txt", "abc xyz abc xyz abc");
    const result = await edit("dupes.txt", "abc", "def");
    expect(result.isError).toBe(true);
    expect(result.content).toContain("found 3 times");
  });

  it("no strategy matches returns error", async () => {
    await writeFile("notfound.txt", "abc");
    const result = await edit("notfound.txt", "xyz", "def");
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("file not found returns error", async () => {
    const result = await edit("nonexistent.txt", "old", "new");
    expect(result.isError).toBe(true);
    expect(result.content).toContain("File not found");
  });

  // ─── Edge cases (4 tests) ──────────────────────────────────────

  it("replaceAll with empty oldString returns error (0 replacements)", async () => {
    await writeFile("empty-old.txt", "some content");
    const result = await edit("empty-old.txt", "", "replacement", true);
    // countOccurrences returns 0 for empty search string
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("editing with special regex chars in content uses indexOf not regex", async () => {
    await writeFile("special.txt", "$1.00 per item [test]");
    const result = await edit("special.txt", "$1.00", "$2.00");
    expect(result.isError).toBe(false);
    expect(await readFile("special.txt")).toBe("$2.00 per item [test]");
  });

  it("multi-line replacement preserves surrounding content", async () => {
    const fileContent = "// header\nconst a = 1;\nconst b = 2;\n// footer";
    await writeFile("surround.ts", fileContent);

    const result = await edit("surround.ts", "const a = 1;\nconst b = 2;", "const a = 10;\nconst b = 20;");
    expect(result.isError).toBe(false);
    const updated = await readFile("surround.ts");
    expect(updated).toBe("// header\nconst a = 10;\nconst b = 20;\n// footer");
  });

  it("empty newString removes the matched text", async () => {
    await writeFile("remove.txt", "hello world");
    const result = await edit("remove.txt", "hello ", "");
    expect(result.isError).toBe(false);
    expect(await readFile("remove.txt")).toBe("world");
  });
});
