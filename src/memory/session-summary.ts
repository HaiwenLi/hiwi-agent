import { err, ok } from "neverthrow";
import type { Message, ModelAdapter } from "../types.js";
import type { MemoryFileStore } from "./file-store.js";

export interface SessionSummary {
  date: string;
  topics: string[];
  decisions: string[];
  filesModified: string[];
  keyInsights: string[];
  duration: number;
}

const SUMMARIZE_PROMPT = `Summarize this coding session. Return JSON with:
- topics: string[] (main topics/areas discussed)
- decisions: string[] (technical decisions made)
- filesModified: string[] (files that were read, edited, or created)
- keyInsights: string[] (notable findings, bugs found, patterns learned)
Keep each item concise (one sentence max).`;

const MIN_MESSAGES = 4;

export class SessionSummarizer {
  constructor(
    private llm: ModelAdapter,
    private memoryStore: MemoryFileStore,
  ) {}

  async summarize(
    messages: Message[],
    date: string,
  ): Promise<import("neverthrow").Result<SessionSummary | null, Error>> {
    if (messages.length < MIN_MESSAGES) {
      return ok(null);
    }

    const conversation = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

    try {
      const response = await this.llm.chat([
        { role: "system", content: SUMMARIZE_PROMPT },
        { role: "user", content: conversation },
      ]);

      const parsed = JSON.parse(response.content);
      return ok({
        date,
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        filesModified: Array.isArray(parsed.filesModified) ? parsed.filesModified : [],
        keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
        duration: typeof parsed.duration === "number" ? parsed.duration : 0,
      });
    } catch {
      return ok({
        date,
        topics: [],
        decisions: [],
        filesModified: [],
        keyInsights: [],
        duration: 0,
      });
    }
  }

  async storeSummary(summary: SessionSummary): Promise<import("neverthrow").Result<string, Error>> {
    try {
      const name = `session-${summary.date}-${Date.now()}`;
      const content = [
        `## Topics\n${summary.topics.map((t) => `- ${t}`).join("\n")}`,
        `## Decisions\n${summary.decisions.map((d) => `- ${d}`).join("\n")}`,
        `## Files Modified\n${summary.filesModified.map((f) => `- ${f}`).join("\n")}`,
        `## Key Insights\n${summary.keyInsights.map((i) => `- ${i}`).join("\n")}`,
        `## Duration\n${summary.duration} minutes`,
      ].join("\n\n");

      await this.memoryStore.write(
        name,
        "session",
        `Session ${summary.date}: ${summary.topics.join(", ")}`,
        content,
      );
      return ok(name);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
