import { ToolRegistry } from "@/core/tools.js";
import { registerCoreTools, registerExtraTools } from "@/tools/index.js";
import { describe, expect, it } from "vitest";

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
    expect((readDef?.inputSchema as any).properties.path).toBeDefined();
  });
});

describe("extra tools registration", () => {
  it("registers all 10 extra tools", () => {
    const registry = new ToolRegistry();
    registerExtraTools(registry);
    const names = registry.list().map((t) => t.name);

    expect(names).toContain("academic_search");
    expect(names).toContain("apply_patch");
    expect(names).toContain("git");
    expect(names).toContain("read_image");
    expect(names).toContain("web_fetch");
    expect(names).toContain("web_search");
    expect(names).toContain("repo_overview");
    expect(names).toContain("question");
    expect(names).toContain("todo");
    expect(names).toContain("lsp");
    expect(names).toHaveLength(10);
  });

  it("all extra tools have valid schemas", () => {
    const registry = new ToolRegistry();
    registerExtraTools(registry);
    const defs = registry.toToolDefinitions();

    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toBeDefined();
      expect((def.inputSchema as any).type).toBe("object");
    }
  });
});

describe("combined tools registration", () => {
  it("registers all 16 tools together without conflicts", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    registerExtraTools(registry);
    const names = registry.list().map((t) => t.name);

    expect(names).toHaveLength(16);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all 16 tools produce valid tool definitions for model", () => {
    const registry = new ToolRegistry();
    registerCoreTools(registry);
    registerExtraTools(registry);
    const defs = registry.toToolDefinitions();

    expect(defs).toHaveLength(16);
    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect((def.inputSchema as any).type).toBe("object");
    }
  });
});
