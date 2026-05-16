// ─── JSON-RPC Message Types ────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── ID Counter ────────────────────────────────────────────────

let nextId = 1;

/** Reset the ID counter (for testing). */
export function resetNextId(): void {
  nextId = 1;
}

// ─── Message Builders ──────────────────────────────────────────

export function buildRequest(method: string, params: unknown, id?: number): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: id ?? nextId++,
    method,
    params,
  };
}

export function buildNotification(method: string, params: unknown): JsonRpcNotification {
  return {
    jsonrpc: "2.0",
    method,
    params,
  };
}

// ─── Message Framing ───────────────────────────────────────────

/**
 * Parse a Content-Length framed response.
 * Format: "Content-Length: N\r\n\r\n{body}"
 * Returns null if the data is incomplete.
 */
export function parseResponse(raw: string): JsonRpcResponse | null {
  if (!raw) return null;

  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const headerPart = raw.slice(0, headerEnd);
  const match = headerPart.match(/Content-Length:\s*(\d+)/i);
  if (!match) return null;

  const contentLength = Number.parseInt(match[1], 10);
  const bodyStart = headerEnd + 4;
  const body = raw.slice(bodyStart);

  if (body.length < contentLength) return null;

  try {
    return JSON.parse(body.slice(0, contentLength)) as JsonRpcResponse;
  } catch {
    return null;
  }
}

/**
 * Encode a message with Content-Length header for sending to an LSP server.
 */
export function encodeMessage(msg: JsonRpcRequest | JsonRpcNotification): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${body.length}\r\n\r\n${body}`;
}

// ─── URI Helpers ───────────────────────────────────────────────

/**
 * Convert a file path to a file:// URI.
 * Normalizes backslashes to forward slashes.
 */
export function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return `file://${normalized}`;
  }
  return `file:///${normalized}`;
}

// ─── Position Helpers ──────────────────────────────────────────

/**
 * Convert 1-based (line, character) to 0-based LSP Position.
 */
export function toLspPosition(
  line: number,
  character: number,
): {
  line: number;
  character: number;
} {
  return { line: line - 1, character: character - 1 };
}
