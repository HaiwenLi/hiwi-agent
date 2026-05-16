import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@/core/tools.js";
import { AgentFS } from "@/agentfs/index.js";
import { createAgentFSTools } from "@/tools/agentfs-tools.js";
import { registerAgentFSTools } from "@/tools/index.js";

describe("agentfs wiring", () => {
  it("registerAgentFSTools registers all 7 tools in the registry", () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    const registry = new ToolRegistry();
    registerAgentFSTools(registry, agentfs);
    expect(registry.get("agentfs_read")).toBeDefined();
    expect(registry.get("agentfs_write")).toBeDefined();
    expect(registry.get("agentfs_ls")).toBeDefined();
    expect(registry.get("agentfs_stat")).toBeDefined();
    expect(registry.get("agentfs_kv_get")).toBeDefined();
    expect(registry.get("agentfs_kv_set")).toBeDefined();
    expect(registry.get("agentfs_kv_list")).toBeDefined();
    agentfs.close();
  });

  it("registry can execute agentfs_read tool", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    agentfs.fs.writeFile("/test.txt", "hello from wiring");
    const registry = new ToolRegistry();
    registerAgentFSTools(registry, agentfs);
    const result = await registry.execute("agentfs_read", { path: "/test.txt" }, { workingDirectory: "/tmp", sessionId: "test" }, "normal");
    expect(result.isError).toBe(false);
    expect(result.content).toBe("hello from wiring");
    agentfs.close();
  });

  it("createAgentFSTools returns 7 tools", () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    const tools = createAgentFSTools(agentfs);
    expect(tools).toHaveLength(7);
    agentfs.close();
  });
});
