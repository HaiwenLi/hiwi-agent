import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockAdapter } from "@/adapters/mock.js";
import { AutoExtractor } from "@/memory/auto-extract.js";
import { EntityLinker } from "@/memory/entity-link.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { KnowledgeBase } from "@/memory/knowledge-base.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { SessionSummarizer } from "@/memory/session-summary.js";
import { UserProfileManager } from "@/memory/user-profile.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Memory Intelligence Integration", () => {
  let store: MemoryFileStore;
  let mem0: Mem0Client;
  let manager: MemoryManager;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hiwi-mem-intel-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
    await store.init();
    mem0 = new Mem0Client({ apiKey: undefined });
    manager = new MemoryManager(store, mem0);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("auto-extraction + entity linking", () => {
    it("extracts facts and updates entity index", async () => {
      const llm = new MockAdapter([
        {
          content: JSON.stringify([
            {
              content: "User prefers TypeScript for new projects",
              category: "preference",
              confidence: 0.9,
              entities: ["TypeScript"],
            },
          ]),
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const extractor = new AutoExtractor(llm, store);
      const linker = new EntityLinker(store);

      const messages = [
        { role: "user" as const, content: "Use TypeScript for the new agent project" },
        { role: "assistant" as const, content: "Great choice. TypeScript provides strong typing." },
      ];

      const facts = await extractor.extract(messages);
      expect(facts.length).toBeGreaterThanOrEqual(1);

      await extractor.storeFacts(facts);
      const memories = await store.list({ type: "auto" });
      expect(memories.length).toBeGreaterThanOrEqual(1);

      for (const mem of memories) {
        await linker.updateIndex(mem.name, mem.content);
      }
      const tsMemories = await linker.findByEntity("TypeScript");
      expect(tsMemories.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("entity linking in memory manager", () => {
    it("updates entity index on remember", async () => {
      const linker = new EntityLinker(store);

      await manager.remember(
        "ts-decision",
        "auto",
        "TS decision",
        "We chose TypeScript for the project",
      );
      await linker.updateIndex("ts-decision", "We chose TypeScript for the project");

      const related = await linker.findByEntity("TypeScript");
      expect(related.length).toBeGreaterThanOrEqual(1);
    });

    it("removes from entity index on forget", async () => {
      const linker = new EntityLinker(store);

      await manager.remember("temp-mem", "auto", "Temp", "Using React for the frontend");
      await linker.updateIndex("temp-mem", "Using React for the frontend");

      await manager.forget("temp-mem");
      await linker.removeFromIndex("temp-mem");

      const found = await linker.findByEntity("React");
      expect(found).toHaveLength(0);
    });
  });

  describe("knowledge base + prompt injection", () => {
    it("adds knowledge and retrieves for prompt context", async () => {
      const kb = new KnowledgeBase(store);

      await kb.add({
        name: "ts-best-practice",
        domain: "typescript",
        pattern: "Use interfaces for object shapes, types for unions",
      });

      const context = await kb.injectContext("TypeScript types and interfaces");
      expect(context.isOk()).toBe(true);
      if (context.isOk()) {
        expect(context.value).toContain("typescript");
        expect(context.value).toContain("interfaces");
      }
    });
  });

  describe("user profile + prompt injection", () => {
    it("creates profile and generates markdown for system prompt", async () => {
      const profileMgr = new UserProfileManager(store);

      await profileMgr.updateProfile({
        role: "Senior backend engineer",
        expertise: ["Go", "TypeScript", "distributed systems"],
        preferences: ["terse explanations"],
        communicationStyle: "Direct",
      });

      const md = await profileMgr.toMarkdown();
      expect(md.isOk()).toBe(true);
      if (md.isOk()) {
        expect(md.value).toContain("Senior backend engineer");
        expect(md.value).toContain("Go");
        expect(md.value).toContain("Direct");
      }
    });
  });

  describe("session summarization flow", () => {
    it("summarizes a multi-turn session and stores it", async () => {
      const llm = new MockAdapter([
        {
          content: JSON.stringify({
            topics: ["testing", "TypeScript"],
            decisions: ["use vitest"],
            filesModified: ["src/test.ts"],
            keyInsights: ["vitest needs path aliases configured"],
            duration: 10,
          }),
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const summarizer = new SessionSummarizer(llm, store);

      const messages = [
        { role: "user" as const, content: "Set up vitest" },
        { role: "assistant" as const, content: "Configuring vitest with TypeScript support." },
        { role: "user" as const, content: "Add path aliases" },
        { role: "assistant" as const, content: "Done, @ alias is configured." },
      ];

      const summary = await summarizer.summarize(messages, "2026-05-15");
      expect(summary.isOk()).toBe(true);
      if (summary.isOk() && summary.value) {
        const storeResult = await summarizer.storeSummary(summary.value);
        expect(storeResult.isOk()).toBe(true);

        const sessions = await store.list({ type: "session" });
        expect(sessions.length).toBe(1);
        expect(sessions[0].content).toContain("vitest");
      }
    });
  });

  describe("full pipeline", () => {
    it("auto-extract → entity link → knowledge base → prompt injection", async () => {
      const llm = new MockAdapter([
        {
          content: JSON.stringify([
            {
              content: "Always use strict TypeScript configuration",
              category: "preference",
              confidence: 0.95,
              entities: ["TypeScript"],
            },
          ]),
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const extractor = new AutoExtractor(llm, store);
      const linker = new EntityLinker(store);
      const kb = new KnowledgeBase(store);

      const facts = await extractor.extract([
        { role: "user" as const, content: "Enable strict mode in TypeScript" },
        { role: "assistant" as const, content: "Enabling strict TypeScript configuration." },
      ]);
      expect(facts.length).toBeGreaterThanOrEqual(1);

      await extractor.storeFacts(facts);

      for (const fact of facts) {
        await kb.add({
          name: `kb-${fact.category}-${Date.now()}`,
          domain: "typescript",
          pattern: fact.content,
        });
      }

      const context = await kb.injectContext("TypeScript configuration");
      expect(context.isOk()).toBe(true);
      if (context.isOk()) {
        expect(context.value).toContain("TypeScript");
      }

      const profileMgr = new UserProfileManager(store);
      const profileMd = await profileMgr.toMarkdown();
      expect(profileMd.isOk()).toBe(true);
    });
  });
});
