import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMCPTools, type MCPToolContext } from "./tools.js";

export interface MCPServerOptions {
  transport?: "stdio" | "sse";
  port?: number;
}

export class MCPServer {
  private server: Server;
  private tools: ReturnType<typeof createMCPTools>;
  private options: MCPServerOptions;

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
    this.server.setRequestHandler(
      { method: "tools/list" } as any,
      async () => ({
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }),
    );

    this.server.setRequestHandler(
      { method: "tools/call" } as any,
      async (request: any) => {
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
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      },
    );
  }

  async start(): Promise<void> {
    if (this.options.transport === "sse") {
      throw new Error("SSE transport not yet implemented. Use stdio mode.");
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  getRegisteredTools() {
    return this.tools.map((t) => ({ name: t.name, description: t.description }));
  }

  getTransportMode() {
    return this.options.transport ?? "stdio";
  }

  getPort() {
    return this.options.port ?? 0;
  }
}
