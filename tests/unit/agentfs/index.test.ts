import { AgentFS } from "@/agentfs/index.js";
import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

describe("AgentFS", () => {
  const dbPath = path.join(os.tmpdir(), `agentfs-test-${Date.now()}.db`);

  it("creates all three subsystems on init", () => {
    const agentfs = new AgentFS(dbPath);
    agentfs.init();
    expect(agentfs.trail).toBeDefined();
    expect(agentfs.fs).toBeDefined();
    expect(agentfs.kv).toBeDefined();
    agentfs.close();
    fs.unlinkSync(dbPath);
  });

  it("all subsystems are operational after init", () => {
    const agentfs = new AgentFS(dbPath);
    agentfs.init();
    // Audit trail works
    const id = agentfs.trail.start("test_tool", {});
    agentfs.trail.success(id, "ok");
    expect(agentfs.trail.get(id)!.status).toBe("success");

    // Virtual FS works
    agentfs.fs.writeFile("/hello.txt", "world");
    expect(agentfs.fs.readFile("/hello.txt", "utf-8")).toBe("world");

    // KV Store works
    agentfs.kv.set("key", "value");
    expect(agentfs.kv.get("key")).toBe("value");

    agentfs.close();
    fs.unlinkSync(dbPath);
  });

  it("using :memory: database works", () => {
    const agentfs = new AgentFS(":memory:");
    agentfs.init();
    expect(agentfs.trail).toBeDefined();
    expect(agentfs.fs).toBeDefined();
    expect(agentfs.kv).toBeDefined();
    agentfs.close();
  });
});
