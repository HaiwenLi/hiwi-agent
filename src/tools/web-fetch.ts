import TurndownService from "turndown";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

// ─── HTML Processing Helpers ──────────────────────────────────

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Remove script, style, noscript elements before conversion
turndown.addRule("removeNoise", {
  filter: ["script", "style", "noscript"],
  replacement: () => "",
});

export function convertHTMLToMarkdown(html: string): string {
  return turndown.turndown(html);
}

export function extractTextFromHTML(html: string): string {
  // Remove script, style, noscript, iframe, object, embed tags and their content
  let cleaned = html.replace(
    /<(script|style|noscript|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );
  // Strip all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, "");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

// ─── Tool Factory ─────────────────────────────────────────────

export function createWebFetchTool(): Tool {
  return {
    name: "web_fetch",
    description:
      "Fetch a web page and return its content as markdown, plain text, or raw HTML. Supports timeout and size limits.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The HTTP or HTTPS URL to fetch",
        },
        format: {
          type: "string",
          enum: ["markdown", "text", "html"],
          description:
            "Output format: 'markdown' (default, HTML→MD), 'text' (stripped text), 'html' (raw HTML)",
        },
        timeout: {
          type: "number",
          description: "Request timeout in milliseconds (default 30000, max 120000)",
        },
      },
      required: ["url"],
    },
    capabilities: ["NetworkAccess"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { url, format = "markdown", timeout = DEFAULT_TIMEOUT_MS } =
        input as {
          url: string;
          format?: "markdown" | "text" | "html";
          timeout?: number;
        };

      // Validate URL scheme
      if (!url || !/^https?:\/\//i.test(url)) {
        return {
          toolCallId: "",
          content: `Invalid URL: only http and https URLs are supported. Got: ${url}`,
          isError: true,
        };
      }

      // Clamp timeout
      const timeoutMs = Math.min(
        Math.max(timeout, 1),
        MAX_TIMEOUT_MS,
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
        });

        // Check for HTTP errors
        if (!response.ok) {
          return {
            toolCallId: "",
            content: `HTTP error ${response.status}: ${response.statusText}`,
            isError: true,
            title: new URL(url).hostname,
          };
        }

        // Check content-length header
        const contentLength = response.headers.get("content-length");
        if (contentLength && Number(contentLength) > MAX_CONTENT_SIZE) {
          return {
            toolCallId: "",
            content: `Response too large: content-length ${contentLength} bytes exceeds 5 MB limit`,
            isError: true,
            title: new URL(url).hostname,
          };
        }

        // Detect content type
        const contentType = response.headers.get("content-type") ?? "";
        const hostname = new URL(url).hostname;

        // Image content types — show placeholder
        if (contentType.startsWith("image/")) {
          return {
            toolCallId: "",
            content: `[Image: ${contentType} from ${url}]`,
            isError: false,
            title: hostname,
          };
        }

        const body = await response.text();

        // Check actual body size
        if (body.length > MAX_CONTENT_SIZE) {
          return {
            toolCallId: "",
            content: `Response too large: ${body.length} bytes exceeds 5 MB limit`,
            isError: true,
            title: hostname,
          };
        }

        // Non-HTML content — return raw
        const isHTML =
          contentType.includes("text/html") ||
          contentType.includes("application/xhtml");

        if (!isHTML && format !== "html") {
          return {
            toolCallId: "",
            content: body,
            isError: false,
            title: hostname,
          };
        }

        // Process HTML based on format
        let content: string;
        switch (format) {
          case "html":
            content = body;
            break;
          case "text":
            content = extractTextFromHTML(body);
            break;
          case "markdown":
          default:
            content = convertHTMLToMarkdown(body);
            break;
        }

        return {
          toolCallId: "",
          content,
          isError: false,
          title: hostname,
        };
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return {
            toolCallId: "",
            content: `Request timeout after ${timeoutMs}ms`,
            isError: true,
            title: new URL(url).hostname,
          };
        }

        const message =
          err instanceof Error ? err.message : String(err);
        return {
          toolCallId: "",
          content: `Fetch failed: ${message}`,
          isError: true,
          title: new URL(url).hostname,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
