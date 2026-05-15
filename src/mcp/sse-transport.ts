import http from "node:http";
import type { AddressInfo } from "node:net";
import { Socket } from "node:net";

export interface JSONRPCMessage {
  jsonrpc: "2.0";
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class SSETransport {
  private server: http.Server | null = null;
  private port: number;
  private host: string;
  private activeSockets = new Set<Socket>();

  constructor(options?: { port?: number; host?: string }) {
    this.port = options?.port ?? 3001;
    this.host = options?.host ?? "127.0.0.1";
  }

  async start(
    handler: (message: JSONRPCMessage) => Promise<JSONRPCMessage>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://${this.host}:${this.port}`);

        if (req.method === "GET" && url.pathname === "/sse") {
          this.handleSSE(res);
        } else if (req.method === "POST" && url.pathname === "/message") {
          this.handleMessage(req, res, handler);
        } else {
          res.writeHead(404);
          res.end("Not found");
        }
      });

      this.server.on("connection", (socket) => {
        this.activeSockets.add(socket);
        socket.on("close", () => this.activeSockets.delete(socket));
      });

      this.server.on("error", reject);

      this.server.listen(this.port, this.host, () => {
        const addr = this.server!.address() as AddressInfo;
        if (addr && typeof addr === "object") {
          this.port = addr.port;
        }
        resolve();
      });
    });
  }

  private handleSSE(res: http.ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const messageUrl = `http://${this.host}:${this.port}/message`;
    res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);
  }

  private handleMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    handler: (message: JSONRPCMessage) => Promise<JSONRPCMessage>,
  ): void {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      let parsed: JSONRPCMessage;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      if (parsed.jsonrpc !== "2.0") {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "Not a JSON-RPC 2.0 message" }));
        return;
      }

      try {
        const result = await handler(parsed);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsed.id ?? null,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : String(err),
            },
          }),
        );
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      for (const socket of this.activeSockets) {
        socket.destroy();
      }
      this.activeSockets.clear();

      this.server.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }
}
