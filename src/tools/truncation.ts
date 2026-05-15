import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

export type TruncationResult =
  | { type: "full"; text: string }
  | { type: "truncated"; preview: string; fullFilePath: string };

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50_000;
const HEAD_LINES = 500;
const TAIL_LINES = 500;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export class TruncationService {
  constructor(private tempDir: string) {}

  truncate(text: string, options: TruncationOptions = {}): TruncationResult {
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    const lines = text.split("\n");
    const needsLineTruncation = lines.length > maxLines;
    const needsByteTruncation = Buffer.byteLength(text, "utf-8") > maxBytes;

    if (!needsLineTruncation && !needsByteTruncation) {
      return { type: "full", text };
    }

    const id = crypto.randomBytes(8).toString("hex");
    const fullFilePath = path.join(this.tempDir, `truncation-${id}.txt`);

    mkdirSync(this.tempDir, { recursive: true });
    writeFileSync(fullFilePath, text, "utf-8");

    const headLines = lines.slice(0, HEAD_LINES);
    const tailLines = lines.slice(-TAIL_LINES);
    const truncatedCount = lines.length - HEAD_LINES - TAIL_LINES;
    const separator = `\n... truncated ${truncatedCount} lines (full output at ${fullFilePath}) ...\n`;
    const preview = headLines.join("\n") + separator + tailLines.join("\n");

    return { type: "truncated", preview, fullFilePath };
  }

  async cleanup(): Promise<void> {
    try {
      const entries = await fs.readdir(this.tempDir);
      const now = Date.now();

      for (const entry of entries) {
        if (!entry.startsWith("truncation-")) continue;
        const filePath = path.join(this.tempDir, entry);
        const stat = await fs.stat(filePath);
        if (now - stat.mtimeMs > RETENTION_MS) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
    } catch {
      // Directory may not exist
    }
  }
}
