import { err, ok } from "neverthrow";
import type { MemoryFileStore } from "./file-store.js";

export interface UserProfile {
  role?: string;
  expertise: string[];
  preferences: string[];
  communicationStyle?: string;
}

const PROFILE_NAME = "user-profile";
const PROFILE_TYPE = "user-profile";

export class UserProfileManager {
  constructor(private memoryStore: MemoryFileStore) {}

  async getProfile(): Promise<import("neverthrow").Result<UserProfile | null, Error>> {
    try {
      const mem = await this.memoryStore.read(PROFILE_NAME);
      if (!mem) return ok(null);
      return ok(this.parseProfile(mem.content));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async updateProfile(
    updates: Partial<UserProfile>,
  ): Promise<import("neverthrow").Result<void, Error>> {
    try {
      const existing = await this.memoryStore.read(PROFILE_NAME);
      const current: UserProfile = existing
        ? this.parseProfile(existing.content)
        : { expertise: [], preferences: [] };

      const merged: UserProfile = {
        role: updates.role ?? current.role,
        expertise: updates.expertise ?? current.expertise,
        preferences: updates.preferences ?? current.preferences,
        communicationStyle: updates.communicationStyle ?? current.communicationStyle,
      };

      await this.memoryStore.write(
        PROFILE_NAME,
        PROFILE_TYPE,
        "User profile",
        this.serializeProfile(merged),
      );
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async buildFromMemories(): Promise<import("neverthrow").Result<UserProfile, Error>> {
    try {
      const memories = await this.memoryStore.list({ type: "auto" });
      const expertise: string[] = [];
      const preferences: string[] = [];
      let role: string | undefined;

      for (const mem of memories) {
        const content = mem.content.toLowerCase();
        if (content.includes("engineer") || content.includes("developer")) {
          const match = mem.content.match(
            /(?:senior |junior |lead |staff )?\w+ (?:engineer|developer)/i,
          );
          if (match) role = match[0];
        }
        if (content.includes("prefers") || content.includes("likes") || content.includes("wants")) {
          preferences.push(mem.content);
        }
        const techTerms = mem.content.match(
          /\b(?:Go|TypeScript|JavaScript|React|Python|Rust|Node\.js|Java)\b/g,
        );
        if (techTerms) {
          for (const t of techTerms) {
            if (!expertise.includes(t)) expertise.push(t);
          }
        }
      }

      const profile: UserProfile = {
        role,
        expertise,
        preferences: preferences.slice(0, 10),
      };

      if (role || expertise.length > 0 || preferences.length > 0) {
        await this.memoryStore.write(
          PROFILE_NAME,
          PROFILE_TYPE,
          "User profile",
          this.serializeProfile(profile),
        );
      }

      return ok(profile);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async toMarkdown(): Promise<import("neverthrow").Result<string, Error>> {
    try {
      const result = await this.getProfile();
      if (result.isErr()) return err(result.error);
      const profile = result.value;
      if (!profile) return ok("");

      const lines: string[] = [];
      if (profile.role) lines.push(`## Role\n${profile.role}`);
      if (profile.expertise.length > 0)
        lines.push(`## Expertise\n${profile.expertise.map((e) => `- ${e}`).join("\n")}`);
      if (profile.preferences.length > 0)
        lines.push(`## Preferences\n${profile.preferences.map((p) => `- ${p}`).join("\n")}`);
      if (profile.communicationStyle)
        lines.push(`## Communication Style\n${profile.communicationStyle}`);

      return ok(lines.join("\n\n"));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private parseProfile(content: string): UserProfile {
    const profile: UserProfile = { expertise: [], preferences: [] };
    const sections = content.split(/^## /m);

    for (const section of sections) {
      const lines = section.split("\n");
      const header = lines[0]?.trim().toLowerCase();
      const body = lines.slice(1).join("\n").trim();

      if (header === "role") {
        profile.role = body || undefined;
      } else if (header === "expertise") {
        profile.expertise = body
          .split("\n")
          .map((l) => l.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
      } else if (header === "preferences") {
        profile.preferences = body
          .split("\n")
          .map((l) => l.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
      } else if (header === "communication style") {
        profile.communicationStyle = body || undefined;
      }
    }

    return profile;
  }

  private serializeProfile(profile: UserProfile): string {
    const lines: string[] = [];
    if (profile.role) lines.push(`## Role\n${profile.role}`);
    lines.push(
      `## Expertise\n${profile.expertise.map((e) => `- ${e}`).join("\n") || "- (none yet)"}`,
    );
    lines.push(
      `## Preferences\n${profile.preferences.map((p) => `- ${p}`).join("\n") || "- (none yet)"}`,
    );
    if (profile.communicationStyle)
      lines.push(`## Communication Style\n${profile.communicationStyle}`);
    return lines.join("\n\n");
  }
}
