import { describe, it, expect, vi, beforeEach } from "vitest";
import { MCPServer } from "@/mcp/server.js";
import type { MCPToolContext } from "@/mcp/tools.js";

// Mock the MCP SDK
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(() => ({ connect: vi.fn() })),
}));

describe("MCPServer", () => {
  let ctx: MCPToolContext;

  beforeEach(() => {
    ctx = {
      memoryManager: {
        recall: vi.fn(async () => ({ isOk: () => true, value: [] })),
        remember: vi.fn(async () => ({ isOk: () => true })),
        getSystemContext: vi.fn(async () => ""),
      } as any,
      skillRegistry: {
        list: vi.fn(() => []),
        getByTrigger: vi.fn(() => null),
      } as any,
      providerRegistry: {
        listModels: vi.fn(() => []),
        getActiveProvider: vi.fn(() => "anthropic"),
        getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({ isOk: () => true, value: { events: [] } })),
      } as any,
    };
  });

  it("creates server with tool context", () => {
    const server = new MCPServer(ctx);
    expect(server).toBeDefined();
  });

  it("registers tools from context", () => {
    const server = new MCPServer(ctx);
    const tools = server.getRegisteredTools();
    expect(tools).toHaveLength(6);
  });

  it("creates with stdio transport mode", () => {
    const server = new MCPServer(ctx, { transport: "stdio" });
    expect(server.getTransportMode()).toBe("stdio");
  });

  it("creates with SSE transport mode", () => {
    const server = new MCPServer(ctx, { transport: "sse", port: 3000 });
    expect(server.getTransportMode()).toBe("sse");
    expect(server.getPort()).toBe(3000);
  });
});
