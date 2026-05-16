import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockAdapter } from "@/adapters/mock.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { SessionSummarizer, type SessionSummary } from "@/memory/session-summary.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SessionSummarizer", () => {
  let store: MemoryFileStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hiwi-session-summary-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("summarize", () => {
    it("generates summary from a multi-turn coding session", async () => {
      const summaryJson = JSON.stringify({
        topics: ["TypeScript configuration", "testing setup"],
        decisions: ["Use vitest for testing", "ESM modules"],
        filesModified: ["src/index.ts", "vitest.config.ts"],
        keyInsights: ["Vitest needs vite-tsconfig-paths for aliases"],
        duration: 15,
      });
      const llm = new MockAdapter([{ content: summaryJson, toolCalls: [], finishReason: "stop" }]);
      const summarizer = new SessionSummarizer(llm, store);
      const messages = [
        { role: "user" as const, content: "Set up vitest for this project" },
        { role: "assistant" as const, content: "I'll configure vitest with TypeScript support." },
        { role: "user" as const, content: "Now add the path aliases" },
        { role: "assistant" as const, content: "Done, @ alias is configured." },
      ];

      const result = await summarizer.summarize(messages, "2026-05-15");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.topics).toContain("TypeScript configuration");
        expect(result.value.filesModified).toHaveLength(2);
        expect(result.value.duration).toBe(15);
      }
    });

    it("skips summarization for short sessions", async () => {
      const llm = new MockAdapter([]);
      const summarizer = new SessionSummarizer(llm, store);
      const messages = [
        { role: "user" as const, content: "hi" },
        { role: "assistant" as const, content: "Hello!" },
      ];

      const result = await summarizer.summarize(messages, "2026-05-15");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it("handles LLM failure gracefully (fallback summary)", async () => {
      const llm = new MockAdapter([
        { content: "total garbage response", toolCalls: [], finishReason: "stop" },
      ]);
      const summarizer = new SessionSummarizer(llm, store);
      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as const,
        content: `Message ${i} with enough content to pass length check`,
      }));

      const result = await summarizer.summarize(messages, "2026-05-15");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value!.topics).toEqual([]);
        expect(result.value!.duration).toBe(0);
      }
    });
  });

  describe("storeSummary", () => {
    it("stores summary in correct file format", async () => {
      const llm = new MockAdapter([]);
      const summarizer = new SessionSummarizer(llm, store);
      const summary: SessionSummary = {
        date: "2026-05-15",
        topics: ["testing"],
        decisions: ["use vitest"],
        filesModified: ["src/test.ts"],
        keyInsights: ["learned X"],
        duration: 10,
      };

      const result = await summarizer.storeSummary(summary);
      expect(result.isOk()).toBe(true);

      const memories = await store.list({ type: "session" });
      expect(memories.length).toBe(1);
      expect(memories[0].content).toContain("testing");
      expect(memories[0].content).toContain("vitest");
    });

    it("extracts file paths from tool calls in messages", async () => {
      const summaryJson = JSON.stringify({
        topics: ["refactoring"],
        decisions: ["split module"],
        filesModified: ["src/core/agent.ts", "src/types.ts"],
        keyInsights: [],
        duration: 20,
      });
      const llm = new MockAdapter([{ content: summaryJson, toolCalls: [], finishReason: "stop" }]);
      const summarizer = new SessionSummarizer(llm, store);
      const messages = [
        { role: "user" as const, content: "Refactor the agent loop" },
        { role: "assistant" as const, content: "I'll split agent.ts into smaller modules." },
        { role: "user" as const, content: "Good, now update types.ts too" },
        { role: "assistant" as const, content: "Done, types.ts is updated." },
      ];

      const result = await summarizer.summarize(messages, "2026-05-15");
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value!.filesModified).toContain("src/core/agent.ts");
      }
    });
  });
});
