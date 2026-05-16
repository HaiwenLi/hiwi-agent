import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryFileStore } from "@/memory/file-store.js";
import { type UserProfile, UserProfileManager } from "@/memory/user-profile.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("UserProfileManager", () => {
  let store: MemoryFileStore;
  let manager: UserProfileManager;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `hiwi-user-profile-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    store = new MemoryFileStore(tmpDir);
    await store.init();
    manager = new UserProfileManager(store);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("getProfile", () => {
    it("returns null when no profile exists", async () => {
      const result = await manager.getProfile();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it("returns profile when it exists", async () => {
      await manager.updateProfile({
        role: "Senior backend engineer",
        expertise: ["Go", "TypeScript"],
        preferences: ["terse explanations"],
        communicationStyle: "Direct",
      });

      const result = await manager.getProfile();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value!.role).toBe("Senior backend engineer");
        expect(result.value!.expertise).toContain("Go");
      }
    });
  });

  describe("updateProfile", () => {
    it("creates profile from scratch", async () => {
      const result = await manager.updateProfile({
        role: "Full-stack developer",
        expertise: ["React", "Node.js"],
      });
      expect(result.isOk()).toBe(true);
    });

    it("updates profile with partial changes", async () => {
      await manager.updateProfile({
        role: "Developer",
        expertise: ["Python"],
      });

      await manager.updateProfile({
        expertise: ["Python", "TypeScript"],
      });

      const result = await manager.getProfile();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value!.role).toBe("Developer");
        expect(result.value!.expertise).toContain("TypeScript");
      }
    });
  });

  describe("toMarkdown", () => {
    it("converts profile to markdown for prompt injection", async () => {
      await manager.updateProfile({
        role: "Senior engineer",
        expertise: ["Go", "distributed systems"],
        preferences: ["no comments in code"],
        communicationStyle: "Direct, no fluff",
      });

      const result = await manager.toMarkdown();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toContain("Senior engineer");
        expect(result.value).toContain("Go");
        expect(result.value).toContain("distributed systems");
        expect(result.value).toContain("no comments");
      }
    });

    it("returns empty string when no profile", async () => {
      const result = await manager.toMarkdown();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("");
      }
    });
  });

  describe("buildFromMemories", () => {
    it("generates profile from existing memories", async () => {
      await store.write("pref-1", "auto", "Preference", "User prefers TypeScript over JavaScript");
      await store.write(
        "pref-2",
        "auto",
        "Preference",
        "User is a backend engineer with 10 years experience",
      );
      await store.write("pref-3", "auto", "Preference", "User likes terse explanations");

      const result = await manager.buildFromMemories();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
        expect(result.value!.expertise.length + result.value!.preferences.length).toBeGreaterThan(
          0,
        );
      }
    });
  });

  describe("edge cases", () => {
    it("handles malformed profile (partial parse)", async () => {
      await store.write(
        "user-profile",
        "user-profile",
        "User profile",
        "role: Developer\nexpertise:\ninvalid content here",
      );

      const result = await manager.getProfile();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).not.toBeNull();
      }
    });
  });
});
