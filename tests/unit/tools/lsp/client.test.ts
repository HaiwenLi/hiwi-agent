import {
  buildNotification,
  buildRequest,
  encodeMessage,
  filePathToUri,
  parseResponse,
  resetNextId,
  toLspPosition,
} from "@/tools/lsp/client.js";
import { describe, expect, it } from "vitest";

describe("LSP JSON-RPC client", () => {
  describe("buildRequest", () => {
    it("builds a valid JSON-RPC request with jsonrpc 2.0, id, method, params", () => {
      resetNextId();
      const req = buildRequest("initialize", { test: true });
      expect(req).toEqual({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { test: true },
      });
    });

    it("uses provided id when given", () => {
      resetNextId();
      const req = buildRequest("shutdown", null, 42);
      expect(req.id).toBe(42);
    });

    it("auto-increments id when not provided", () => {
      resetNextId();
      const req1 = buildRequest("initialize", {});
      const req2 = buildRequest("shutdown", {});
      expect(req1.id).toBe(1);
      expect(req2.id).toBe(2);
    });

    it("includes jsonrpc 2.0 version", () => {
      const req = buildRequest("textDocument/definition", {});
      expect(req.jsonrpc).toBe("2.0");
    });
  });

  describe("buildNotification", () => {
    it("builds a valid JSON-RPC notification without id", () => {
      const notif = buildNotification("textDocument/didOpen", { textDocument: {} });
      expect(notif).toEqual({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: { textDocument: {} },
      });
    });

    it("does NOT have an id property", () => {
      const notif = buildNotification("initialized", {});
      expect(notif).not.toHaveProperty("id");
    });
  });

  describe("parseResponse", () => {
    it("parses a Content-Length framed response", () => {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
      const raw = `Content-Length: ${body.length}\r\n\r\n${body}`;
      const result = parseResponse(raw);
      expect(result).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { capabilities: {} },
      });
    });

    it("returns null for incomplete data (missing header end)", () => {
      const raw = "Content-Length: 50\r\n";
      expect(parseResponse(raw)).toBeNull();
    });

    it("returns null for incomplete data (body shorter than Content-Length)", () => {
      const body = "short";
      const raw = `Content-Length: 100\r\n\r\n${body}`;
      expect(parseResponse(raw)).toBeNull();
    });

    it("returns null for empty input", () => {
      expect(parseResponse("")).toBeNull();
    });
  });

  describe("encodeMessage", () => {
    it("encodes a message with Content-Length header", () => {
      const msg = { jsonrpc: "2.0", id: 1, method: "test" };
      const encoded = encodeMessage(msg);
      const body = JSON.stringify(msg);
      expect(encoded).toBe(`Content-Length: ${body.length}\r\n\r\n${body}`);
    });
  });

  describe("filePathToUri", () => {
    it("converts Windows path to file URI", () => {
      const uri = filePathToUri("C:\\Users\\test\\file.ts");
      expect(uri).toBe("file:///C:/Users/test/file.ts");
    });

    it("converts Unix path to file URI", () => {
      const uri = filePathToUri("/home/user/file.ts");
      expect(uri).toBe("file:///home/user/file.ts");
    });

    it("normalizes backslashes to forward slashes", () => {
      const uri = filePathToUri("C:\\project\\src\\index.ts");
      expect(uri).not.toContain("\\");
      expect(uri).toContain("C:/project/src/index.ts");
    });
  });

  describe("toLspPosition", () => {
    it("converts 1-based to 0-based position", () => {
      const pos = toLspPosition(1, 1);
      expect(pos).toEqual({ line: 0, character: 0 });
    });

    it("converts arbitrary line and column", () => {
      const pos = toLspPosition(5, 10);
      expect(pos).toEqual({ line: 4, character: 9 });
    });
  });
});
