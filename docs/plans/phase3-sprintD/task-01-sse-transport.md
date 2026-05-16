# Task 01: SSE Transport for MCP Server

**Files:**
- Create: `src/mcp/sse-transport.ts`
- Modify: `src/mcp/server.ts`
- Create: `tests/unit/mcp/sse-transport.test.ts`

**Design Reference:** `docs/plans/2026-05-13-personal-agent-design.md` — MCP / Multiple Transport

## Goal

Replace the `throw new Error("SSE transport not yet implemented")` in `server.ts:70` with a working Server-Sent Events transport, enabling browser-based and HTTP-based MCP clients.

## Current State

```typescript
// src/mcp/server.ts line 69-70
if (this.options.transport === "sse") {
  throw new Error("SSE transport not yet implemented. Use stdio mode.");
}
```

## Interface

```typescript
// src/mcp/sse-transport.ts

export class SSETransport {
  constructor(options?: { port?: number; host?: string });

  async start(handler: (message: JSONRPCMessage) => Promise<JSONRPCMessage>): Promise<void>;
  async stop(): Promise<void>;

  // SSE endpoint receives POST with JSON-RPC, sends responses via SSE stream
  // GET /sse — opens SSE stream for server-to-client messages
  // POST /message — client-to-server messages
}
```

## Behavior

1. Start HTTP server on configurable port (default: 3001)
2. `GET /sse` endpoint opens a persistent SSE connection for pushing responses
3. `POST /message` endpoint receives JSON-RPC requests
4. Messages are correlated via session ID in query params
5. Graceful shutdown closes all connections

## MCP Protocol Compliance

- Follow MCP SSE transport spec: client connects to `/sse`, receives an `endpoint` event with the POST URL
- All JSON-RPC messages follow the same format as stdio transport
- Support multiple concurrent SSE connections

## Integration

```typescript
// src/mcp/server.ts — update start():
if (this.options.transport === "sse") {
  const sse = new SSETransport({ port: this.options.port, host: this.options.host });
  await sse.start(this.handleMessage.bind(this));
  this.transport = sse;
}
```

## Edge Cases

- Client disconnects mid-request → clean up, log warning
- Multiple clients connecting → each gets unique session
- Port already in use → clear error message with suggestion
- Large responses → chunk if needed

## Tests

- Start SSE server and connect a client
- Send JSON-RPC request via POST, receive response via SSE
- Handle client disconnection gracefully
- Multiple concurrent clients
- Port conflict error handling
- Graceful shutdown closes all connections
