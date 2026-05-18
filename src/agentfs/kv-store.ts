import type Database from "better-sqlite3";

// ─── KvStore Class ────────────────────────────────────────────

export class KvStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  set(key: string, value: unknown): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO kv_store (key, value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, JSON.stringify(value), now, now);
  }

  get(key: string): unknown | undefined {
    const row = this.db.prepare("SELECT value FROM kv_store WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    if (!row) return undefined;
    return JSON.parse(row.value);
  }

  list(prefix?: string): string[] {
    if (prefix) {
      const rows = this.db
        .prepare("SELECT key FROM kv_store WHERE key LIKE ? ORDER BY key")
        .all(`${prefix}%`) as { key: string }[];
      return rows.map((r) => r.key);
    }
    const rows = this.db.prepare("SELECT key FROM kv_store ORDER BY key").all() as {
      key: string;
    }[];
    return rows.map((r) => r.key);
  }

  delete(key: string): void {
    this.db.prepare("DELETE FROM kv_store WHERE key = ?").run(key);
  }

  has(key: string): boolean {
    const row = this.db.prepare("SELECT COUNT(*) as cnt FROM kv_store WHERE key = ?").get(key) as {
      cnt: number;
    };
    return row.cnt > 0;
  }

  clear(): void {
    this.db.exec("DELETE FROM kv_store");
  }
}
