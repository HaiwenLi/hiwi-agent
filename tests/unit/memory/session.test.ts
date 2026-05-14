import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "@/memory/session.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("SessionStore", () => {
  let store: SessionStore;
  const tmpDir = path.join(os.tmpdir(), "hiwi-session-test");

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    store = new SessionStore(path.join(tmpDir, "session.db"));
    store.init();
  });

  afterEach(async () => {
    store.close();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("sessions", () => {
    it("creates a new session", () => {
      const session = store.createSession("/project/my-app");
      expect(session.id).toBeTruthy();
      expect(session.workingDir).toBe("/project/my-app");
      expect(session.status).toBe("active");
    });

    it("lists sessions", () => {
      store.createSession("/project/a");
      store.createSession("/project/b");
      const sessions = store.listSessions();
      expect(sessions).toHaveLength(2);
    });

    it("finds active session for working directory", () => {
      store.createSession("/project/find-me");
      const found = store.findActiveSession("/project/find-me");
      expect(found).not.toBeNull();
      expect(found?.workingDir).toBe("/project/find-me");
    });

    it("returns null when no active session for directory", () => {
      const found = store.findActiveSession("/nonexistent");
      expect(found).toBeNull();
    });

    it("marks session as completed", () => {
      const session = store.createSession("/project/end-me");
      store.completeSession(session.id);
      const found = store.findActiveSession("/project/end-me");
      expect(found).toBeNull();
    });
  });

  describe("messages", () => {
    let sessionId: string;

    beforeEach(() => {
      const session = store.createSession("/project/messages");
      sessionId = session.id;
    });

    it("appends messages and retrieves them", () => {
      store.appendMessage(sessionId, "user", "Hello", 5);
      store.appendMessage(sessionId, "assistant", "Hi there!", 10);

      const messages = store.getMessages(sessionId);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello");
      expect(messages[1].content).toBe("Hi there!");
    });

    it("tracks token counts per message", () => {
      store.appendMessage(sessionId, "user", "Hello", 5);
      store.appendMessage(sessionId, "assistant", "Response", 15);

      const messages = store.getMessages(sessionId);
      expect(messages[0].tokens).toBe(5);
      expect(messages[1].tokens).toBe(15);
    });

    it("computes total token count for session", () => {
      store.appendMessage(sessionId, "user", "A", 5);
      store.appendMessage(sessionId, "assistant", "B", 10);

      const total = store.getTotalTokens(sessionId);
      expect(total).toBe(15);
    });

    it("returns messages in chronological order", () => {
      store.appendMessage(sessionId, "user", "first", 1);
      store.appendMessage(sessionId, "assistant", "second", 2);
      store.appendMessage(sessionId, "user", "third", 3);

      const messages = store.getMessages(sessionId);
      expect(messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    });

    it("returns empty array for nonexistent session", () => {
      const messages = store.getMessages("nonexistent-id");
      expect(messages).toEqual([]);
    });
  });

  describe("summaries", () => {
    let sessionId: string;

    beforeEach(() => {
      const session = store.createSession("/project/summaries");
      sessionId = session.id;
    });

    it("saves and retrieves a summary", () => {
      store.saveSummary(sessionId, "Goal: Build agent. Progress: Sprint 1 done.");
      const summary = store.getLatestSummary(sessionId);
      expect(summary).not.toBeNull();
      expect(summary?.content).toContain("Build agent");
    });

    it("replaces previous summary (incremental)", () => {
      store.saveSummary(sessionId, "Summary v1");
      store.saveSummary(sessionId, "Summary v2");

      const summary = store.getLatestSummary(sessionId);
      expect(summary?.content).toBe("Summary v2");
    });

    it("returns null when no summary exists", () => {
      const summary = store.getLatestSummary(sessionId);
      expect(summary).toBeNull();
    });
  });
});
