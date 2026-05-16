import Database from "better-sqlite3";
import { VirtualFS } from "@/agentfs/virtual-fs.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

describe("VirtualFS", () => {
  let db: Database.Database;
  let fs: VirtualFS;

  beforeEach(() => {
    db = new Database(":memory:");
    fs = new VirtualFS(db);
    fs.init();
  });

  afterEach(() => {
    db.close();
  });

  // ─── Read / Write ──────────────────────────────────────────────

  it("writes and reads a file as utf-8", () => {
    fs.writeFile("/hello.txt", "world");
    expect(fs.readFile("/hello.txt", "utf-8")).toBe("world");
  });

  it("reads a file as buffer", () => {
    fs.writeFile("/hello.bin", Buffer.from([0xde, 0xad, 0xbe, 0xef]));
    const buf = fs.readFile("/hello.bin", "buffer") as Buffer;
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("hex")).toBe("deadbeef");
  });

  it("overwrites an existing file", () => {
    fs.writeFile("/overwrite.txt", "old content");
    fs.writeFile("/overwrite.txt", "new content");
    expect(fs.readFile("/overwrite.txt", "utf-8")).toBe("new content");
  });

  it("throws ENOENT for nonexistent file", () => {
    expect(() => fs.readFile("/nonexistent.txt", "utf-8")).toThrow(/ENOENT/);
  });

  it("throws ENOENT when trying to read a directory as file", () => {
    expect(() => fs.readFile("/", "utf-8")).toThrow(/ENOENT/);
  });

  // ─── readdir ───────────────────────────────────────────────────

  it("lists directory contents", () => {
    fs.writeFile("/a.txt", "a");
    fs.writeFile("/b.txt", "b");
    fs.mkdir("/subdir");
    const entries = fs.readdir("/");
    expect(entries).toHaveLength(3);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual(["a.txt", "b.txt", "subdir"]);
  });

  it("readdir on nested directory returns its children", () => {
    fs.mkdir("/deeply/nested", { recursive: true });
    fs.writeFile("/deeply/nested/leaf.txt", "leaf");
    const entries = fs.readdir("/deeply/nested");
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("leaf.txt");
  });

  // ─── mkdir / rmdir ─────────────────────────────────────────────

  it("creates a directory with mkdir", () => {
    fs.mkdir("/mydir");
    expect(fs.stat("/mydir").type).toBe("directory");
  });

  it("mkdir throws when parent does not exist and recursive is false", () => {
    expect(() => fs.mkdir("/a/b/c")).toThrow(/ENOENT/);
  });

  it("mkdir recursive creates parent directories", () => {
    fs.mkdir("/a/b/c", { recursive: true });
    expect(fs.stat("/a/b/c").type).toBe("directory");
    expect(fs.stat("/a/b").type).toBe("directory");
    expect(fs.stat("/a").type).toBe("directory");
  });

  it("rmdir removes empty directory", () => {
    fs.mkdir("/emptydir");
    fs.rmdir("/emptydir");
    expect(fs.access("/emptydir")).toBe(false);
  });

  it("rmdir throws on non-empty directory", () => {
    fs.mkdir("/mydir");
    fs.writeFile("/mydir/file.txt", "content");
    expect(() => fs.rmdir("/mydir")).toThrow(/ENOTEMPTY|not empty/);
  });

  // ─── unlink ────────────────────────────────────────────────────

  it("removes a file with unlink", () => {
    fs.writeFile("/delete-me.txt", "bye");
    fs.unlink("/delete-me.txt");
    expect(() => fs.readFile("/delete-me.txt", "utf-8")).toThrow(/ENOENT/);
  });

  it("unlink throws ENOENT for nonexistent file", () => {
    expect(() => fs.unlink("/nonexistent")).toThrow(/ENOENT/);
  });

  // ─── rename ────────────────────────────────────────────────────

  it("renames a file within same directory", () => {
    fs.writeFile("/old.txt", "content");
    fs.rename("/old.txt", "/new.txt");
    expect(fs.readFile("/new.txt", "utf-8")).toBe("content");
    expect(() => fs.readFile("/old.txt", "utf-8")).toThrow(/ENOENT/);
  });

  it("rename moves to a different directory", () => {
    fs.mkdir("/subdir");
    fs.writeFile("/file.txt", "moved");
    fs.rename("/file.txt", "/subdir/file.txt");
    expect(fs.readFile("/subdir/file.txt", "utf-8")).toBe("moved");
    expect(() => fs.readFile("/file.txt", "utf-8")).toThrow(/ENOENT/);
  });

  // ─── stat ──────────────────────────────────────────────────────

  it("stat returns correct metadata for files", () => {
    fs.writeFile("/stat-me.txt", "hello");
    const s = fs.stat("/stat-me.txt");
    expect(s.type).toBe("file");
    expect(s.size).toBe(5);
    expect(s.mode).toBe(0o100644);
    expect(s.mtime).toBeGreaterThan(0);
    expect(s.ctime).toBeGreaterThan(0);
    expect(s.atime).toBeGreaterThan(0);
  });

  it("stat on directory returns correct metadata", () => {
    fs.mkdir("/mydir");
    const s = fs.stat("/mydir");
    expect(s.type).toBe("directory");
    expect(s.mode).toBe(0o040755);
  });

  it("stat on root directory works", () => {
    const s = fs.stat("/");
    expect(s.type).toBe("directory");
  });

  // ─── symlink ───────────────────────────────────────────────────

  it("symlink creates and readlink reads the target", () => {
    fs.writeFile("/target.txt", "real content");
    fs.symlink("/target.txt", "/mylink");
    expect(fs.readlink("/mylink")).toBe("/target.txt");
  });

  it("symlink is a separate inode type", () => {
    fs.writeFile("/target.txt", "real");
    fs.symlink("/target.txt", "/mylink");
    const s = fs.stat("/mylink");
    expect(s.type).toBe("symlink");
  });

  // ─── auto-create parent directories ────────────────────────────

  it("writes to nested paths auto-creates parent dirs", () => {
    fs.writeFile("/deeply/nested/file.txt", "nested content");
    expect(fs.readFile("/deeply/nested/file.txt", "utf-8")).toBe("nested content");
    expect(fs.stat("/deeply").type).toBe("directory");
    expect(fs.stat("/deeply/nested").type).toBe("directory");
  });

  it("mkdir recursive for deeply nested path", () => {
    fs.mkdir("/one/two/three/four", { recursive: true });
    expect(fs.stat("/one/two/three/four").type).toBe("directory");
  });

  // ─── statfs ────────────────────────────────────────────────────

  it("statfs returns filesystem stats", () => {
    fs.writeFile("/a.txt", Buffer.alloc(5000, "a")); // 5000 bytes => 2 chunks
    fs.writeFile("/b.txt", "bbb");                      // 3 bytes   => 1 chunk
    const stats = fs.statfs();
    // 3 inodes: root + a.txt + b.txt
    expect(stats.total_files).toBe(3);
    // at least 3 chunks: 2 + 1
    expect(stats.total_blocks).toBeGreaterThanOrEqual(3);
    expect(stats.used_blocks).toBeGreaterThanOrEqual(3);
  });

  // ─── access ────────────────────────────────────────────────────

  it("access returns true for existing paths", () => {
    fs.writeFile("/exists.txt", "yes");
    fs.mkdir("/existdir");
    expect(fs.access("/exists.txt")).toBe(true);
    expect(fs.access("/existdir")).toBe(true);
    expect(fs.access("/")).toBe(true);
  });

  it("access returns false for nonexistent paths", () => {
    expect(fs.access("/nothing")).toBe(false);
    expect(fs.access("/nope/nope")).toBe(false);
  });

  // ─── copyFile ──────────────────────────────────────────────────

  it("copyFile duplicates content", () => {
    fs.writeFile("/src.txt", "copy me");
    fs.copyFile("/src.txt", "/dst.txt");
    expect(fs.readFile("/dst.txt", "utf-8")).toBe("copy me");
  });

  it("copyFile can copy into a subdirectory", () => {
    fs.mkdir("/sub");
    fs.writeFile("/src.txt", "data");
    fs.copyFile("/src.txt", "/sub/copy.txt");
    expect(fs.readFile("/sub/copy.txt", "utf-8")).toBe("data");
  });

  // ─── custom chunk size ─────────────────────────────────────────

  it("writeFile respects custom chunk size", () => {
    const content = "x".repeat(200);
    fs.writeFile("/chunked.txt", content, { chunkSize: 64 });
    const readBack = fs.readFile("/chunked.txt", "utf-8");
    expect(readBack).toBe(content);
    expect(readBack.length).toBe(200);
  });
});
