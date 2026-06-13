import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockAdapter } from "@/adapters/mock.js";
import { AutoExtractor } from "@/memory/auto-extract.js";
import { EntityLinker } from "@/memory/entity-link.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { KnowledgeBase } from "@/memory/knowledge-base.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import { SessionSummarizer } from "@/memory/session-summary.js";
import { UserProfileManager } from "@/memory/user-profile.js";

// ─── Helpers ────────────────────────────────────────────────────

interface SetupResult {
  store: MemoryFileStore;
  dir: string;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<SetupResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-pipe-"));
  const store = new MemoryFileStore(dir);
  await store.init();
  return {
    store,
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}

/** Creates a mock adapter whose chat() returns the given JSON string as content. */
function mockAdapterReturning(content: string): MockAdapter {
  return new MockAdapter([
    {
      content,
      toolCalls: [],
      finishReason: "stop",
    },
  ]);
}

/** Disconnected mem0 client (no API key → isConnected() is false). */
function disconnectedMem0(): Mem0Client {
  return new Mem0Client();
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Tests ──────────────────────────────────────────────────────

describe("Integration: Memory Pipeline", () => {
  let env: SetupResult;

  beforeEach(async () => {
    env = await setup();
  });

  afterEach(async () => {
    await env.cleanup();
  });

  // ── 1. Auto-extraction ──────────────────────────────────────

  it("multi-turn auto-extraction stores and indexes facts", async () => {
    const factJson = JSON.stringify([
      {
        content: "User prefers TypeScript over JavaScript for new projects",
        category: "preference",
        confidence: 0.9,
        entities: ["TypeScript", "JavaScript"],
      },
    ]);

    const mockLlm = mockAdapterReturning(factJson);
    const extractor = new AutoExtractor(mockLlm, env.store, { minTurns: 1 });

    const messages = [
      { role: "user" as const, content: "I want to start a new project with TypeScript" },
      {
        role: "assistant" as const,
        content: "Great choice! TypeScript provides strong type safety for new projects",
      },
    ];

    const facts = await extractor.extract(messages);
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toContain("TypeScript");

    await extractor.storeFacts(facts);

    const stored = await env.store.list({ type: "auto" });
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toContain("TypeScript");
    expect(stored[0].type).toBe("auto");
  });

  // ── 2. Entity linking ───────────────────────────────────────

  it("entity linking connects memories about TypeScript", async () => {
    const linker = new EntityLinker(env.store);

    // Store two memories about TypeScript directly via the file store
    await env.store.write(
      "ts-preferences",
      "preference",
      "TypeScript preferences",
      "User prefers TypeScript for all new projects and uses strict mode",
    );
    await linker.updateIndex("ts-preferences", "User prefers TypeScript for all new projects and uses strict mode");

    await env.store.write(
      "ts-project",
      "project",
      "TypeScript project",
      "Building a TypeScript agent with React frontend and Node backend",
    );
    await linker.updateIndex("ts-project", "Building a TypeScript agent with React frontend and Node backend");

    // Find by entity
    const found = await linker.findByEntity("TypeScript");
    expect(found).toHaveLength(2);
    const names = found.map((m) => m.name);
    expect(names).toContain("ts-preferences");
    expect(names).toContain("ts-project");

    // Link — ts-preferences should see ts-project as related via TypeScript
    const linked = await linker.link("ts-preferences");
    expect(linked.primary.name).toBe("ts-preferences");
    expect(linked.related.length).toBeGreaterThanOrEqual(1);
    const relatedNames = linked.related.map((r) => r.memory.name);
    expect(relatedNames).toContain("ts-project");
  });

  // ── 3. Knowledge base ───────────────────────────────────────

  it("knowledge base keyword search with domain filter", async () => {
    const kb = new KnowledgeBase(env.store);

    await kb.add({
      name: "kb-error-handling",
      domain: "patterns",
      pattern: "Always use Result<T,E> for fallible operations",
      examples: ["neverthrow Result type"],
    });
    await kb.add({
      name: "kb-react-hooks",
      domain: "frontend",
      pattern: "Use custom hooks for shared component logic",
      examples: ["useMemory, useAgent"],
    });
    await kb.add({
      name: "kb-dependency-injection",
      domain: "patterns",
      pattern: "Constructor injection for testability",
      examples: ["inject ModelAdapter into tools"],
    });

    // Keyword search for "Result" should find the error-handling entry
    const searchResult = await kb.search("Result");
    expect(searchResult.isOk()).toBe(true);
    if (searchResult.isOk()) {
      expect(searchResult.value.length).toBeGreaterThanOrEqual(1);
      const names = searchResult.value.map((e) => e.name);
      expect(names).toContain("kb-error-handling");
    }

    // Domain filter for "patterns" should return 2 entries
    const domainResult = await kb.getByDomain("patterns");
    expect(domainResult.isOk()).toBe(true);
    if (domainResult.isOk()) {
      expect(domainResult.value).toHaveLength(2);
      const domainNames = domainResult.value.map((e) => e.name);
      expect(domainNames).toContain("kb-error-handling");
      expect(domainNames).toContain("kb-dependency-injection");
    }

    // Domain filter for "frontend" should return 1 entry
    const frontendResult = await kb.getByDomain("frontend");
    expect(frontendResult.isOk()).toBe(true);
    if (frontendResult.isOk()) {
      expect(frontendResult.value).toHaveLength(1);
      expect(frontendResult.value[0].name).toBe("kb-react-hooks");
    }
  });

  // ── 4. User profile from auto facts ─────────────────────────

  it("user profile built from auto-extracted facts", async () => {
    // Manually store auto-extracted memories with tech terms and preferences
    await env.store.write(
      "auto-preference-ts",
      "auto",
      "Auto-extracted: TypeScript preference",
      "User prefers TypeScript and React for building web applications",
    );
    await env.store.write(
      "auto-role",
      "auto",
      "Auto-extracted: role",
      "User is a senior software engineer who likes Rust for systems work",
    );
    await env.store.write(
      "auto-pref-style",
      "auto",
      "Auto-extracted: code style",
      "User prefers concise code with minimal boilerplate",
    );

    const profileManager = new UserProfileManager(env.store);
    const result = await profileManager.buildFromMemories();
    expect(result.isOk()).toBe(true);

    if (result.isOk()) {
      const profile = result.value;
      // Tech terms detected: TypeScript, React, Rust
      expect(profile.expertise).toContain("TypeScript");
      expect(profile.expertise).toContain("React");
      expect(profile.expertise).toContain("Rust");
      // Preference detected ("prefers")
      expect(profile.preferences.length).toBeGreaterThanOrEqual(1);
      // Role detected ("senior software engineer")
      expect(profile.role).toBeDefined();
      expect(profile.role!.toLowerCase()).toContain("senior");
      expect(profile.role!.toLowerCase()).toContain("engineer");
    }

    // Profile was also persisted
    const stored = await env.store.read("user-profile");
    expect(stored).not.toBeNull();
    expect(stored!.content).toContain("TypeScript");
  });

  // ── 5. Session summary ──────────────────────────────────────

  it("session summary stored and retrievable", async () => {
    const summaryJson = JSON.stringify({
      topics: ["memory pipeline", "TypeScript"],
      decisions: ["use EntityLinker for cross-referencing"],
      filesModified: ["src/memory/manager.ts", "src/memory/entity-link.ts"],
      keyInsights: ["entity extraction uses static patterns, no LLM needed"],
      duration: 45,
    });

    const mockLlm = mockAdapterReturning(summaryJson);
    const summarizer = new SessionSummarizer(mockLlm, env.store);

    const messages = [
      { role: "user" as const, content: "Let's work on the memory pipeline today" },
      { role: "assistant" as const, content: "Sure, I'll start with the EntityLinker module" },
      { role: "user" as const, content: "Great, make sure it handles TypeScript extraction" },
      { role: "assistant" as const, content: "Done, entity extraction works with static patterns" },
      { role: "user" as const, content: "Now let's wire it into MemoryManager" },
      { role: "assistant" as const, content: "Wired up with fire-and-forget index updates" },
    ];

    const summarizeResult = await summarizer.summarize(messages, "2026-06-13");
    expect(summarizeResult.isOk()).toBe(true);

    if (summarizeResult.isOk() && summarizeResult.value) {
      const summary = summarizeResult.value;
      expect(summary.topics).toContain("memory pipeline");
      expect(summary.topics).toContain("TypeScript");
      expect(summary.decisions).toHaveLength(1);
      expect(summary.filesModified).toHaveLength(2);
      expect(summary.duration).toBe(45);

      // Store and verify retrievable
      const storeResult = await summarizer.storeSummary(summary);
      expect(storeResult.isOk()).toBe(true);

      if (storeResult.isOk()) {
        const storedName = storeResult.value;
        const stored = await env.store.read(storedName);
        expect(stored).not.toBeNull();
        expect(stored!.type).toBe("session");
        expect(stored!.content).toContain("memory pipeline");
        expect(stored!.content).toContain("EntityLinker");
        expect(stored!.content).toContain("45 minutes");
      }
    }
  });

  // ── 6. Forget cascade ───────────────────────────────────────

  it("forget cascade removes from entity index", async () => {
    const linker = new EntityLinker(env.store);

    // Write directly and index
    await env.store.write(
      "ts-knowledge",
      "knowledge",
      "TypeScript knowledge",
      "TypeScript is a typed superset of JavaScript that compiles to plain JS",
    );
    await linker.updateIndex("ts-knowledge", "TypeScript is a typed superset of JavaScript that compiles to plain JS");

    // Verify indexed
    let found = await linker.findByEntity("TypeScript");
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("ts-knowledge");

    // Delete and remove from index
    await env.store.delete("ts-knowledge");
    await linker.removeFromIndex("ts-knowledge");

    // Verify removed
    found = await linker.findByEntity("TypeScript");
    expect(found).toHaveLength(0);
  });

  // ── 7. Cross-session persistence ────────────────────────────

  it("cross-session memories persist across manager instances", async () => {
    // First session: write a memory
    const mem0 = disconnectedMem0();
    const manager1 = new MemoryManager(env.store, mem0);
    const r1 = await manager1.remember(
      "session1-fact",
      "fact",
      "Session 1 fact",
      "Important discovery about the memory pipeline architecture",
    );
    expect(r1.isOk()).toBe(true);

    // Simulate new session: create a second manager with the same store
    const manager2 = new MemoryManager(env.store, mem0);
    const recall = await manager2.recall("memory pipeline");
    expect(recall.isOk()).toBe(true);

    if (recall.isOk()) {
      expect(recall.value.length).toBeGreaterThanOrEqual(1);
      const found = recall.value.some((m) => m.name === "session1-fact");
      expect(found).toBe(true);
    }
  });

  // ── 8. Recall deduplication ──────────────────────────────────

  it("recall deduplicates file-sourced results", async () => {
    const mem0 = disconnectedMem0();
    const manager = new MemoryManager(env.store, mem0);

    await manager.remember(
      "unique-fact",
      "fact",
      "Unique fact about TypeScript",
      "TypeScript was created by Anders Hejlsberg at Microsoft",
    );

    const recall = await manager.recall("TypeScript");
    expect(recall.isOk()).toBe(true);

    if (recall.isOk()) {
      // Should find exactly one result — no duplicates
      const names = recall.value.map((r) => r.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
      expect(names).toContain("unique-fact");
    }
  });

  // ── 9. Knowledge base injectContext ──────────────────────────

  it("knowledge base injectContext returns formatted context", async () => {
    const kb = new KnowledgeBase(env.store);

    await kb.add({
      name: "kb-rest-api",
      domain: "api",
      pattern: "Use REST conventions for resource endpoints",
      examples: ["GET /memories, POST /memories"],
    });
    await kb.add({
      name: "kb-rest-error",
      domain: "api",
      pattern: "Return structured error responses from REST endpoints",
    });

    const ctxResult = await kb.injectContext("REST endpoints");
    expect(ctxResult.isOk()).toBe(true);

    if (ctxResult.isOk()) {
      const ctx = ctxResult.value;
      expect(ctx).toContain("## Relevant Knowledge");
      expect(ctx).toContain("[api]");
      expect(ctx).toContain("REST conventions");
    }
  });

  // ── 10. Auto-extractor deduplication ─────────────────────────

  it("auto-extractor deduplicates with existing facts", async () => {
    // Pre-store an existing auto-extracted fact whose content overlaps
    const existingContent = "User prefers TypeScript over JavaScript for backend services";
    await env.store.write(
      "auto-preference-existing",
      "auto",
      `Auto-extracted: ${existingContent.slice(0, 60)}`,
      existingContent,
    );

    // Mock LLM returns a fact whose first 30 chars overlap with existing
    const overlappingFact = "User prefers TypeScript over JavaScript for backend services with Node";
    const factJson = JSON.stringify([
      {
        content: overlappingFact,
        category: "preference",
        confidence: 0.9,
        entities: ["TypeScript", "JavaScript"],
      },
    ]);

    const mockLlm = mockAdapterReturning(factJson);
    const extractor = new AutoExtractor(mockLlm, env.store, { minTurns: 1 });

    const messages = [
      { role: "user" as const, content: "I really like TypeScript for backend services with Node" },
      { role: "assistant" as const, content: "Understood, TypeScript is a solid choice for backend with Node.js" },
    ];

    const facts = await extractor.extract(messages);
    // Should be deduplicated because the first 30 chars overlap with existing content
    expect(facts).toHaveLength(0);
  });
});
