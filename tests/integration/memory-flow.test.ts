import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockAdapter } from "@/adapters/mock.js";
import { ContextCompactor } from "@/memory/compaction.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { SessionStore } from "@/memory/session.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Integration: Memory Flow E2E", () => {
  const tmpDir = path.join(os.tmpdir(), "hiwi-memory-integration");
  let manager: MemoryManager;
  let session: SessionStore;
  let compactor: ContextCompactor;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });

    const fileStore = new MemoryFileStore(tmpDir);
    await fileStore.init();

    const mem0 = new Mem0Client({ apiKey: undefined });
    manager = new MemoryManager(fileStore, mem0);

    session = new SessionStore(path.join(tmpDir, "session.db"));
    session.init();

    mockAdapter = new MockAdapter([
      {
        content:
          "Goal: Test integration\nProgress: Memory flow working\nDecisions: Use hybrid memory\nNext: Test compaction\nFiles: test files",
        toolCalls: [],
        finishReason: "stop",
      },
    ]);
    compactor = new ContextCompactor(mockAdapter);
  });

  afterEach(async () => {
    session.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("runs full remember -> recall -> session -> compact flow", async () => {
    // 1. Remember memories
    const r1 = await manager.remember(
      "user-profile",
      "user",
      "User profile",
      "Alice is a backend developer who prefers Go",
    );
    expect(r1.isOk()).toBe(true);

    const r2 = await manager.remember(
      "project-agent",
      "project",
      "Agent project",
      "Building hiwi-agent with TypeScript and multi-model support",
    );
    expect(r2.isOk()).toBe(true);

    // 2. Recall memories
    const recall = await manager.recall("TypeScript");
    expect(recall.isOk()).toBe(true);
    if (recall.isOk()) {
      expect(recall.value.length).toBeGreaterThan(0);
      const found = recall.value.some((m) => m.content.includes("TypeScript"));
      expect(found).toBe(true);
    }

    // 3. Get system context
    const ctx = await manager.getSystemContext();
    expect(ctx).toContain("user-profile");
    expect(ctx).toContain("project-agent");

    // 4. Create session and add messages
    const s = session.createSession("/project/hiwi-agent");
    session.appendMessage(s.id, "system", "You are a helpful agent", 10);
    session.appendMessage(s.id, "user", "Build me an agent", 8);
    session.appendMessage(s.id, "assistant", "I'll help you build hiwi-agent with TypeScript", 15);

    const totalTokens = session.getTotalTokens(s.id);
    expect(totalTokens).toBe(33);

    // 5. Compact messages (force by using tight limit)
    const messages = session.getMessages(s.id).map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }));

    const compacted = await compactor.compact(messages, {
      contextLimit: 50,
      maxOutputTokens: 20,
      reserved: 10,
    });
    expect(compacted.compacted).toBe(true);
    expect(compacted.messages.length).toBeLessThanOrEqual(messages.length);

    // 6. Save summary to session
    if (compacted.summary) {
      session.saveSummary(s.id, compacted.summary);
      const savedSummary = session.getLatestSummary(s.id);
      expect(savedSummary?.content).toContain("Test integration");
    }

    // 7. Verify session can be found and resumed
    const found = session.findActiveSession("/project/hiwi-agent");
    expect(found?.id).toBe(s.id);

    session.completeSession(s.id);
    expect(session.findActiveSession("/project/hiwi-agent")).toBeNull();
  });

  it("handles forget flow correctly", async () => {
    await manager.remember("temp-note", "knowledge", "Temp note", "Temporary information");
    const recall1 = await manager.recall("Temporary");
    expect(recall1.isOk()).toBe(true);
    if (recall1.isOk()) {
      expect(recall1.value.length).toBeGreaterThan(0);
    }

    await manager.forget("temp-note");
    const recall2 = await manager.recall("Temporary");
    expect(recall2.isOk()).toBe(true);
    if (recall2.isOk()) {
      expect(recall2.value).toEqual([]);
    }
  });
});
