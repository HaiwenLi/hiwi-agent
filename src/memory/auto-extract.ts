import type { Message, ModelAdapter } from "../types.js";
import type { MemoryFileStore } from "./file-store.js";

export interface ExtractedFact {
  content: string;
  category: "preference" | "decision" | "fact" | "context" | "correction";
  confidence: number;
  entities: string[];
}

export interface AutoExtractorOptions {
  minTurns: number;
  maxFactsPerTurn: number;
  confidenceThreshold: number;
}

const DEFAULT_OPTIONS: AutoExtractorOptions = {
  minTurns: 1,
  maxFactsPerTurn: 3,
  confidenceThreshold: 0.7,
};

const EXTRACTION_PROMPT = `Analyze this conversation turn and extract any memorable facts worth preserving for future sessions.
Focus on: user preferences, technical decisions, corrections to previous knowledge, project context.
Return a JSON array of objects with: content (string), category (preference|decision|fact|context|correction), confidence (0-1), entities (string[]).
If nothing memorable, return an empty array.`;

export class AutoExtractor {
  private options: AutoExtractorOptions;

  constructor(
    private llm: ModelAdapter,
    private memoryStore: MemoryFileStore,
    options?: Partial<AutoExtractorOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async extract(messages: Message[]): Promise<ExtractedFact[]> {
    const pairs = Math.floor(messages.length / 2);
    if (pairs < this.options.minTurns) return [];

    const lastUser = messages.filter((m) => m.role === "user").at(-1);
    const lastAssistant = messages.filter((m) => m.role === "assistant").at(-1);
    if (!lastUser || !lastAssistant) return [];

    const isShort = lastUser.content.length < 10 && lastAssistant.content.length < 10;
    if (isShort) return [];

    let raw: ExtractedFact[];
    try {
      const response = await this.llm.chat([
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: `User: ${lastUser.content}\nAssistant: ${lastAssistant.content}` },
      ]);
      raw = JSON.parse(response.content);
    } catch {
      return [];
    }

    if (!Array.isArray(raw)) return [];

    const filtered = raw
      .filter((f) => typeof f.content === "string" && typeof f.confidence === "number")
      .filter((f) => f.confidence >= this.options.confidenceThreshold)
      .slice(0, this.options.maxFactsPerTurn)
      .map((f) => ({
        content: f.content,
        category: f.category ?? "fact",
        confidence: f.confidence,
        entities: Array.isArray(f.entities) ? f.entities : [],
      }));

    const existing = await this.memoryStore.list({ type: "auto" });
    const existingContents = existing.map((e) => e.content.toLowerCase());

    return filtered.filter(
      (f) =>
        !existingContents.some(
          (ec) =>
            ec.includes(f.content.toLowerCase().slice(0, 30)) ||
            f.content.toLowerCase().slice(0, 30).includes(ec.slice(0, 30)),
        ),
    );
  }

  async storeFacts(facts: ExtractedFact[]): Promise<void> {
    for (const fact of facts) {
      const name = `auto-${fact.category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await this.memoryStore.write(
        name,
        "auto",
        `Auto-extracted: ${fact.content.slice(0, 60)}`,
        fact.content,
      );
    }
  }
}
