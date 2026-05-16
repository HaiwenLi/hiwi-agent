import { describe, expect, it } from "vitest";
import { createAgentFSTools } from "@/tools/agentfs-tools.js";
import { AgentFS } from "@/agentfs/index.js";
import type { ToolContext } from "@/types.js";

describe("agentfs tools", () => {
  const ctx: ToolContext = { workingDirectory: "/tmp", sessionId: "test" };

  it("creates the correct set of tools", () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    const tools = createAgentFSTools(agentfs);
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      "agentfs_kv_get",
      "agentfs_kv_list",
      "agentfs_kv_set",
      "agentfs_ls",
      "agentfs_read",
      "agentfs_stat",
      "agentfs_write",
    ]);
    agentfs.close();
  });

  it("agentfs_read reads a file from virtual fs", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    agentfs.fs.writeFile("/hello.txt", "world");
    const tools = createAgentFSTools(agentfs);
    const readTool = tools.find(t => t.name === "agentfs_read")!;
    const result = await readTool.execute({ path: "/hello.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toBe("world");
    agentfs.close();
  });

  it("agentfs_read returns error for nonexistent path", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    const tools = createAgentFSTools(agentfs);
    const readTool = tools.find(t => t.name === "agentfs_read")!;
    const result = await readTool.execute({ path: "/nonexistent" }, ctx);
    expect(result.isError).toBe(true);
    agentfs.close();
  });

  it("agentfs_write writes file to virtual fs", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    const tools = createAgentFSTools(agentfs);
    const writeTool = tools.find(t => t.name === "agentfs_write")!;
    await writeTool.execute({ path: "/test.txt", content: "hello" }, ctx);
    expect(agentfs.fs.readFile("/test.txt", "utf-8")).toBe("hello");
    agentfs.close();
  });

  it("agentfs_ls lists directory contents", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    agentfs.fs.writeFile("/a.txt", "a");
    agentfs.fs.mkdir("/sub");
    const tools = createAgentFSTools(agentfs);
    const lsTool = tools.find(t => t.name === "agentfs_ls")!;
    const result = await lsTool.execute({ path: "/" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("a.txt");
    expect(result.content).toContain("sub");
    agentfs.close();
  });

  it("agentfs_stat returns file metadata", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    agentfs.fs.writeFile("/me.txt", "data");
    const tools = createAgentFSTools(agentfs);
    const statTool = tools.find(t => t.name === "agentfs_stat")!;
    const result = await statTool.execute({ path: "/me.txt" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("file");
    agentfs.close();
  });

  it("agentfs_kv_set and agentfs_kv_get round-trip", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    const tools = createAgentFSTools(agentfs);
    const setTool = tools.find(t => t.name === "agentfs_kv_set")!;
    const getTool = tools.find(t => t.name === "agentfs_kv_get")!;
    await setTool.execute({ key: "test", value: "hello" }, ctx);
    const result = await getTool.execute({ key: "test" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("hello");
    agentfs.close();
  });

  it("agentfs_kv_list returns keys with prefix", async () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    agentfs.kv.set("user:1", "alice");
    agentfs.kv.set("user:2", "bob");
    const tools = createAgentFSTools(agentfs);
    const listTool = tools.find(t => t.name === "agentfs_kv_list")!;
    const result = await listTool.execute({ prefix: "user:" }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("user:1");
    expect(result.content).toContain("user:2");
    agentfs.close();
  });
});
