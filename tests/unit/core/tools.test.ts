import { describe, it, expect, beforeEach, vi } from "vitest";
import { ToolRegistry } from "@/core/tools.js";
import type { Tool, ToolContext, PermissionMode } from "@/types.js";

const makeTool = (overrides: Partial<Tool> = {}): Tool => ({
  name: overrides.name ?? "test_tool",
  description: overrides.description ?? "A test tool",
  inputSchema: { type: "object" },
  capabilities: overrides.capabilities ?? ["ReadOnly"],
  execute: overrides.execute ?? vi.fn(async () => ({
    toolCallId: "c1",
    content: "ok",
    isError: false,
  })),
});

const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "s1" };

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and retrieves a tool", () => {
    const tool = makeTool();
    registry.register(tool);
    expect(registry.get("test_tool")).toBe(tool);
  });

  it("lists all registered tools", () => {
    registry.register(makeTool({ name: "tool_a" }));
    registry.register(makeTool({ name: "tool_b" }));
    expect(registry.list()).toHaveLength(2);
  });

  it("returns undefined for unknown tool", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  describe("execute", () => {
    it("executes a ReadOnly tool in normal mode without asking", async () => {
      const tool = makeTool({ name: "read_file", capabilities: ["ReadOnly"] });
      registry.register(tool);
      const result = await registry.execute("read_file", { path: "/tmp/a" }, ctx, "normal");
      expect(result.isError).toBe(false);
      expect(result.content).toBe("ok");
    });

    it("executes a WriteFiles tool in normal mode with permission callback", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      const result = await registry.execute("write_file", { path: "/tmp/a" }, ctx, "normal");
      expect(onPermission).toHaveBeenCalledWith("write_file", "WriteFiles");
      expect(result.isError).toBe(false);
    });

    it("returns permission denied when user rejects", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => false);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      const result = await registry.execute("write_file", { path: "/tmp/a" }, ctx, "normal");
      expect(result.isError).toBe(true);
      expect(result.content).toContain("denied");
    });

    it("auto-approves ReadOnly in auto mode", async () => {
      const tool = makeTool({ name: "read_file", capabilities: ["ReadOnly"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      await registry.execute("read_file", {}, ctx, "auto");
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("asks for WriteFiles in auto mode", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      await registry.execute("write_file", {}, ctx, "auto");
      expect(onPermission).toHaveBeenCalledWith("write_file", "WriteFiles");
    });

    it("auto-approves everything in yolo mode", async () => {
      const tool = makeTool({ name: "bash", capabilities: ["ExecCode", "WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      await registry.execute("bash", { command: "rm -rf /" }, ctx, "yolo");
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("returns error for unknown tool", async () => {
      const result = await registry.execute("nonexistent", {}, ctx, "normal");
      expect(result.isError).toBe(true);
      expect(result.content).toContain("not found");
    });

    it("remembers permission grant within session", async () => {
      const tool = makeTool({ name: "write_file", capabilities: ["WriteFiles"] });
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });
      registry.register(tool);

      // First call asks
      await registry.execute("write_file", { path: "/tmp/a" }, ctx, "normal");
      // Second call should not ask (remembered)
      await registry.execute("write_file", { path: "/tmp/b" }, ctx, "normal");
      expect(onPermission).toHaveBeenCalledTimes(1);
    });
  });

  it("converts registered tools to ToolDefinition format for adapters", () => {
    registry.register(makeTool({
      name: "read_file",
      description: "Read a file",
      inputSchema: { type: "object", properties: { path: { type: "string" } } },
    }));
    const defs = registry.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe("read_file");
    expect(defs[0].inputSchema).toBeDefined();
  });
});
