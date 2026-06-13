import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryFileStore } from "@/memory/file-store.js";
import { MemoryManager } from "@/memory/manager.js";
import { Mem0Client } from "@/memory/mem0-client.js";
import type { Message } from "@/types.js";

export async function createTempMemoryStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-mem-"));
  const store = new MemoryFileStore(dir);
  await store.init();
  return {
    store,
    dir,
    cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => {}),
  };
}

export async function createTestMemoryManager() {
  const { store, dir, cleanup } = await createTempMemoryStore();
  const mem0 = new Mem0Client({ apiKey: undefined });
  const manager = new MemoryManager(store, mem0);
  return { manager, store, dir, cleanup };
}

export function makeMessages(pairs: Array<[string, string]>): Message[] {
  return pairs.map(([role, content]) => ({ role: role as Message["role"], content }));
}
