import Database from "better-sqlite3";
import { AuditTrail } from "@/agentfs/audit-trail.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("AuditTrail", () => {
  let db: Database.Database;
  let trail: AuditTrail;

  beforeEach(() => {
    db = new Database(":memory:");
    trail = new AuditTrail(db);
    trail.init();
  });

  afterEach(() => {
    db.close();
  });

  it("records a tool call with start/success flow", () => {
    const id = trail.start("read_file", { path: "/tmp/a" });
    trail.success(id, "file content");
    const record = trail.get(id);
    expect(record).toBeDefined();
    expect(record!.name).toBe("read_file");
    expect(record!.status).toBe("success");
    expect(record!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("records a tool call with start/error flow", () => {
    const id = trail.start("bash", { command: "rm -rf /" });
    trail.error(id, "permission denied");
    const record = trail.get(id);
    expect(record!.status).toBe("error");
    expect(record!.error).toBe("permission denied");
  });

  it("records a completed tool call in one shot", () => {
    const now = Math.floor(Date.now() / 1000);
    const id = trail.record("web_search", now, now + 2, { q: "hello" }, "results", undefined);
    const record = trail.get(id);
    expect(record!.name).toBe("web_search");
    expect(record!.duration_ms).toBe(2000);
  });

  it("returns undefined for unknown id", () => {
    expect(trail.get(999)).toBeUndefined();
  });

  it("queries by name", () => {
    trail.record("read", 1000, 1001, {}, "a");
    trail.record("write", 1000, 1001, {}, "b");
    trail.record("read", 1000, 1001, {}, "c");
    const reads = trail.getByName("read");
    expect(reads).toHaveLength(2);
  });

  it("returns performance stats", () => {
    trail.record("read", 1000, 1002, {}, "ok");
    trail.record("read", 1000, 1004, {}, undefined, "fail");
    const stats = trail.getStats();
    const readStats = stats.find((s) => s.name === "read");
    expect(readStats).toBeDefined();
    expect(readStats!.total_calls).toBe(2);
    expect(readStats!.successful).toBe(1);
    expect(readStats!.failed).toBe(1);
  });
});
