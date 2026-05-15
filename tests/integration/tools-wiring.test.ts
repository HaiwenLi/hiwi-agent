import { describe, expect, it } from "vitest";
import { registerCoreTools } from "@/tools/index.js";
import { ToolRegistry } from "@/core/tools.js";

describe("core tools registration", () => {
  it("registers all 6 core tools", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const tools = registry.list();
    const names = tools.map((t) => t.name);

    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit_file");
    expect(names).toContain("glob");
    expect(names).toContain("grep");
    expect(names).toContain("bash");
    expect(tools).toHaveLength(6);
  });

  it("all tools have valid schemas", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const defs = registry.toToolDefinitions();

    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toBeDefined();
      expect((def.inputSchema as any).type).toBe("object");
    }
  });

  it("generates correct tool definitions for model", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    const defs = registry.toToolDefinitions();

    const readDef = defs.find((d) => d.name === "read_file");
    expect(readDef).toBeDefined();
    expect((readDef!.inputSchema as any).properties.path).toBeDefined();
  });
});
