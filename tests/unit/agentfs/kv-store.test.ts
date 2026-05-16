import Database from "better-sqlite3";
import { KvStore } from "@/agentfs/kv-store.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("KvStore", () => {
  let db: Database.Database;
  let kv: KvStore;

  beforeEach(() => {
    db = new Database(":memory:");
    kv = new KvStore(db);
    kv.init();
  });

  afterEach(() => {
    db.close();
  });

  it("sets and gets a string value", () => {
    kv.set("greeting", "hello");
    expect(kv.get("greeting")).toBe("hello");
  });

  it("sets and gets a JSON object value", () => {
    const obj = { a: 1, b: [2, 3] };
    kv.set("obj", obj);
    expect(kv.get("obj")).toEqual(obj);
  });

  it("sets and gets a number value", () => {
    kv.set("count", 42);
    expect(kv.get("count")).toBe(42);
  });

  it("sets and gets null value", () => {
    kv.set("nothing", null);
    expect(kv.get("nothing")).toBeNull();
  });

  it("returns undefined for nonexistent key", () => {
    expect(kv.get("nonexistent")).toBeUndefined();
  });

  it("overwrite updates value", () => {
    kv.set("key", "old");
    kv.set("key", "new");
    expect(kv.get("key")).toBe("new");
  });

  it("lists keys with prefix filtering", () => {
    kv.set("user:1", "alice");
    kv.set("user:2", "bob");
    kv.set("config:theme", "dark");
    const userKeys = kv.list("user:");
    expect(userKeys).toEqual(["user:1", "user:2"]);
  });

  it("lists all keys with no prefix", () => {
    kv.set("a", "1");
    kv.set("b", "2");
    expect(kv.list()).toEqual(["a", "b"]);
  });

  it("returns empty array when no keys match prefix", () => {
    kv.set("x", "1");
    expect(kv.list("y")).toEqual([]);
  });

  it("delete removes a key", () => {
    kv.set("temp", "value");
    kv.delete("temp");
    expect(kv.get("temp")).toBeUndefined();
  });

  it("delete of nonexistent key is no-op", () => {
    kv.delete("nothing");
    // No throw expected
    expect(true).toBe(true);
  });

  it("has returns true for existing keys", () => {
    kv.set("exists", "yes");
    expect(kv.has("exists")).toBe(true);
  });

  it("has returns false for missing keys", () => {
    expect(kv.has("missing")).toBe(false);
  });

  it("clear removes all keys", () => {
    kv.set("a", "1");
    kv.set("b", "2");
    kv.clear();
    expect(kv.get("a")).toBeUndefined();
    expect(kv.get("b")).toBeUndefined();
  });
});
