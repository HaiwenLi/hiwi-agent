import Database from "better-sqlite3";
import { AuditTrail } from "@/agentfs/audit-trail.js";
import { VirtualFS } from "@/agentfs/virtual-fs.js";
import { KvStore } from "@/agentfs/kv-store.js";

export class AgentFS {
  public trail: AuditTrail;
  public fs: VirtualFS;
  public kv: KvStore;
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.trail = new AuditTrail(this.db);
    this.fs = new VirtualFS(this.db);
    this.kv = new KvStore(this.db);
  }

  init(): void {
    this.db.exec("PRAGMA foreign_keys = ON");
    this.trail.init();
    this.fs.init();
    this.kv.init();
  }

  close(): void {
    this.db.close();
  }
}
