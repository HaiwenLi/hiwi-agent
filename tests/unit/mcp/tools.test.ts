import { type MCPToolContext, createMCPTools } from "@/mcp/tools.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("MCP Tools", () => {
  let ctx: MCPToolContext;

  beforeEach(() => {
    ctx = {
      memoryManager: {
        recall: vi.fn(async () => ({
          isOk: () => true,
          value: [
            {
              name: "user-profile",
              content: "Alice is a developer",
              type: "user",
              score: 1,
              source: "file",
              description: "",
            },
          ],
        })),
        remember: vi.fn(async () => ({ isOk: () => true })),
        getSystemContext: vi.fn(async () => "# Memory Index\n\n- [user-profile](user-profile.md)"),
      } as any,
      skillRegistry: {
        list: vi.fn(() => [
          {
            name: "paper-search",
            trigger: "/paper-search",
            description: "Search papers",
            type: "domain",
            prompt: "Search",
            sourcePath: "",
          },
        ]),
        getByTrigger: vi.fn(() => null),
      } as any,
      providerRegistry: {
        listModels: vi.fn(() => [
          {
            id: "claude-sonnet-4-6",
            provider: "anthropic",
            capabilities: { tools: true, vision: true, maxTokens: 16384, contextWindow: 200000 },
          },
        ]),
        getActiveProvider: vi.fn(() => "anthropic"),
        getActiveModel: vi.fn(() => "claude-sonnet-4-6"),
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({
          isOk: () => true,
          value: { events: [{ type: "text-delta", text: "Skill result" }] },
        })),
      } as any,
    };
  });

  it("creates all 6 MCP tools", () => {
    const tools = createMCPTools(ctx);
    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "memory_add",
      "memory_get_context",
      "memory_search",
      "model_list",
      "skill_execute",
      "skill_list",
    ]);
  });

  it("memory_search returns results", async () => {
    const tools = createMCPTools(ctx);
    const searchTool = tools.find((t) => t.name === "memory_search")!;
    const result = await searchTool.handler({ query: "developer" });
    expect(result.content).toContain("user-profile");
    expect(result.content).toContain("Alice");
  });

  it("memory_add saves a memory", async () => {
    const tools = createMCPTools(ctx);
    const addTool = tools.find((t) => t.name === "memory_add")!;
    const result = await addTool.handler({
      name: "test",
      content: "Test memory",
      type: "knowledge",
    });
    expect(ctx.memoryManager.remember).toHaveBeenCalledWith(
      "test",
      "knowledge",
      "test",
      "Test memory",
    );
    expect(result.content).toContain("Saved");
  });

  it("memory_get_context returns system context", async () => {
    const tools = createMCPTools(ctx);
    const ctxTool = tools.find((t) => t.name === "memory_get_context")!;
    const result = await ctxTool.handler({});
    expect(result.content).toContain("user-profile");
  });

  it("skill_list lists available skills", async () => {
    const tools = createMCPTools(ctx);
    const listTool = tools.find((t) => t.name === "skill_list")!;
    const result = await listTool.handler({});
    expect(result.content).toContain("paper-search");
  });

  it("skill_execute runs a skill", async () => {
    ctx.skillRegistry.getByTrigger = vi.fn(() => ({
      name: "paper-search",
      trigger: "/paper-search",
      description: "Search papers",
      type: "domain",
      prompt: "Search",
      sourcePath: "",
      tools: [],
    })) as any;

    const tools = createMCPTools(ctx);
    const execTool = tools.find((t) => t.name === "skill_execute")!;
    const result = await execTool.handler({ skill: "/paper-search", input: "transformers" });
    expect(ctx.skillExecutor.execute).toHaveBeenCalled();
  });

  it("model_list lists models", async () => {
    const tools = createMCPTools(ctx);
    const listTool = tools.find((t) => t.name === "model_list")!;
    const result = await listTool.handler({});
    expect(result.content).toContain("claude-sonnet-4-6");
    expect(result.content).toContain("anthropic");
  });
});
