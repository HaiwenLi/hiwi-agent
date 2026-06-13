import { ToolRegistry } from "@/core/tools.js";
import type { ToolContext } from "@/types.js";
import { makeTool } from "../../helpers/repl-helpers.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Shared test context ────────────────────────────────────────

const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "test" };

// ─── Tests ──────────────────────────────────────────────────────

describe("ToolRegistry permission flow", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  // ── Mode behaviors ──────────────────────────────────────────

  describe("mode behaviors", () => {
    it("yolo mode: all tools approved without callback", async () => {
      const tool = makeTool("writer", ["WriteFiles"]);
      registry.register(tool);

      const result = await registry.execute("writer", {}, ctx, "yolo");

      expect(result.isError).toBe(false);
      expect(result.content).toBe("writer result");
    });

    it("auto mode: ReadOnly tools auto-approved", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("reader", ["ReadOnly"]);
      registry.register(tool);

      const result = await registry.execute("reader", {}, ctx, "auto");

      expect(result.isError).toBe(false);
      expect(result.content).toBe("reader result");
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("auto mode: WriteFiles tools trigger callback", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("writer", ["WriteFiles"]);
      registry.register(tool);

      const result = await registry.execute("writer", {}, ctx, "auto");

      expect(result.isError).toBe(false);
      expect(onPermission).toHaveBeenCalledWith("writer", "WriteFiles");
    });

    it("normal mode: ReadOnly tools auto-approved", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("reader", ["ReadOnly"]);
      registry.register(tool);

      const result = await registry.execute("reader", {}, ctx, "normal");

      expect(result.isError).toBe(false);
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("normal mode: WriteFiles tools trigger callback", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("writer", ["WriteFiles"]);
      registry.register(tool);

      const result = await registry.execute("writer", {}, ctx, "normal");

      expect(result.isError).toBe(false);
      expect(onPermission).toHaveBeenCalledWith("writer", "WriteFiles");
    });

    it("normal mode: non-dangerous capabilities auto-approved", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("asker", ["UserInteraction"]);
      registry.register(tool);

      const result = await registry.execute("asker", {}, ctx, "normal");

      expect(result.isError).toBe(false);
      expect(onPermission).not.toHaveBeenCalled();
    });
  });

  // ── Permission cache ────────────────────────────────────────

  describe("permission cache", () => {
    it("first call triggers onPermission callback", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("writer", ["WriteFiles"]);
      registry.register(tool);

      await registry.execute("writer", {}, ctx, "normal");

      expect(onPermission).toHaveBeenCalledTimes(1);
      expect(onPermission).toHaveBeenCalledWith("writer", "WriteFiles");
    });

    it("second call skips callback (cached)", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      const tool = makeTool("writer", ["WriteFiles"]);
      registry.register(tool);

      await registry.execute("writer", {}, ctx, "normal");
      await registry.execute("writer", {}, ctx, "normal");

      expect(onPermission).toHaveBeenCalledTimes(1);
    });

    it("cache is per-tool, not global", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("writer_a", ["WriteFiles"]));
      registry.register(makeTool("writer_b", ["WriteFiles"]));

      await registry.execute("writer_a", {}, ctx, "normal");
      await registry.execute("writer_b", {}, ctx, "normal");

      expect(onPermission).toHaveBeenCalledTimes(2);
      expect(onPermission).toHaveBeenCalledWith("writer_a", "WriteFiles");
      expect(onPermission).toHaveBeenCalledWith("writer_b", "WriteFiles");
    });
  });

  // ── Callback return values ──────────────────────────────────

  describe("callback return values", () => {
    it("callback returns true → tool executes successfully", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("writer", ["WriteFiles"]));

      const result = await registry.execute("writer", {}, ctx, "normal");

      expect(result.isError).toBe(false);
      expect(result.content).toBe("writer result");
    });

    it("callback returns false → permission denied", async () => {
      const onPermission = vi.fn(async () => false);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("writer", ["WriteFiles"]));

      const result = await registry.execute("writer", {}, ctx, "normal");

      expect(result.isError).toBe(true);
      expect(result.content).toContain("Permission denied");
    });

    it("no callback registered + dangerous tool → denied by default", async () => {
      registry = new ToolRegistry(); // no onPermission

      registry.register(makeTool("writer", ["WriteFiles"]));

      const result = await registry.execute("writer", {}, ctx, "normal");

      expect(result.isError).toBe(true);
      expect(result.content).toContain("Permission denied");
    });
  });

  // ── Tool not found ──────────────────────────────────────────

  describe("tool not found", () => {
    it("executing unregistered tool returns error", async () => {
      const result = await registry.execute("nonexistent", {}, ctx, "normal");

      expect(result.isError).toBe(true);
      expect(result.content).toContain("Tool not found");
    });
  });

  // ── Tool execution errors ───────────────────────────────────

  describe("tool execution errors", () => {
    it("tool throws error → caught and returned as ToolResult", async () => {
      registry.register({
        name: "crasher",
        description: "always crashes",
        inputSchema: { type: "object" },
        capabilities: ["ReadOnly"],
        execute: async () => {
          throw new Error("boom");
        },
      });

      const result = await registry.execute("crasher", {}, ctx, "normal");

      expect(result.isError).toBe(true);
      expect(result.content).toContain("Tool execution error");
      expect(result.content).toContain("boom");
    });

    it("tool returns normal result → passed through", async () => {
      registry.register({
        name: "greeter",
        description: "says hello",
        inputSchema: { type: "object" },
        capabilities: ["ReadOnly"],
        execute: async () => ({ content: "hello", isError: false }),
      });

      const result = await registry.execute("greeter", {}, ctx, "normal");

      expect(result.isError).toBe(false);
      expect(result.content).toBe("hello");
    });
  });

  // ── Multiple capabilities ───────────────────────────────────

  describe("multiple capabilities", () => {
    it("tool with ReadOnly + WriteFiles triggers callback for WriteFiles", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("hybrid", ["ReadOnly", "WriteFiles"]));

      await registry.execute("hybrid", {}, ctx, "normal");

      expect(onPermission).toHaveBeenCalledTimes(1);
      expect(onPermission).toHaveBeenCalledWith("hybrid", "WriteFiles");
    });

    it("tool with multiple dangerous caps stops at first dangerous", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("multi_danger", ["ExecCode", "Network"]));

      await registry.execute("multi_danger", {}, ctx, "normal");

      expect(onPermission).toHaveBeenCalledTimes(1);
      // "ExecCode" comes before "Network" in capabilities, so it is first dangerous
      expect(onPermission).toHaveBeenCalledWith("multi_danger", "ExecCode");
    });
  });

  // ── Edge cases ──────────────────────────────────────────────

  describe("edge cases", () => {
    it("empty capabilities array → auto-approved", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("empty", []));

      const result = await registry.execute("empty", {}, ctx, "normal");

      expect(result.isError).toBe(false);
      expect(onPermission).not.toHaveBeenCalled();
    });

    it("register and retrieve tool", () => {
      const tool = makeTool("my_tool", ["ReadOnly"]);
      registry.register(tool);

      expect(registry.get("my_tool")).toBe(tool);
    });

    it("list returns all registered tools", () => {
      registry.register(makeTool("a", ["ReadOnly"]));
      registry.register(makeTool("b", ["WriteFiles"]));
      registry.register(makeTool("c", ["ExecCode"]));

      const tools = registry.list();
      expect(tools).toHaveLength(3);
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(["a", "b", "c"]);
    });
  });

  // ── Permission mode transitions ─────────────────────────────

  describe("permission mode transitions", () => {
    it("execute same tool in normal (denied) then yolo (approved)", async () => {
      const onPermission = vi.fn(async () => false);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("writer", ["WriteFiles"]));

      // First call: normal mode, callback denies
      const result1 = await registry.execute("writer", {}, ctx, "normal");
      expect(result1.isError).toBe(true);
      expect(result1.content).toContain("Permission denied");

      // Second call: yolo mode, bypasses permissions entirely
      const result2 = await registry.execute("writer", {}, ctx, "yolo");
      expect(result2.isError).toBe(false);
      expect(result2.content).toBe("writer result");

      // Callback was only invoked for the normal-mode call
      expect(onPermission).toHaveBeenCalledTimes(1);
    });

    it("execute same tool in auto (approved for ReadOnly) then normal (approved for ReadOnly)", async () => {
      const onPermission = vi.fn(async () => true);
      registry = new ToolRegistry({ onPermission });

      registry.register(makeTool("reader", ["ReadOnly"]));

      const result1 = await registry.execute("reader", {}, ctx, "auto");
      expect(result1.isError).toBe(false);

      const result2 = await registry.execute("reader", {}, ctx, "normal");
      expect(result2.isError).toBe(false);

      // ReadOnly tools never trigger callback in any mode
      expect(onPermission).not.toHaveBeenCalled();
    });
  });
});
