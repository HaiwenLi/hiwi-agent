import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import type { Location, DocumentSymbol, HoverResult, Position } from "./lsp/types.js";
import {
  buildRequest,
  buildNotification,
  encodeMessage,
  filePathToUri,
  toLspPosition,
} from "./lsp/client.js";
import { getServerForFile } from "./lsp/servers.js";

// ─── Valid Operations ──────────────────────────────────────────

const VALID_OPERATIONS = [
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "goToImplementation",
] as const;

type LspOperation = (typeof VALID_OPERATIONS)[number];

// ─── LSP Client State ──────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface LspClient {
  process: ChildProcess;
  buffer: string;
  pending: Map<number, PendingRequest>;
  nextId: number;
  initialized: boolean;
}

const clientCache = new Map<string, LspClient>();

// ─── Client Lifecycle ──────────────────────────────────────────

async function getOrCreateClient(
  root: string,
  filePath: string,
): Promise<LspClient> {
  const server = getServerForFile(filePath);
  if (!server) {
    throw new Error(`No LSP server configured for file: ${filePath}`);
  }

  const key = `${root}:${server.command}`;
  const cached = clientCache.get(key);
  if (cached && cached.process.exitCode === null) {
    return cached;
  }

  const child = spawn(server.command, server.args, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const client: LspClient = {
    process: child,
    buffer: "",
    pending: new Map(),
    nextId: 1,
    initialized: false,
  };

  // Read responses from stdout
  child.stdout!.on("data", (data: Buffer) => {
    client.buffer += data.toString();
    processBuffer(client);
  });

  clientCache.set(key, client);

  // Initialize the server
  const initRequest = buildRequest("initialize", {
    processId: process.pid,
    rootUri: filePathToUri(root),
    capabilities: {},
  }, client.nextId++);
  const initResult = await sendRequest(client, initRequest, 10000);
  client.initialized = true;

  // Send initialized notification
  const initNotif = buildNotification("initialized", {});
  client.process.stdin!.write(encodeMessage(initNotif));

  return client;
}

function processBuffer(client: LspClient): void {
  while (true) {
    const headerEnd = client.buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;

    const headerPart = client.buffer.slice(0, headerEnd);
    const match = headerPart.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (client.buffer.length < bodyStart + contentLength) break;

    const body = client.buffer.slice(bodyStart, bodyStart + contentLength);
    client.buffer = client.buffer.slice(bodyStart + contentLength);

    try {
      const response = JSON.parse(body);
      const id = response.id as number;
      const pending = client.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        client.pending.delete(id);
        if (response.error) {
          pending.reject(new Error(response.error.message || "LSP error"));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }
}

function sendRequest(
  client: LspClient,
  req: { jsonrpc: string; id: number; method: string; params: unknown },
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.pending.delete(req.id);
      reject(new Error(`LSP request timed out: ${req.method}`));
    }, timeoutMs);

    client.pending.set(req.id, { resolve, reject, timer });
    client.process.stdin!.write(encodeMessage(req as Parameters<typeof encodeMessage>[0]));
  });
}

// ─── Format Helpers ────────────────────────────────────────────

function formatLocations(locations: Location | Location[] | null): string {
  if (!locations) return "No results found";
  const locs = Array.isArray(locations) ? locations : [locations];
  if (locs.length === 0) return "No results found";
  return locs
    .map((loc) => `${loc.uri}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`)
    .join("\n");
}

function formatHover(hover: HoverResult | null): string {
  if (!hover) return "No hover information available";
  if (typeof hover.contents === "string") return hover.contents;
  if (typeof hover.contents === "object" && "value" in hover.contents) {
    return hover.contents.value;
  }
  return String(hover.contents);
}

function formatSymbols(symbols: DocumentSymbol[], indent = ""): string {
  return symbols
    .map((sym) => {
      const line = `${indent}${sym.name} (kind: ${sym.kind}) [${sym.range.start.line + 1}:${sym.range.start.character + 1}]`;
      const children = sym.children ? formatSymbols(sym.children, indent + "  ") : "";
      return children ? `${line}\n${children}` : line;
    })
    .join("\n");
}

// ─── Tool Factory ──────────────────────────────────────────────

export function createLspTool(): Tool {
  return {
    name: "lsp",
    description:
      "Language Server Protocol tool for code intelligence. Supports go-to-definition, find-references, hover, document-symbols, and go-to-implementation.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: VALID_OPERATIONS,
          description:
            "LSP operation: goToDefinition, findReferences, hover, documentSymbol, goToImplementation",
        },
        filePath: {
          type: "string",
          description: "Path to the source file (relative to workingDirectory or absolute)",
        },
        line: {
          type: "number",
          description: "1-based line number",
        },
        character: {
          type: "number",
          description: "1-based character (column) number",
        },
      },
      required: ["operation", "filePath"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { operation, filePath, line, character } = input as {
        operation?: string;
        filePath?: string;
        line?: number;
        character?: number;
      };

      // Validate operation
      if (!operation || !VALID_OPERATIONS.includes(operation as LspOperation)) {
        return {
          toolCallId: "",
          content: `Invalid or missing operation. Must be one of: ${VALID_OPERATIONS.join(", ")}`,
          isError: true,
        };
      }

      // Validate filePath
      if (!filePath) {
        return {
          toolCallId: "",
          content: "Missing required parameter: filePath",
          isError: true,
        };
      }

      // Resolve file path
      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(ctx.workingDirectory, filePath);

      // Check file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        return {
          toolCallId: "",
          content: `File not found: ${resolvedPath}`,
          isError: true,
        };
      }

      // Get or create LSP client
      let client: LspClient;
      try {
        client = await getOrCreateClient(ctx.workingDirectory, resolvedPath);
      } catch (error) {
        return {
          toolCallId: "",
          content: `LSP server error: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }

      const uri = filePathToUri(resolvedPath);

      // Open the document
      try {
        const content = await fs.readFile(resolvedPath, "utf-8");
        const didOpen = buildNotification("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: path.extname(resolvedPath).slice(1),
            version: 1,
            text: content,
          },
        });
        client.process.stdin!.write(encodeMessage(didOpen));
      } catch (error) {
        return {
          toolCallId: "",
          content: `Failed to open document: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }

      // Document symbol doesn't require position
      if (operation === "documentSymbol") {
        const req = buildRequest("textDocument/documentSymbol", {
          textDocument: { uri },
        }, client.nextId++);
        try {
          const result = await sendRequest(client, req, 10000);
          const symbols = result as DocumentSymbol[] | null;
          return {
            toolCallId: "",
            content: symbols && symbols.length > 0
              ? formatSymbols(symbols)
              : "No document symbols found",
            isError: false,
            title: `LSP documentSymbol ${path.basename(resolvedPath)}`,
          };
        } catch (error) {
          return {
            toolCallId: "",
            content: `LSP request failed: ${error instanceof Error ? error.message : String(error)}`,
            isError: true,
          };
        }
      }

      // Other operations require line and character
      if (line === undefined || character === undefined) {
        return {
          toolCallId: "",
          content: `Operation "${operation}" requires line and character parameters`,
          isError: true,
        };
      }

      const position: Position = toLspPosition(line, character);

      try {
        let result: unknown;
        let method: string;

        switch (operation) {
          case "goToDefinition":
            method = "textDocument/definition";
            result = await sendRequest(
              client,
              buildRequest(method, {
                textDocument: { uri },
                position,
              }, client.nextId++),
              10000,
            );
            return {
              toolCallId: "",
              content: formatLocations(result as Location | Location[] | null),
              isError: false,
              title: `LSP goToDefinition ${path.basename(resolvedPath)}:${line}:${character}`,
            };

          case "findReferences":
            method = "textDocument/references";
            result = await sendRequest(
              client,
              buildRequest(method, {
                textDocument: { uri },
                position,
                context: { includeDeclaration: true },
              }, client.nextId++),
              10000,
            );
            return {
              toolCallId: "",
              content: formatLocations(result as Location[] | null),
              isError: false,
              title: `LSP findReferences ${path.basename(resolvedPath)}:${line}:${character}`,
            };

          case "hover":
            method = "textDocument/hover";
            result = await sendRequest(
              client,
              buildRequest(method, {
                textDocument: { uri },
                position,
              }, client.nextId++),
              10000,
            );
            return {
              toolCallId: "",
              content: formatHover(result as HoverResult | null),
              isError: false,
              title: `LSP hover ${path.basename(resolvedPath)}:${line}:${character}`,
            };

          case "goToImplementation":
            method = "textDocument/implementation";
            result = await sendRequest(
              client,
              buildRequest(method, {
                textDocument: { uri },
                position,
              }, client.nextId++),
              10000,
            );
            return {
              toolCallId: "",
              content: formatLocations(result as Location | Location[] | null),
              isError: false,
              title: `LSP goToImplementation ${path.basename(resolvedPath)}:${line}:${character}`,
            };

          default:
            return {
              toolCallId: "",
              content: `Unknown operation: ${operation}`,
              isError: true,
            };
        }
      } catch (error) {
        return {
          toolCallId: "",
          content: `LSP request failed: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    },
  };
}
