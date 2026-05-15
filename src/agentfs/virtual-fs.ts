import type Database from "better-sqlite3";

// ─── Type constants ─────────────────────────────────────────────

export const S_IFMT = 0o170000;
export const S_IFREG = 0o100000;
export const S_IFDIR = 0o040000;
export const S_IFLNK = 0o120000;
export const DEFAULT_FILE_MODE = 0o100644;
export const DEFAULT_DIR_MODE = 0o040755;
export const DEFAULT_CHUNK_SIZE = 4096;

// ─── Exported types ─────────────────────────────────────────────

export interface FSDentry {
  id: number;
  name: string;
  inode_id: number;
}

export interface FSStat {
  type: string;
  mode: number;
  size: number;
  mtime: number;
  ctime: number;
  atime: number;
}

export interface FSStatFs {
  total_files: number;
  total_blocks: number;
  used_blocks: number;
}

// ─── VirtualFS Class ────────────────────────────────────────────

export class VirtualFS {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ─── Initialization ──────────────────────────────────────────

  init(): void {
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fs_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS fs_inode (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        mode INTEGER NOT NULL,
        size INTEGER DEFAULT 0,
        mtime INTEGER NOT NULL,
        ctime INTEGER NOT NULL,
        atime INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fs_dentry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL REFERENCES fs_inode(id),
        name TEXT NOT NULL,
        inode_id INTEGER NOT NULL REFERENCES fs_inode(id),
        UNIQUE(parent_id, name)
      );

      CREATE TABLE IF NOT EXISTS fs_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inode_id INTEGER NOT NULL REFERENCES fs_inode(id),
        chunk_index INTEGER NOT NULL,
        data BLOB NOT NULL,
        UNIQUE(inode_id, chunk_index)
      );

      CREATE TABLE IF NOT EXISTS fs_symlink (
        inode_id INTEGER PRIMARY KEY REFERENCES fs_inode(id),
        target TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fs_whiteout (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fs_origin (
        inode_id INTEGER PRIMARY KEY REFERENCES fs_inode(id),
        origin TEXT NOT NULL
      );
    `);

    // Seed root inode
    const now = Date.now();
    this.db
      .prepare(
        "INSERT OR IGNORE INTO fs_inode (id, type, mode, size, mtime, ctime, atime) VALUES (1, 'directory', ?, 0, ?, ?, ?)",
      )
      .run(DEFAULT_DIR_MODE, now, now, now);

    // Seed root path in config
    this.db
      .prepare("INSERT OR IGNORE INTO fs_config (key, value) VALUES ('root', '/')")
      .run();
  }

  // ─── Path helpers ────────────────────────────────────────────

  private normalizePath(filePath: string): string {
    let normalized = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  private getParentDirPath(filePath: string): string {
    const idx = filePath.lastIndexOf("/");
    if (idx <= 0) return "/";
    return filePath.substring(0, idx);
  }

  /**
   * Traverse the path resolving all parent directories.
   * Returns the parent inode id and the final path component name.
   * Throws ENOENT if any intermediate directory is missing.
   */
  private resolvePath(filePath: string): { parentInode: number; name: string } {
    if (filePath === "/" || filePath === "") {
      return { parentInode: 0, name: "/" };
    }

    const normalized = this.normalizePath(filePath);
    const cleanPath = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    const parts = cleanPath.split("/");
    const name = parts[parts.length - 1];
    const parentParts = parts.slice(0, -1);

    let currentId = 1; // root

    for (const part of parentParts) {
      if (part === "") continue;
      const row = this.db
        .prepare(
          "SELECT d.inode_id FROM fs_dentry d JOIN fs_inode i ON d.inode_id = i.id WHERE d.parent_id = ? AND d.name = ? AND i.type = 'directory'",
        )
        .get(currentId, part) as { inode_id: number } | undefined;

      if (!row) {
        throw Object.assign(
          new Error(`ENOENT: no such file or directory, resolve '${filePath}'`),
          { code: "ENOENT" },
        );
      }
      currentId = row.inode_id;
    }

    return { parentInode: currentId, name };
  }

  /**
   * Resolve a full path to its inode id.
   * Throws ENOENT if any component does not exist.
   */
  private lookupInode(filePath: string): number {
    if (filePath === "/" || filePath === "") return 1;

    const normalized = this.normalizePath(filePath);
    const cleanPath = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    const parts = cleanPath.split("/");

    let currentId = 1;
    for (const part of parts) {
      if (part === "") continue;
      const row = this.db
        .prepare("SELECT inode_id FROM fs_dentry WHERE parent_id = ? AND name = ?")
        .get(currentId, part) as { inode_id: number } | undefined;

      if (!row) {
        throw Object.assign(
          new Error(`ENOENT: no such file or directory '${filePath}'`),
          { code: "ENOENT" },
        );
      }
      currentId = row.inode_id;
    }

    return currentId;
  }

  /**
   * Create all ancestor directories along dirPath if they don't exist.
   */
  private ensureParentDirs(dirPath: string): void {
    const normalized = this.normalizePath(dirPath);
    if (normalized === "" || normalized === "/") return;

    const cleanPath = normalized.startsWith("/") ? normalized.slice(1) : normalized;
    const parts = cleanPath.split("/");
    if (parts.length === 0 || (parts.length === 1 && parts[0] === "")) return;

    let currentId = 1;
    const now = Date.now();

    for (const part of parts) {
      if (part === "") continue;

      const existing = this.db
        .prepare(
          "SELECT d.inode_id FROM fs_dentry d JOIN fs_inode i ON d.inode_id = i.id WHERE d.parent_id = ? AND d.name = ? AND i.type = 'directory'",
        )
        .get(currentId, part) as { inode_id: number } | undefined;

      if (existing) {
        currentId = existing.inode_id;
      } else {
        const inodeId = this.createInode("directory", DEFAULT_DIR_MODE, 0, now);
        this.createDentry(currentId, part, inodeId);
        currentId = inodeId;
      }
    }
  }

  // ─── Inode / Dentry helpers ───────────────────────────────────

  private createInode(type: string, mode: number, size: number, now: number): number {
    const row = this.db
      .prepare(
        "INSERT INTO fs_inode (type, mode, size, mtime, ctime, atime) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      )
      .get(type, mode, size, now, now, now) as { id: number };
    return row.id;
  }

  private createDentry(parentId: number, name: string, inodeId: number): void {
    this.db
      .prepare("INSERT INTO fs_dentry (parent_id, name, inode_id) VALUES (?, ?, ?)")
      .run(parentId, name, inodeId);
  }

  private writeChunks(inodeId: number, buf: Buffer, chunkSize: number): void {
    const stmt = this.db.prepare(
      "INSERT INTO fs_data (inode_id, chunk_index, data) VALUES (?, ?, ?)",
    );
    for (let i = 0; i < buf.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, buf.length);
      stmt.run(inodeId, Math.floor(i / chunkSize), buf.slice(i, end));
    }
  }

  private readChunks(inodeId: number): Buffer {
    const chunks = this.db
      .prepare("SELECT data FROM fs_data WHERE inode_id = ? ORDER BY chunk_index")
      .all(inodeId) as { data: Buffer }[];
    return Buffer.concat(chunks.map((c) => c.data));
  }

  // ─── Public API ───────────────────────────────────────────────

  writeFile(
    filePath: string,
    content: string | Buffer,
    options?: { mode?: number; chunkSize?: number },
  ): void {
    const normalized = this.normalizePath(filePath);
    if (normalized === "/") {
      throw Object.assign(
        new Error(`EISDIR: illegal operation on a directory '${filePath}'`),
        { code: "EISDIR" },
      );
    }

    const parentDir = this.getParentDirPath(normalized);
    this.ensureParentDirs(parentDir);

    const { parentInode, name } = this.resolvePath(normalized);
    const now = Date.now();
    const mode = options?.mode ?? DEFAULT_FILE_MODE;
    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);

    // Check if file or directory already exists at this path
    const existing = this.db
      .prepare(
        "SELECT d.inode_id, i.type, i.mode FROM fs_dentry d JOIN fs_inode i ON d.inode_id = i.id WHERE d.parent_id = ? AND d.name = ?",
      )
      .get(parentInode, name) as { inode_id: number; type: string; mode: number } | undefined;

    if (existing) {
      if (existing.type === "directory") {
        throw Object.assign(
          new Error(`EISDIR: illegal operation on a directory '${filePath}'`),
          { code: "EISDIR" },
        );
      }
      // Overwrite: clear old data, update inode, write new chunks
      const doOverwrite = this.db.transaction(() => {
        this.db.prepare("DELETE FROM fs_data WHERE inode_id = ?").run(existing.inode_id);
        this.db.prepare("DELETE FROM fs_symlink WHERE inode_id = ?").run(existing.inode_id);
        const effectiveMode = options?.mode ?? existing.mode;
        this.db
          .prepare("UPDATE fs_inode SET size = ?, mode = ?, mtime = ?, atime = ? WHERE id = ?")
          .run(buf.length, effectiveMode, now, now, existing.inode_id);
        this.writeChunks(existing.inode_id, buf, chunkSize);
      });
      doOverwrite();
    } else {
      // Create new inode + dentry
      const inodeId = this.createInode("file", mode, buf.length, now);
      this.createDentry(parentInode, name, inodeId);
      this.writeChunks(inodeId, buf, chunkSize);
    }
  }

  readFile(filePath: string, encoding?: "utf-8" | "buffer"): string | Buffer {
    const inodeId = this.lookupInode(filePath);
    const inode = this.db
      .prepare("SELECT type FROM fs_inode WHERE id = ?")
      .get(inodeId) as { type: string };

    if (inode.type !== "file") {
      throw Object.assign(
        new Error(`ENOENT: no such file or directory '${filePath}'`),
        { code: "ENOENT" },
      );
    }

    const content = this.readChunks(inodeId);

    // Update atime
    this.db
      .prepare("UPDATE fs_inode SET atime = ? WHERE id = ?")
      .run(Date.now(), inodeId);

    if (encoding === "utf-8") {
      return content.toString("utf-8");
    }
    return content;
  }

  readdir(dirPath: string): FSDentry[] {
    const inodeId = this.lookupInode(dirPath);
    const inode = this.db
      .prepare("SELECT type FROM fs_inode WHERE id = ?")
      .get(inodeId) as { type: string };

    if (inode.type !== "directory") {
      throw Object.assign(
        new Error(`ENOTDIR: not a directory '${dirPath}'`),
        { code: "ENOTDIR" },
      );
    }

    return this.db
      .prepare(
        "SELECT id, name, inode_id FROM fs_dentry WHERE parent_id = ? ORDER BY name",
      )
      .all(inodeId) as FSDentry[];
  }

  mkdir(
    dirPath: string,
    options?: { mode?: number; recursive?: boolean },
  ): void {
    const normalized = this.normalizePath(dirPath);
    if (normalized === "/") return; // root already exists

    const mode = options?.mode ?? DEFAULT_DIR_MODE;

    if (options?.recursive) {
      this.ensureParentDirs(normalized);
      return;
    }

    // Non-recursive: parent must exist
    const { parentInode, name } = this.resolvePath(normalized);

    // Check destination does not already exist
    const existing = this.db
      .prepare("SELECT id FROM fs_dentry WHERE parent_id = ? AND name = ?")
      .get(parentInode, name);

    if (existing) {
      throw Object.assign(
        new Error(`EEXIST: file already exists '${dirPath}'`),
        { code: "EEXIST" },
      );
    }

    const now = Date.now();
    const inodeId = this.createInode("directory", mode, 0, now);
    this.createDentry(parentInode, name, inodeId);
  }

  rmdir(dirPath: string): void {
    if (dirPath === "/" || dirPath === "") {
      throw Object.assign(
        new Error(`EBUSY: cannot remove root directory`),
        { code: "EBUSY" },
      );
    }

    const inodeId = this.lookupInode(dirPath);
    const inode = this.db
      .prepare("SELECT type FROM fs_inode WHERE id = ?")
      .get(inodeId) as { type: string };

    if (inode.type !== "directory") {
      throw Object.assign(
        new Error(`ENOTDIR: not a directory '${dirPath}'`),
        { code: "ENOTDIR" },
      );
    }

    // Check directory is empty
    const count = this.db
      .prepare("SELECT COUNT(*) as cnt FROM fs_dentry WHERE parent_id = ?")
      .get(inodeId) as { cnt: number };

    if (count.cnt > 0) {
      throw Object.assign(
        new Error(`ENOTEMPTY: directory not empty '${dirPath}'`),
        { code: "ENOTEMPTY" },
      );
    }

    // Delete dentry linking to this directory
    const { parentInode, name } = this.resolvePath(dirPath);
    this.db
      .prepare("DELETE FROM fs_dentry WHERE parent_id = ? AND name = ?")
      .run(parentInode, name);

    // Delete the inode
    this.db.prepare("DELETE FROM fs_inode WHERE id = ?").run(inodeId);
  }

  unlink(filePath: string): void {
    if (filePath === "/" || filePath === "") {
      throw Object.assign(
        new Error(`EPERM: operation not permitted '${filePath}'`),
        { code: "EPERM" },
      );
    }

    const inodeId = this.lookupInode(filePath);
    const inode = this.db
      .prepare("SELECT type FROM fs_inode WHERE id = ?")
      .get(inodeId) as { type: string };

    if (inode.type === "directory") {
      throw Object.assign(
        new Error(`EISDIR: is a directory '${filePath}'`),
        { code: "EISDIR" },
      );
    }

    // Remove data, symlink entry, dentry, inode
    const doUnlink = this.db.transaction(() => {
      this.db.prepare("DELETE FROM fs_data WHERE inode_id = ?").run(inodeId);
      this.db.prepare("DELETE FROM fs_symlink WHERE inode_id = ?").run(inodeId);

      const { parentInode, name } = this.resolvePath(filePath);
      this.db
        .prepare("DELETE FROM fs_dentry WHERE parent_id = ? AND name = ?")
        .run(parentInode, name);

      this.db.prepare("DELETE FROM fs_inode WHERE id = ?").run(inodeId);
    });
    doUnlink();
  }

  rename(oldPath: string, newPath: string): void {
    if (oldPath === "/" || oldPath === "") {
      throw Object.assign(
        new Error(`EBUSY: cannot rename root directory`),
        { code: "EBUSY" },
      );
    }

    const oldNorm = this.normalizePath(oldPath);
    const newNorm = this.normalizePath(newPath);

    // Resolve source
    const { parentInode: oldParentId, name: oldName } = this.resolvePath(oldNorm);
    const oldDentry = this.db
      .prepare("SELECT id, inode_id FROM fs_dentry WHERE parent_id = ? AND name = ?")
      .get(oldParentId, oldName) as { id: number; inode_id: number } | undefined;

    if (!oldDentry) {
      throw Object.assign(
        new Error(`ENOENT: no such file or directory '${oldPath}'`),
        { code: "ENOENT" },
      );
    }

    // Ensure parent of destination exists
    const newParentDir = this.getParentDirPath(newNorm);
    this.ensureParentDirs(newParentDir);

    // Resolve destination parent
    const { parentInode: newParentId, name: newName } = this.resolvePath(newNorm);

    // No-op if source and destination are identical
    if (oldParentId === newParentId && oldName === newName) return;

    // Check destination does not already exist
    const existing = this.db
      .prepare("SELECT id FROM fs_dentry WHERE parent_id = ? AND name = ?")
      .get(newParentId, newName);

    if (existing) {
      throw Object.assign(
        new Error(`EEXIST: file already exists '${newPath}'`),
        { code: "EEXIST" },
      );
    }

    // Remove old dentry
    this.db
      .prepare("DELETE FROM fs_dentry WHERE id = ?")
      .run(oldDentry.id);

    // Create new dentry pointing to the same inode
    this.db
      .prepare("INSERT INTO fs_dentry (parent_id, name, inode_id) VALUES (?, ?, ?)")
      .run(newParentId, newName, oldDentry.inode_id);
  }

  copyFile(src: string, dest: string): void {
    const content = this.readFile(src, "buffer") as Buffer;
    this.writeFile(dest, content);
  }

  symlink(target: string, linkPath: string): void {
    const normalized = this.normalizePath(linkPath);
    if (normalized === "/") {
      throw Object.assign(
        new Error(`EPERM: operation not permitted '${linkPath}'`),
        { code: "EPERM" },
      );
    }

    const parentDir = this.getParentDirPath(normalized);
    this.ensureParentDirs(parentDir);

    const { parentInode, name } = this.resolvePath(normalized);

    // Check destination does not already exist
    const existing = this.db
      .prepare("SELECT id FROM fs_dentry WHERE parent_id = ? AND name = ?")
      .get(parentInode, name);
    if (existing) {
      throw Object.assign(
        new Error(`EEXIST: file already exists '${linkPath}'`),
        { code: "EEXIST" },
      );
    }

    const now = Date.now();

    // Create symlink inode
    const inodeId = this.createInode("symlink", 0o120777, Buffer.byteLength(target, "utf-8"), now);
    this.createDentry(parentInode, name, inodeId);

    // Create symlink target entry
    this.db
      .prepare("INSERT INTO fs_symlink (inode_id, target) VALUES (?, ?)")
      .run(inodeId, target);
  }

  readlink(linkPath: string): string {
    const inodeId = this.lookupInode(linkPath);
    const inode = this.db
      .prepare("SELECT type FROM fs_inode WHERE id = ?")
      .get(inodeId) as { type: string };

    if (inode.type !== "symlink") {
      throw Object.assign(
        new Error(`EINVAL: not a symbolic link '${linkPath}'`),
        { code: "EINVAL" },
      );
    }

    const row = this.db
      .prepare("SELECT target FROM fs_symlink WHERE inode_id = ?")
      .get(inodeId) as { target: string };

    return row.target;
  }

  stat(filePath: string): FSStat {
    const inodeId = this.lookupInode(filePath);
    const row = this.db
      .prepare("SELECT type, mode, size, mtime, ctime, atime FROM fs_inode WHERE id = ?")
      .get(inodeId) as FSStat;

    return row;
  }

  access(filePath: string): boolean {
    try {
      this.lookupInode(filePath);
      return true;
    } catch {
      return false;
    }
  }

  statfs(): FSStatFs {
    const totalFiles = (
      this.db.prepare("SELECT COUNT(*) as count FROM fs_inode").get() as { count: number }
    ).count;

    const totalBlocks = (
      this.db.prepare("SELECT COUNT(*) as count FROM fs_data").get() as { count: number }
    ).count;

    return {
      total_files: totalFiles,
      total_blocks: totalBlocks,
      used_blocks: totalBlocks,
    };
  }
}
