import { MockAdapter } from "@/adapters/mock.js";
import {
  ContextCompactor,
  estimateTokens,
  pruneToolOutputs,
  shouldCompact,
} from "@/memory/compaction.js";
import type { Message } from "@/types.js";
import { describe, expect, it } from "vitest";

describe("Context Compaction", () => {
  describe("estimateTokens", () => {
    it("estimates tokens as ~4 chars per token", () => {
      expect(estimateTokens("Hello world")).toBe(Math.ceil(11 / 4));
    });

    it("handles empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("shouldCompact", () => {
    it("returns true when approaching limit", () => {
      const messages: Message[] = [
        { role: "user", content: "a".repeat(4000) },
        { role: "assistant", content: "b".repeat(4000) },
      ];
      expect(shouldCompact(messages, 1500, 1000, 200)).toBe(true);
    });

    it("returns false when well within limit", () => {
      const messages: Message[] = [{ role: "user", content: "Hello" }];
      expect(shouldCompact(messages, 200_000, 4096, 20_000)).toBe(false);
    });
  });

  describe("pruneToolOutputs", () => {
    it("truncates tool outputs longer than 2K chars", () => {
      const messages: Message[] = [
        { role: "tool", content: "x".repeat(3000), toolCallId: "c1" },
        { role: "assistant", content: "Summary" },
      ];
      const pruned = pruneToolOutputs(messages, 2000, 0);
      expect(pruned[0].content.length).toBeLessThanOrEqual(2100);
      expect(pruned[0].content).toContain("truncated");
    });

    it("preserves short tool outputs", () => {
      const messages: Message[] = [{ role: "tool", content: "short output", toolCallId: "c1" }];
      const pruned = pruneToolOutputs(messages, 2000);
      expect(pruned[0].content).toBe("short output");
    });

    it("preserves non-tool messages", () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "World" },
      ];
      const pruned = pruneToolOutputs(messages, 2000);
      expect(pruned).toEqual(messages);
    });

    it("keeps last N tool outputs untruncated", () => {
      const messages: Message[] = [
        { role: "tool", content: "x".repeat(3000), toolCallId: "c1" },
        { role: "tool", content: "y".repeat(3000), toolCallId: "c2" },
      ];
      const pruned = pruneToolOutputs(messages, 2000, 1);
      expect(pruned[0].content).toContain("truncated");
      expect(pruned[1].content).toBe("y".repeat(3000));
    });
  });

  describe("ContextCompactor", () => {
    it("returns messages unchanged when no compaction needed", async () => {
      const adapter = new MockAdapter([
        { content: "Summary", toolCalls: [], finishReason: "stop" },
      ]);
      const compactor = new ContextCompactor(adapter);

      const messages: Message[] = [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
      ];

      const result = await compactor.compact(messages, {
        contextLimit: 200_000,
        maxOutputTokens: 4096,
        reserved: 20_000,
      });

      expect(result.messages).toEqual(messages);
      expect(result.compacted).toBe(false);
    });

    it("compacts when approaching limit", async () => {
      const adapter = new MockAdapter([
        {
          content:
            "Goal: Build agent\nProgress: Sprint 1 done\nDecisions: TypeScript\nNext: Sprint 2",
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const compactor = new ContextCompactor(adapter);

      const messages: Message[] = [
        { role: "user", content: "a".repeat(2000) },
        { role: "assistant", content: "b".repeat(2000) },
        { role: "tool", content: "x".repeat(3000), toolCallId: "c1" },
        { role: "assistant", content: "c".repeat(2000) },
        { role: "user", content: "latest message" },
        { role: "assistant", content: "latest response" },
      ];

      const result = await compactor.compact(messages, {
        contextLimit: 1500,
        maxOutputTokens: 1000,
        reserved: 200,
      });

      expect(result.compacted).toBe(true);
      expect(result.messages.length).toBeLessThan(messages.length);
    });

    it("merges with existing summary (incremental)", async () => {
      const adapter = new MockAdapter([
        {
          content: "Updated: Added compaction module\nProgress: Sprint 2 in progress",
          toolCalls: [],
          finishReason: "stop",
        },
      ]);
      const compactor = new ContextCompactor(adapter);

      const existingSummary = "Previous summary: Sprint 1 complete";
      const messages: Message[] = [
        { role: "system", content: existingSummary },
        { role: "user", content: "a".repeat(2000) },
        { role: "assistant", content: "b".repeat(2000) },
        { role: "user", content: "latest" },
        { role: "assistant", content: "response" },
      ];

      const result = await compactor.compact(messages, {
        contextLimit: 1000,
        maxOutputTokens: 500,
        reserved: 100,
        existingSummary,
      });

      expect(result.compacted).toBe(true);
    });
  });
});
