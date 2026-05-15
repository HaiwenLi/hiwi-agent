import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TruncationService } from "@/tools/truncation.js";

describe("TruncationService", () => {
  let service: TruncationService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-trunc-"));
    service = new TruncationService(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("truncate", () => {
    it("returns text as-is when under limits", () => {
      const text = "short output";
      const result = service.truncate(text);
      expect(result.type).toBe("full");
      if (result.type === "full") {
        expect(result.text).toBe("short output");
      }
    });

    it("truncates by line count when exceeding maxLines", () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
      const text = lines.join("\n");
      const result = service.truncate(text, { maxLines: 2000 });
      expect(result.type).toBe("truncated");
      if (result.type === "truncated") {
        expect(result.preview).toContain("line 0");
        expect(result.preview).toContain("line 2999");
        expect(result.fullFilePath).toBeDefined();
      }
    });

    it("truncates by byte size when exceeding maxBytes", () => {
      const text = "x".repeat(60_000);
      const result = service.truncate(text, { maxBytes: 50_000 });
      expect(result.type).toBe("truncated");
    });

    it("writes full content to temp file when truncated", async () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
      const text = lines.join("\n");
      const result = service.truncate(text, { maxLines: 2000 });
      if (result.type === "truncated") {
        const fileContent = await fs.readFile(result.fullFilePath, "utf-8");
        expect(fileContent).toBe(text);
      }
    });

    it("preview contains head and tail with separator", () => {
      const lines = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
      const text = lines.join("\n");
      const result = service.truncate(text, { maxLines: 2000 });
      if (result.type === "truncated") {
        expect(result.preview).toContain("... truncated");
        expect(result.preview).toContain("line 0\n");
        expect(result.preview).toContain("line 2999");
      }
    });
  });

  describe("cleanup", () => {
    it("removes old truncation files", async () => {
      const oldFile = path.join(tempDir, "truncation-old.txt");
      await fs.writeFile(oldFile, "old data");

      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      await fs.utimes(oldFile, oldDate, oldDate);

      await service.cleanup();
      const exists = await fs.access(oldFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it("keeps recent truncation files", async () => {
      const recentFile = path.join(tempDir, "truncation-recent.txt");
      await fs.writeFile(recentFile, "recent data");

      await service.cleanup();
      const exists = await fs.access(recentFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
});
