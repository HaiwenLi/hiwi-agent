import type Database from "better-sqlite3";

// ─── Types ──────────────────────────────────────────────────────

export interface ToolCallRecord {
  id: number;
  name: string;
  status: "pending" | "success" | "error";
  parameters: string | null;
  result: string | null;
  error: string | null;
  started_at: number;
  completed_at: number | null;
  duration_ms: number | null;
}

export interface ToolCallStats {
  name: string;
  total_calls: number;
  pending: number;
  successful: number;
  failed: number;
  avg_duration_ms: number | null;
}

// ─── AuditTrail Class ───────────────────────────────────────────

export class AuditTrail {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        parameters TEXT,
        result TEXT,
        error TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        duration_ms INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(name);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
    `);
  }

  start(name: string, parameters?: Record<string, unknown>): number {
    const stmt = this.db.prepare(`
      INSERT INTO tool_calls (name, status, parameters, started_at)
      VALUES (?, 'pending', ?, ?)
      RETURNING id
    `);
    const now = Math.floor(Date.now() / 1000);
    const row = stmt.get(name, parameters ? JSON.stringify(parameters) : null, now) as { id: number };
    return row.id;
  }

  success(id: number, result?: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db.prepare(`
      UPDATE tool_calls
      SET status = 'success',
          result = ?,
          completed_at = ?,
          duration_ms = (? - started_at) * 1000
      WHERE id = ?
    `).run(result ?? null, now, now, id);
    return info.changes > 0;
  }

  error(id: number, error: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const info = this.db.prepare(`
      UPDATE tool_calls
      SET status = 'error',
          error = ?,
          completed_at = ?,
          duration_ms = (? - started_at) * 1000
      WHERE id = ?
    `).run(error, now, now, id);
    return info.changes > 0;
  }

  record(
    name: string,
    started_at: number,
    completed_at: number,
    parameters?: Record<string, unknown>,
    result?: string,
    error?: string,
  ): number {
    const status = error ? "error" : "success";
    const durationMs = (completed_at - started_at) * 1000;
    const stmt = this.db.prepare(`
      INSERT INTO tool_calls (name, status, parameters, result, error, started_at, completed_at, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `);
    const row = stmt.get(
      name,
      status,
      parameters ? JSON.stringify(parameters) : null,
      result ?? null,
      error ?? null,
      started_at,
      completed_at,
      durationMs,
    ) as { id: number };
    return row.id;
  }

  get(id: number): ToolCallRecord | undefined {
    const row = this.db.prepare("SELECT * FROM tool_calls WHERE id = ?").get(id) as ToolCallRecord | undefined;
    return row ?? undefined;
  }

  getByName(name: string, limit = 50): ToolCallRecord[] {
    return this.db
      .prepare("SELECT * FROM tool_calls WHERE name = ? ORDER BY started_at DESC LIMIT ?")
      .all(name, limit) as ToolCallRecord[];
  }

  getRecent(since: number, limit = 50): ToolCallRecord[] {
    return this.db
      .prepare("SELECT * FROM tool_calls WHERE started_at >= ? ORDER BY started_at DESC LIMIT ?")
      .all(since, limit) as ToolCallRecord[];
  }

  getStats(): ToolCallStats[] {
    return this.db
      .prepare(`
        SELECT
          name,
          COUNT(*) AS total_calls,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed,
          AVG(duration_ms) AS avg_duration_ms
        FROM tool_calls
        GROUP BY name
        ORDER BY name
      `)
      .all() as ToolCallStats[];
  }
}
