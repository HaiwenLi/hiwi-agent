import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockAdapter } from "@/adapters/mock.js";
import { AutoExtractor, type ExtractedFact } from "@/memory/auto-extract.js";
import { MemoryFileStore } from "@/memory/file-store.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeMessages(pairs: Array<[string, string]>) {
  return pairs.flatMap(([user, assistant]) => [
    { role: "user" as const, content: user },
    { role: "assistant" as const, content: assistant },
  ]);
}

describe("AutoExtractor", () => {
  let store: MemoryFileStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hiwi-auto-extract-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("extract", () => {
    it("extracts facts from a coding conversation turn", async () => {
      const llmResponse = JSON.stringify([
        {
          content: "User prefers TypeScript over JavaScript",
          category: "preference",
          confidence: 0.9,
          entities: ["TypeScript", "JavaScript"],
        },
      ]);
      const llm = new MockAdapter([{ content: llmResponse, toolCalls: [], finishReason: "stop" }]);
      const extractor = new AutoExtractor(llm, store);
      const messages = makeMessages([
        ["I want to use TypeScript for this project", "Sure, TypeScript is a great choice."],
      ]);

      const facts = await extractor.extract(messages);
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toContain("TypeScript");
      expect(facts[0].category).toBe("preference");
      expect(facts[0].confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("skips extraction on greeting/short messages", async () => {
      const llm = new MockAdapter([{ content: "[]", toolCalls: [], finishReason: "stop" }]);
      const extractor = new AutoExtractor(llm, store, { minTurns: 2 });
      const messages = makeMessages([["hi", "Hello!"]]);

      const facts = await extractor.extract(messages);
      expect(facts).toHaveLength(0);
    });

    it("respects maxFactsPerTurn limit", async () => {
      const facts = Array.from({ length: 10 }, (_, i) => ({
        content: `Fact ${i}`,
        category: "fact" as const,
        confidence: 0.9,
        entities: [],
      }));
      const llm = new MockAdapter([
        { content: JSON.stringify(facts), toolCalls: [], finishReason: "stop" },
      ]);
      const extractor = new AutoExtractor(llm, store, { maxFactsPerTurn: 3 });
      const messages = makeMessages([["Tell me about X", "Here's what I know about X..."]]);

      const result = await extractor.extract(messages);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it("respects confidence threshold", async () => {
      const llmResponse = JSON.stringify([
        { content: "High confidence fact", category: "fact", confidence: 0.9, entities: [] },
        { content: "Low confidence fact", category: "fact", confidence: 0.3, entities: [] },
      ]);
      const llm = new MockAdapter([{ content: llmResponse, toolCalls: [], finishReason: "stop" }]);
      const extractor = new AutoExtractor(llm, store, { confidenceThreshold: 0.7 });
      const messages = makeMessages([["What about X?", "X is interesting."]]);

      const facts = await extractor.extract(messages);
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe("High confidence fact");
    });

    it("handles LLM failure gracefully (no crash)", async () => {
      const llm = new MockAdapter([
        { content: "not valid json at all", toolCalls: [], finishReason: "stop" },
      ]);
      const extractor = new AutoExtractor(llm, store);
      const messages = makeMessages([["What about X?", "X is interesting."]]);

      const facts = await extractor.extract(messages);
      expect(facts).toEqual([]);
    });

    it("deduplicates similar facts", async () => {
      const llm = new MockAdapter([
        {
          content: JSON.stringify([
            {
              content: "User prefers TypeScript",
              category: "preference",
              confidence: 0.9,
              entities: ["TypeScript"],
            },
          ]),
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      await store.write("auto-ts-pref", "auto", "Auto-extracted", "User prefers TypeScript");

      const extractor = new AutoExtractor(llm, store);
      const messages = makeMessages([["I prefer TypeScript", "Great choice."]]);

      const facts = await extractor.extract(messages);
      expect(facts).toHaveLength(0);
    });
  });

  describe("storeFacts", () => {
    it("stores extracted facts as memory entries", async () => {
      const llm = new MockAdapter([]);
      const extractor = new AutoExtractor(llm, store);
      const facts: ExtractedFact[] = [
        {
          content: "User prefers Go for backend",
          category: "preference",
          confidence: 0.9,
          entities: ["Go"],
        },
      ];

      await extractor.storeFacts(facts);
      const memories = await store.list({ type: "auto" });
      expect(memories.length).toBeGreaterThanOrEqual(1);
      expect(memories[0].content).toContain("Go");
    });
  });
});
