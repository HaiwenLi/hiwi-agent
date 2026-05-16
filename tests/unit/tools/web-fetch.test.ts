import {
  convertHTMLToMarkdown,
  createWebFetchTool,
  extractTextFromHTML,
} from "@/tools/web-fetch.js";
import type { Tool, ToolContext } from "@/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Hello World</h1>
  <p>This is a <strong>test</strong> page.</p>
  <script>var x = 1;</script>
  <style>body { color: red; }</style>
  <noscript>Please enable JS</noscript>
</body>
</html>`;

function mockFetchResponse(
  body: string,
  options: { status?: number; contentType?: string; contentLength?: string } = {},
): Response {
  const { status = 200, contentType = "text/html", contentLength } = options;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    headers: new Headers({
      "content-type": contentType,
      ...(contentLength ? { "content-length": contentLength } : {}),
    }),
    text: () => Promise.resolve(body),
  } as Response;
}

describe("web_fetch tool", () => {
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(() => {
    tool = createWebFetchTool();
    ctx = { workingDirectory: "/tmp", sessionId: "test" };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("web_fetch");
    expect(tool.capabilities).toContain("NetworkAccess");
    expect(tool.inputSchema).toBeDefined();
  });

  it("rejects non-http URLs", async () => {
    const result = await tool.execute({ url: "ftp://example.com/file" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/http/i);
  });

  it("fetches and returns content", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(mockFetchResponse("<p>Hello</p>")));

    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Hello");
  });

  it("converts HTML to markdown by default", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(mockFetchResponse("<h1>Title</h1><p>Paragraph</p>")),
    );

    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("# Title");
    expect(result.content).toContain("Paragraph");
  });

  it("returns raw text when format=text", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(mockFetchResponse(SAMPLE_HTML)));

    const result = await tool.execute({ url: "https://example.com", format: "text" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).not.toContain("<");
    expect(result.content).not.toContain("var x = 1");
    expect(result.content).not.toContain("color: red");
    expect(result.content).not.toContain("Please enable JS");
    expect(result.content).toContain("Hello World");
    expect(result.content).toContain("test page");
  });

  it("returns raw HTML when format=html", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(mockFetchResponse("<h1>Title</h1>")));

    const result = await tool.execute({ url: "https://example.com", format: "html" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("<h1>Title</h1>");
  });

  it("returns error for responses exceeding 5MB via content-length", async () => {
    const sixMB = 6 * 1024 * 1024;
    vi.stubGlobal("fetch", () =>
      Promise.resolve(mockFetchResponse("x", { contentLength: String(sixMB) })),
    );

    const result = await tool.execute({ url: "https://example.com/big" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/5\s*MB/i);
  });

  it("returns error for responses exceeding 5MB via body length", async () => {
    // Create a body larger than 5MB
    const bigBody = "x".repeat(5 * 1024 * 1024 + 1);
    vi.stubGlobal("fetch", () => Promise.resolve(mockFetchResponse(bigBody)));

    const result = await tool.execute({ url: "https://example.com/big" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/5\s*MB/i);
  });

  it("returns error on HTTP failure (404)", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(mockFetchResponse("Not Found", { status: 404 })));

    const result = await tool.execute({ url: "https://example.com/missing" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("404");
  });

  it("handles timeout (AbortError)", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", () => Promise.reject(abortError));

    const result = await tool.execute({ url: "https://example.com", timeout: 1 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/timeout|abort/i);
  });

  it("returns title with hostname", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(mockFetchResponse("<p>Hi</p>")));

    const result = await tool.execute({ url: "https://example.com/page" }, ctx);
    expect(result.title).toContain("example.com");
  });

  it("shows placeholder for image content types", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(mockFetchResponse("", { contentType: "image/png" })),
    );

    const result = await tool.execute({ url: "https://example.com/img.png" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toMatch(/image/i);
  });
});

describe("convertHTMLToMarkdown", () => {
  it("converts headings to markdown", () => {
    const html = "<h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3>";
    const md = convertHTMLToMarkdown(html);
    expect(md).toContain("# Heading 1");
    expect(md).toContain("## Heading 2");
    expect(md).toContain("### Heading 3");
  });

  it("removes script and style tags", () => {
    const html = "<p>Content</p><script>alert('x')</script><style>body{}</style>";
    const md = convertHTMLToMarkdown(html);
    expect(md).toContain("Content");
    expect(md).not.toContain("alert");
    expect(md).not.toContain("body{}");
  });
});

describe("extractTextFromHTML", () => {
  it("strips HTML tags", () => {
    const html = "<p>Hello <strong>World</strong></p>";
    const text = extractTextFromHTML(html);
    expect(text).toBe("Hello World");
  });

  it("removes script, style, noscript, iframe, object, embed tags and content", () => {
    const html =
      "<p>Visible</p><script>secret</script><style>hidden</style><noscript>nope</noscript><iframe src='x'></iframe><object>obj</object><embed>emb</embed>";
    const text = extractTextFromHTML(html);
    expect(text).toContain("Visible");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("nope");
    expect(text).not.toContain("iframe");
    expect(text).not.toContain("obj");
    expect(text).not.toContain("emb");
  });
});
