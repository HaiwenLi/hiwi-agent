import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandRegistry } from "@/cli/commands.js";
import { ToolRegistry } from "@/core/tools.js";
import { createMCPTools } from "@/mcp/tools.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { SkillLoader } from "@/skills/loader.js";
import { SkillRegistry } from "@/skills/registry.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Integration: CLI + MCP", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-cli-integration");
  const skillsDir = path.join(tmpDir, "skills");
  const memoryDir = path.join(tmpDir, "memory");

  beforeEach(async () => {
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(memoryDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("discovers skills and exposes them via MCP", async () => {
    await fs.writeFile(
      path.join(skillsDir, "SKILL.md"),
      '---\nname: "echo"\ntype: domain\ndescription: "Echo input"\ntrigger: "/echo"\n---\n\nEcho back the input.',
    );

    const loader = new SkillLoader([skillsDir]);
    const skills = await loader.discover();
    expect(skills).toHaveLength(1);

    const skillRegistry = new SkillRegistry();
    for (const s of skills) skillRegistry.register(s);

    const memoryDir2 = path.join(tmpDir, "mem");
    await fs.mkdir(memoryDir2, { recursive: true });
    const fileStore = new MemoryFileStore(memoryDir2);
    await fileStore.init();
    const mem0 = new Mem0Client({ apiKey: undefined });
    const memMgr = new MemoryManager(fileStore, mem0);

    const mcpTools = createMCPTools({
      memoryManager: memMgr,
      skillRegistry,
      providerRegistry: {
        listModels: () => [],
        getActiveProvider: () => "test",
        getActiveModel: () => "test",
      } as any,
      skillExecutor: {
        execute: vi.fn(async () => ({ isOk: () => true, value: { events: [] } })),
      } as any,
    });

    const listResult = await mcpTools.find((t) => t.name === "skill_list")!.handler({});
    expect(listResult.content).toContain("/echo");
  });

  it("remembers and recalls via slash commands", async () => {
    const fileStore = new MemoryFileStore(memoryDir);
    await fileStore.init();
    const mem0 = new Mem0Client({ apiKey: undefined });
    const memMgr = new MemoryManager(fileStore, mem0);

    const addResult = await memMgr.remember("test-note", "knowledge", "Test", "Hello world note");
    expect(addResult.isOk()).toBe(true);

    const searchResult = await memMgr.recall("Hello");
    expect(searchResult.isOk()).toBe(true);
    if (searchResult.isOk()) {
      expect(searchResult.value.length).toBeGreaterThan(0);
      expect(searchResult.value[0].content).toContain("Hello world note");
    }
  });
});
