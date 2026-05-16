import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { type JSONRPCMessage, SSETransport } from "./sse-transport.js";
import { type MCPToolContext, createMCPTools } from "./tools.js";

export interface MCPServerOptions {
  transport?: "stdio" | "sse";
  port?: number;
  host?: string;
}

export class MCPServer {
  private server: Server;
  private tools: ReturnType<typeof createMCPTools>;
  private options: MCPServerOptions;
  private sseTransport: SSETransport | null = null;

  constructor(ctx: MCPToolContext, options: MCPServerOptions = {}) {
    this.options = options;

    this.tools = createMCPTools(ctx);

    this.server = new Server(
      { name: "hiwi-agent", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const toolArgs = request.params.arguments ?? {};

      const tool = this.tools.find((t) => t.name === toolName);
      if (!tool) {
        return {
          content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
          isError: true,
        };
      }

      try {
        const result = await tool.handler(toolArgs);
        return {
          content: [{ type: "text", text: result.content }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    if (this.options.transport === "sse") {
      const sse = new SSETransport({
        port: this.options.port,
        host: this.options.host,
      });
      await sse.start(async (msg) => this.handleJSONRPCMessage(msg));
      this.sseTransport = sse;
      return;
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  async stop(): Promise<void> {
    if (this.sseTransport) {
      await this.sseTransport.stop();
    }
  }

  private async handleJSONRPCMessage(msg: JSONRPCMessage): Promise<JSONRPCMessage> {
    const method = msg.method;

    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          tools: this.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };
    }

    if (method === "tools/call") {
      const params = msg.params as
        | { name?: string; arguments?: Record<string, unknown> }
        | undefined;
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      const tool = this.tools.find((t) => t.name === toolName);
      if (!tool) {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        };
      }

      try {
        const result = await tool.handler(toolArgs);
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { content: [{ type: "text", text: result.content }] },
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id: msg.id ?? null,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  }

  getRegisteredTools() {
    return this.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  getTransportMode() {
    return this.options.transport ?? "stdio";
  }

  getPort() {
    if (this.sseTransport) {
      return this.sseTransport.getPort();
    }
    return this.options.port ?? 0;
  }
}
