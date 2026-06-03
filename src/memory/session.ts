import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface Session {
  id: string;
  workingDir: string;
  status: "active" | "completed";
  createdAt: string;
  lastActive: string;
}

export interface SessionMessage {
  id: number;
  sessionId: string;
  role: string;
  content: string;
  tokens: number;
  createdAt: string;
}

export interface SessionSummary {
  id: number;
  sessionId: string;
  content: string;
  createdAt: string;
}

const CREATE_SESSIONS = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    working_dir TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_MESSAGES = `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_SUMMARIES = `
  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
  }

  init(): void {
    this.db.exec(CREATE_SESSIONS);
    this.db.exec(CREATE_MESSAGES);
    this.db.exec(CREATE_SUMMARIES);
  }

  close(): void {
    this.db.close();
  }

  createSession(workingDir: string): Session {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO sessions (id, working_dir, status, created_at, last_active) VALUES (?, ?, 'active', ?, ?)",
      )
      .run(id, workingDir, now, now);

    return { id, workingDir, status: "active", createdAt: now, lastActive: now };
  }

  listSessions(): Session[] {
    return this.db
      .prepare(
        "SELECT id, working_dir as workingDir, status, created_at as createdAt, last_active as lastActive FROM sessions ORDER BY last_active DESC",
      )
      .all() as Session[];
  }

  findActiveSession(workingDir: string): Session | null {
    const row = this.db
      .prepare(
        "SELECT id, working_dir as workingDir, status, created_at as createdAt, last_active as lastActive FROM sessions WHERE working_dir = ? AND status = 'active' ORDER BY last_active DESC LIMIT 1",
      )
      .get(workingDir) as Session | undefined;
    return row ?? null;
  }

  completeSession(id: string): void {
    this.db
      .prepare("UPDATE sessions SET status = 'completed', last_active = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  deleteSession(id: string): boolean {
    const existing = this.db
      .prepare("SELECT id FROM sessions WHERE id = ?")
      .get(id) as { id: string } | undefined;
    if (!existing) return false;

    const del = this.db.transaction(() => {
      this.db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM summaries WHERE session_id = ?").run(id);
      this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    });
    del();
    return true;
  }

  appendMessage(sessionId: string, role: string, content: string, tokens: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO messages (session_id, role, content, tokens, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(sessionId, role, content, tokens, now);

    this.db.prepare("UPDATE sessions SET last_active = ? WHERE id = ?").run(now, sessionId);
  }

  getMessages(sessionId: string): SessionMessage[] {
    return this.db
      .prepare(
        "SELECT id, session_id as sessionId, role, content, tokens, created_at as createdAt FROM messages WHERE session_id = ? ORDER BY id ASC",
      )
      .all(sessionId) as SessionMessage[];
  }

  getTotalTokens(sessionId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(tokens), 0) as total FROM messages WHERE session_id = ?")
      .get(sessionId) as { total: number };
    return row.total;
  }

  saveSummary(sessionId: string, content: string): void {
    this.db.prepare("DELETE FROM summaries WHERE session_id = ?").run(sessionId);
    this.db
      .prepare("INSERT INTO summaries (session_id, content, created_at) VALUES (?, ?, ?)")
      .run(sessionId, content, new Date().toISOString());
  }

  getLatestSummary(sessionId: string): SessionSummary | null {
    const row = this.db
      .prepare(
        "SELECT id, session_id as sessionId, content, created_at as createdAt FROM summaries WHERE session_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(sessionId) as SessionSummary | undefined;
    return row ?? null;
  }
}
