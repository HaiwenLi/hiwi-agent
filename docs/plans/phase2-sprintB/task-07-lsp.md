### Task 07: lsp Tool

**Files:**
- Create: `src/tools/lsp/types.ts`
- Create: `src/tools/lsp/client.ts`
- Create: `src/tools/lsp/servers.ts`
- Create: `src/tools/lsp.ts`
- Test: `tests/unit/tools/lsp/client.test.ts`
- Test: `tests/unit/tools/lsp.test.ts`

**Context:** LSP client that communicates with language servers over stdio JSON-RPC. Supports go-to-definition, find-references, hover, and document symbols. Ported from OpenCode `lsp.ts` with drastically simplified server management — no auto-download, no diagnostics push/pull, no monorepo root detection. A thin JSON-RPC wrapper.

**Architecture:**
- `types.ts` — LSP position, range, symbol types
- `client.ts` — JSON-RPC client over stdio (spawns server process, sends/receives messages)
- `servers.ts` — Server registry (maps file extensions → server config)
- `lsp.ts` — The tool itself

---

## Phase A: LSP Types + JSON-RPC Client

**Step 1: Write the failing client tests**

Create `tests/unit/tools/lsp/client.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  buildRequest,
  buildNotification,
  parseResponse,
} from "@/tools/lsp/client.js";

describe("buildRequest", () => {
  it("builds a valid JSON-RPC request", () => {
    const msg = buildRequest("textDocument/definition", {
      textDocument: { uri: "file:///test.ts" },
      position: { line: 0, character: 5 },
    }, 1);
    expect(msg.jsonrpc).toBe("2.0");
    expect(msg.id).toBe(1);
    expect(msg.method).toBe("textDocument/definition");
    expect(msg.params.textDocument.uri).toBe("file:///test.ts");
  });
});

describe("buildNotification", () => {
  it("builds a valid JSON-RPC notification (no id)", () => {
    const msg = buildNotification("textDocument/didOpen", { textDocument: {} });
    expect(msg.jsonrpc).toBe("2.0");
    expect(msg).not.toHaveProperty("id");
    expect(msg.method).toBe("textDocument/didOpen");
  });
});

describe("parseResponse", () => {
  it("parses a Content-Length framed response", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    const raw = `Content-Length: ${body.length}\r\n\r\n${body}`;
    const parsed = parseResponse(raw);
    expect(parsed.id).toBe(1);
    expect(parsed.result).toEqual({ ok: true });
  });

  it("returns null for incomplete data", () => {
    expect(parseResponse("Content-Length: 100\r\n\r\n{}")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/lsp/client.test.ts`
Expected: FAIL — module not found

**Step 3: Implement types + client**

Create `src/tools/lsp/types.ts`:

```typescript
export interface Position {
  line: number; // 0-based
  character: number; // 0-based
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Symbol {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

export interface DocumentSymbol {
  name: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface HoverResult {
  contents: { kind: string; value: string } | string;
  range?: Range;
}

export interface ServerConfig {
  command: string;
  args: string[];
  extensions: string[];
}
```

Create `src/tools/lsp/client.ts`:

```typescript
import type { Position } from "./types.js";
import { v4 as uuid } from "crypto";

let nextId = 1;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function buildRequest(
  method: string,
  params: Record<string, unknown>,
  id?: number,
): JsonRpcRequest {
  return { jsonrpc: "2.0", id: id ?? nextId++, method, params };
}

export function buildNotification(
  method: string,
  params: Record<string, unknown>,
): JsonRpcNotification {
  return { jsonrpc: "2.0", method, params };
}

export function parseResponse(raw: string): JsonRpcResponse | null {
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;

  const header = raw.slice(0, headerEnd);
  const match = header.match(/Content-Length:\s*(\d+)/i);
  if (!match) return null;

  const expectedLength = parseInt(match[1], 10);
  const bodyStart = headerEnd + 4;
  const body = raw.slice(bodyStart);

  if (body.length < expectedLength) return null;

  try {
    return JSON.parse(body.slice(0, expectedLength));
  } catch {
    return null;
  }
}

export function encodeMessage(msg: JsonRpcRequest | JsonRpcNotification): string {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

export function filePathToUri(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export function toLspPosition(line: number, character: number): Position {
  return { line: line - 1, character: character - 1 }; // Convert 1-based to 0-based
}
```

**Step 4: Run client tests**

Run: `pnpm vitest run tests/unit/tools/lsp/client.test.ts`
Expected: PASS

**Step 5: Commit Phase A**

```bash
mkdir -p src/tools/lsp tests/unit/tools/lsp
git add src/tools/lsp/types.ts src/tools/lsp/client.ts tests/unit/tools/lsp/client.test.ts
git commit -m "feat: add LSP JSON-RPC client with message framing"
```

---

## Phase B: Server Registry + Tool

**Step 6: Write the failing tool tests**

Create `tests/unit/tools/lsp.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createLspTool } from "@/tools/lsp.js";
import { getServerForFile } from "@/tools/lsp/servers.js";
import type { Tool } from "@/types.js";

describe("lsp tool", () => {
  const tool: Tool = createLspTool();

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("lsp");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("validates operation parameter", async () => {
    const result = await tool.execute(
      { operation: "invalid", filePath: "test.ts", line: 1, character: 1 },
      { workingDirectory: "/tmp", sessionId: "s1" },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("operation");
  });

  it("validates required parameters", async () => {
    const result = await tool.execute({}, { workingDirectory: "/tmp", sessionId: "s1" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("operation");
  });

  it("validates filePath is provided", async () => {
    const result = await tool.execute(
      { operation: "goToDefinition", line: 1, character: 1 },
      { workingDirectory: "/tmp", sessionId: "s1" },
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("filePath");
  });
});

describe("getServerForFile", () => {
  it("maps .ts files to typescript-language-server", () => {
    const server = getServerForFile("test.ts");
    expect(server).toBeDefined();
    expect(server!.extensions).toContain(".ts");
  });

  it("maps .py files to pyright", () => {
    const server = getServerForFile("main.py");
    expect(server).toBeDefined();
    expect(server!.extensions).toContain(".py");
  });

  it("returns undefined for unknown extensions", () => {
    expect(getServerForFile("readme.xyz")).toBeUndefined();
  });
});
```

**Step 7: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/lsp.test.ts`
Expected: FAIL — module not found

**Step 8: Implement server registry + tool**

Create `src/tools/lsp/servers.ts`:

```typescript
import path from "node:path";
import type { ServerConfig } from "./types.js";

const SERVERS: ServerConfig[] = [
  {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py", ".pyi"],
  },
  {
    command: "gopls",
    args: ["serve"],
    extensions: [".go"],
  },
  {
    command: "rust-analyzer",
    args: [],
    extensions: [".rs"],
  },
  {
    command: "vscode-css-language-server",
    args: ["--stdio"],
    extensions: [".css", ".scss", ".less"],
  },
  {
    command: "vscode-html-language-server",
    args: ["--stdio"],
    extensions: [".html", ".htm"],
  },
  {
    command: "vscode-json-language-server",
    args: ["--stdio"],
    extensions: [".json"],
  },
];

const extensionMap = new Map<string, ServerConfig>();
for (const server of SERVERS) {
  for (const ext of server.extensions) {
    extensionMap.set(ext, server);
  }
}

export function getServerForFile(filePath: string): ServerConfig | undefined {
  const ext = path.extname(filePath);
  return extensionMap.get(ext);
}

export function getAllServers(): ServerConfig[] {
  return SERVERS;
}
```

Create `src/tools/lsp.ts`:

```typescript
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";
import type { Location, DocumentSymbol, HoverResult } from "./lsp/types.js";
import {
  buildRequest,
  buildNotification,
  encodeMessage,
  parseResponse,
  filePathToUri,
  toLspPosition,
} from "./lsp/client.js";
import { getServerForFile } from "./lsp/servers.js";

const VALID_OPERATIONS = new Set([
  "goToDefinition",
  "findReferences",
  "hover",
  "documentSymbol",
  "goToImplementation",
]);

const INIT_TIMEOUT = 45_000;
const REQUEST_TIMEOUT = 10_000;

// Cache of active LSP clients per (root + server command)
const clients = new Map<string, LspClient>();

interface LspClient {
  process: ChildProcess;
  buffer: string;
  pending: Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void }>;
  nextId: number;
  initialized: boolean;
}

async function getOrCreateClient(
  root: string,
  filePath: string,
): Promise<LspClient | null> {
  const server = getServerForFile(filePath);
  if (!server) return null;

  const key = `${root}:${server.command}`;
  let client = clients.get(key);

  if (client && !client.process.killed) return client;

  const child = spawn(server.command, server.args, {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
  });

  client = { process: child, buffer: "", pending: new Map(), nextId: 1, initialized: false };

  child.stdout!.on("data", (chunk: Buffer) => {
    client!.buffer += chunk.toString();
    while (client!.buffer.length > 0) {
      const resp = parseResponse(client!.buffer);
      if (!resp) break;
      const body = JSON.stringify(resp);
      const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
      client!.buffer = client!.buffer.slice(header.length + Buffer.byteLength(body));
      if (resp.id != null) {
        const p = client!.pending.get(resp.id);
        if (p) {
          client!.pending.delete(resp.id);
          if (resp.error) p.reject(new Error(resp.error.message));
          else p.resolve(resp.result);
        }
      }
    }
  });

  clients.set(key, client);

  // Initialize
  const initReq = buildRequest("initialize", {
    processId: process.pid,
    rootUri: filePathToUri(root),
    capabilities: {},
  }, client.nextId++);

  await sendRequest(client, initReq, INIT_TIMEOUT);
  client.initialized = true;

  // Send initialized notification
  const notif = buildNotification("initialized", {});
  client.process.stdin!.write(encodeMessage(notif));

  return client;
}

function sendRequest(client: LspClient, req: ReturnType<typeof buildRequest>, timeout: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.pending.delete(req.id);
      reject(new Error("Request timed out"));
    }, timeout);

    client.pending.set(req.id, {
      resolve: (val) => { clearTimeout(timer); resolve(val); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });

    client.process.stdin!.write(encodeMessage(req));
  });
}

function formatLocations(locations: Location[]): string {
  if (!locations || locations.length === 0) return "No results found";
  return locations
    .map((l) => `${l.uri}:${l.start.line + 1}:${l.start.character + 1}`)
    .join("\n");
}

function formatHover(hover: HoverResult): string {
  if (!hover) return "No hover info";
  const contents = typeof hover.contents === "string"
    ? hover.contents
    : hover.contents.value;
  return contents;
}

function formatSymbols(symbols: DocumentSymbol[], indent = ""): string {
  return symbols
    .map((s) => `${indent}${s.name} (kind:${s.kind}) ${s.range.start.line + 1}:${s.range.start.character + 1}`)
    .concat(symbols.flatMap((s) => s.children ? formatSymbols(s.children, indent + "  ") : []))
    .join("\n");
}

export function createLspTool(): Tool {
  return {
    name: "lsp",
    description:
      "Language Server Protocol operations: goToDefinition, findReferences, hover, documentSymbol, goToImplementation.",
    inputSchema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["goToDefinition", "findReferences", "hover", "documentSymbol", "goToImplementation"],
          description: "The LSP operation to perform",
        },
        filePath: { type: "string", description: "File path (absolute or relative)" },
        line: { type: "number", description: "1-based line number" },
        character: { type: "number", description: "1-based character offset" },
      },
      required: ["operation", "filePath"],
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { operation, filePath: rawPath, line, character } = input as {
        operation?: string;
        filePath?: string;
        line?: number;
        character?: number;
      };

      if (!operation || !VALID_OPERATIONS.has(operation)) {
        return {
          toolCallId: "",
          content: `Invalid or missing operation. Must be one of: ${[...VALID_OPERATIONS].join(", ")}`,
          isError: true,
        };
      }

      if (!rawPath) {
        return { toolCallId: "", content: "Missing required parameter: filePath", isError: true };
      }

      const filePath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(ctx.workingDirectory, rawPath);

      const needsPosition = operation !== "documentSymbol";
      if (needsPosition && (line == null || character == null)) {
        return {
          toolCallId: "",
          content: "line and character are required for this operation",
          isError: true,
        };
      }

      let client: LspClient | null;
      try {
        client = await getOrCreateClient(ctx.workingDirectory, filePath);
      } catch (err) {
        return {
          toolCallId: "",
          content: `LSP client error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }

      if (!client) {
        return {
          toolCallId: "",
          content: `No LSP server configured for file extension: ${path.extname(filePath)}`,
          isError: true,
        };
      }

      const uri = filePathToUri(filePath);

      // Open document
      const openNotif = buildNotification("textDocument/didOpen", {
        textDocument: { uri, languageId: path.extname(filePath).slice(1), version: 0, text: "" },
      });
      client.process.stdin!.write(encodeMessage(openNotif));

      try {
        let method: string;
        let params: Record<string, unknown>;

        switch (operation) {
          case "goToDefinition":
            method = "textDocument/definition";
            params = { textDocument: { uri }, position: toLspPosition(line!, character!) };
            break;
          case "goToImplementation":
            method = "textDocument/implementation";
            params = { textDocument: { uri }, position: toLspPosition(line!, character!) };
            break;
          case "findReferences":
            method = "textDocument/references";
            params = { textDocument: { uri }, position: toLspPosition(line!, character!), context: { includeDeclaration: true } };
            break;
          case "hover":
            method = "textDocument/hover";
            params = { textDocument: { uri }, position: toLspPosition(line!, character!) };
            break;
          case "documentSymbol":
            method = "textDocument/documentSymbol";
            params = { textDocument: { uri } };
            break;
          default:
            return { toolCallId: "", content: `Unknown operation: ${operation}`, isError: true };
        }

        const req = buildRequest(method, params, client.nextId++);
        const result = await sendRequest(client, req, REQUEST_TIMEOUT);

        let content: string;
        switch (operation) {
          case "goToDefinition":
          case "goToImplementation":
          case "findReferences":
            content = formatLocations(
              Array.isArray(result) ? result : (result as any)?.locations ?? [],
            );
            break;
          case "hover":
            content = formatHover(result as HoverResult);
            break;
          case "documentSymbol":
            content = formatSymbols((result ?? []) as DocumentSymbol[]);
            break;
          default:
            content = JSON.stringify(result);
        }

        return {
          toolCallId: "",
          content,
          isError: false,
          title: `LSP ${operation}: ${path.basename(filePath)}`,
        };
      } catch (err) {
        return {
          toolCallId: "",
          content: `LSP request error: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
```

**Step 9: Run tool tests**

Run: `pnpm vitest run tests/unit/tools/lsp.test.ts`
Expected: PASS (validation tests pass; integration tests require actual LSP servers)

**Step 10: Commit Phase B**

```bash
git add src/tools/lsp.ts src/tools/lsp/servers.ts tests/unit/tools/lsp.test.ts
git commit -m "feat: add lsp tool with go-to-def, references, hover, symbols"
```
