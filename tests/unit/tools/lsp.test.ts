import { createLspTool } from "@/tools/lsp.js";
import { getServerForFile } from "@/tools/lsp/servers.js";
import type { Tool, ToolContext } from "@/types.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("lsp tool", () => {
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(() => {
    tool = createLspTool();
    ctx = { workingDirectory: "/project", sessionId: "test" };
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("lsp");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("validates operation parameter (invalid operation returns error)", async () => {
    const result = await tool.execute(
      { operation: "invalidOp", filePath: "test.ts", line: 1, character: 1 },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("operation");
  });

  it("validates required parameters (empty input returns error about operation)", async () => {
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("operation");
  });

  it("validates filePath is provided", async () => {
    const result = await tool.execute({ operation: "goToDefinition", line: 1, character: 1 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("filePath");
  });

  describe("getServerForFile", () => {
    it("maps .ts to typescript-language-server", () => {
      const server = getServerForFile("src/index.ts");
      expect(server).toBeDefined();
      expect(server?.command).toBe("typescript-language-server");
    });

    it("maps .py to pyright", () => {
      const server = getServerForFile("main.py");
      expect(server).toBeDefined();
      expect(server?.command).toBe("pyright-langserver");
    });

    it("returns undefined for unknown extensions", () => {
      const server = getServerForFile("readme.xyz");
      expect(server).toBeUndefined();
    });
  });
});
