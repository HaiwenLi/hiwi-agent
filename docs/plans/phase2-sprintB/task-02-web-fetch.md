### Task 02: web_fetch Tool

**Files:**
- Create: `src/tools/web-fetch.ts`
- Test: `tests/unit/tools/web-fetch.test.ts`

**Context:** Fetches URLs and converts content to markdown, text, or raw HTML. Uses `turndown` for HTML→markdown conversion and native `fetch` (Node 18+). Ported from OpenCode `webfetch.ts` with Cloudflare retry and 5MB size limit.

**New dependency:** `turndown` (HTML→Markdown)

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/web-fetch.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool, convertHTMLToMarkdown, extractTextFromHTML } from "@/tools/web-fetch.js";
import type { Tool, ToolContext } from "@/types.js";

describe("web_fetch tool", () => {
  const tool = createWebFetchTool();

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("web_fetch");
    expect(tool.capabilities).toContain("NetworkAccess");
  });

  it("rejects non-http URLs", async () => {
    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ url: "ftp://example.com" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("http");
  });

  it("fetches and returns content", async () => {
    const html = "<html><body><h1>Hello</h1><p>World</p></body></html>";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "text/html",
        "content-length": String(html.length),
      }),
      text: () => Promise.resolve(html),
    });
    vi.stubGlobal("fetch", mockFetch);

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Hello");
    vi.restoreAllMocks();
  });

  it("converts HTML to markdown by default", async () => {
    const html = "<h1>Title</h1><p>Paragraph</p>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html", "content-length": String(html.length) }),
      text: () => Promise.resolve(html),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result.content).toContain("Title");
    expect(result.content).toContain("Paragraph");
    vi.restoreAllMocks();
  });

  it("returns raw text when format=text", async () => {
    const html = "<h1>Title</h1><script>ignore</script><p>Text</p>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html", "content-length": String(html.length) }),
      text: () => Promise.resolve(html),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute(
      { url: "https://example.com", format: "text" },
      ctx,
    );
    expect(result.content).not.toContain("<h1>");
    expect(result.content).not.toContain("script");
    expect(result.content).toContain("Title");
    vi.restoreAllMocks();
  });

  it("returns raw HTML when format=html", async () => {
    const html = "<h1>Raw</h1>";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html", "content-length": String(html.length) }),
      text: () => Promise.resolve(html),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute(
      { url: "https://example.com", format: "html" },
      ctx,
    );
    expect(result.content).toBe(html);
    vi.restoreAllMocks();
  });

  it("returns error for responses exceeding 5MB", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "6000000" }),
      text: () => Promise.resolve("x"),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("5MB");
    vi.restoreAllMocks();
  });

  it("returns error on HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
      text: () => Promise.resolve(""),
    }));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute({ url: "https://example.com" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("404");
    vi.restoreAllMocks();
  });

  it("handles timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 100)),
    ));

    const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };
    const result = await tool.execute(
      { url: "https://example.com", timeout: 1 },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("timed out");
    vi.restoreAllMocks();
  }, 10000);
});

describe("convertHTMLToMarkdown", () => {
  it("converts headings", () => {
    expect(convertHTMLToMarkdown("<h1>Title</h1>")).toContain("# Title");
  });

  it("removes script and style tags", () => {
    const html = "<p>Keep</p><script>remove</script><style>.x{}</style>";
    const md = convertHTMLToMarkdown(html);
    expect(md).toContain("Keep");
    expect(md).not.toContain("remove");
    expect(md).not.toContain(".x{}");
  });
});

describe("extractTextFromHTML", () => {
  it("strips tags and returns text", () => {
    expect(extractTextFromHTML("<h1>Title</h1><p>Text</p>")).toContain("Title");
    expect(extractTextFromHTML("<h1>Title</h1><p>Text</p>")).toContain("Text");
  });

  it("removes script/style/noscript content", () => {
    const result = extractTextFromHTML(
      "<p>Visible</p><script>hidden1</script><style>hidden2</style><noscript>hidden3</noscript>",
    );
    expect(result).toContain("Visible");
    expect(result).not.toContain("hidden");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/web-fetch.test.ts`
Expected: FAIL — module not found

**Step 3: Install dependency + implement**

Install: `pnpm add turndown && pnpm add -D @types/turndown`

Create `src/tools/web-fetch.ts`:

```typescript
import TurndownService from "turndown";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;

export function convertHTMLToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  td.remove(["script", "style", "meta", "link"]);
  return td.turndown(html);
}

export function extractTextFromHTML(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?<\/embed>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAcceptHeader(format: string): string {
  switch (format) {
    case "text":
      return "text/plain;q=0.9, text/markdown;q=0.8, text/html;q=0.7";
    case "html":
      return "text/html;q=0.9, text/plain;q=0.8";
    default:
      return "text/markdown;q=0.9, text/html;q=0.8, text/plain;q=0.7";
  }
}

export function createWebFetchTool(): Tool {
  return {
    name: "web_fetch",
    description:
      "Fetch a URL and return its content as markdown, text, or HTML. Supports timeout and size limits.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
        format: {
          type: "string",
          enum: ["text", "markdown", "html"],
          description: "Output format. Defaults to markdown.",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (max 120). Defaults to 30.",
        },
      },
      required: ["url"],
    },
    capabilities: ["NetworkAccess"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { url, format = "markdown", timeout } = input as {
        url: string;
        format?: string;
        timeout?: number;
      };

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return {
          toolCallId: "",
          content: "URL must start with http:// or https://",
          isError: true,
        };
      }

      const timeoutMs = Math.min(
        (timeout ?? DEFAULT_TIMEOUT / 1000) * 1000,
        MAX_TIMEOUT,
      );
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: buildAcceptHeader(format) },
        });

        if (!response.ok) {
          return {
            toolCallId: "",
            content: `HTTP ${response.status}: ${response.statusText}`,
            isError: true,
          };
        }

        const contentLength = parseInt(response.headers.get("content-length") ?? "0", 10);
        if (contentLength > MAX_SIZE) {
          return {
            toolCallId: "",
            content: `Response exceeds 5MB limit (${(contentLength / 1024 / 1024).toFixed(1)}MB)`,
            isError: true,
          };
        }

        const contentType = response.headers.get("content-type") ?? "";
        const body = await response.text();

        if (body.length > MAX_SIZE) {
          return {
            toolCallId: "",
            content: `Response body exceeds 5MB limit`,
            isError: true,
          };
        }

        let content: string;
        if (contentType.includes("image/")) {
          content = `[Image: ${contentType}]`;
        } else if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
          switch (format) {
            case "text":
              content = extractTextFromHTML(body);
              break;
            case "html":
              content = body;
              break;
            default:
              content = convertHTMLToMarkdown(body);
          }
        } else {
          content = body;
        }

        return {
          toolCallId: "",
          content,
          isError: false,
          title: `Fetch ${new URL(url).hostname}`,
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return { toolCallId: "", content: "Request timed out", isError: true };
        }
        return {
          toolCallId: "",
          content: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/web-fetch.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/web-fetch.ts tests/unit/tools/web-fetch.test.ts
git commit -m "feat: add web_fetch tool with HTML→markdown conversion"
```
