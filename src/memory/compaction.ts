import type { Message, ModelAdapter } from "../types.js";

export interface CompactOptions {
  contextLimit: number;
  maxOutputTokens: number;
  reserved: number;
  existingSummary?: string;
  maxToolOutputChars?: number;
  preserveRecentToolOutputs?: number;
}

export interface CompactResult {
  messages: Message[];
  summary?: string;
  compacted: boolean;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function shouldCompact(
  messages: Message[],
  contextLimit: number,
  maxOutputTokens: number,
  reserved: number,
): boolean {
  const totalTokens = messages.reduce(
    (sum, m) =>
      sum + estimateTokens(typeof m.content === "string" ? m.content : JSON.stringify(m.content)),
    0,
  );
  const threshold = contextLimit - maxOutputTokens - reserved;
  return totalTokens >= threshold;
}

export function pruneToolOutputs(
  messages: Message[],
  maxChars = 2000,
  preserveRecent = 2,
): Message[] {
  const toolMessages = messages.filter((m) => m.role === "tool");
  const recentToolIds =
    preserveRecent > 0
      ? new Set(toolMessages.slice(-preserveRecent).map((m) => m.toolCallId))
      : new Set<string>();

  return messages.map((m) => {
    if (m.role !== "tool") return m;
    if (recentToolIds.has(m.toolCallId)) return m;
    if (m.content.length <= maxChars) return m;

    const truncated = m.content.slice(0, maxChars);
    return {
      ...m,
      content: `${truncated}\n\n[... truncated from ${m.content.length} chars]`,
    };
  });
}

const SUMMARIZE_PROMPT = `You are a conversation summarizer. Produce a structured summary with these sections:

## Goal
What the user is trying to accomplish.

## Progress
What has been done so far.

## Decisions
Key decisions made.

## Next Steps
What needs to happen next.

## Critical Context
Important facts, file paths, or state that must be preserved.

## Files
Files that have been read, created, or modified.

Be concise. Preserve all factual details. Do not add anything not in the conversation.`;

export class ContextCompactor {
  private adapter: ModelAdapter;

  constructor(adapter: ModelAdapter) {
    this.adapter = adapter;
  }

  async compact(messages: Message[], options: CompactOptions): Promise<CompactResult> {
    if (!shouldCompact(messages, options.contextLimit, options.maxOutputTokens, options.reserved)) {
      return { messages, compacted: false };
    }

    const maxChars = options.maxToolOutputChars ?? 2000;
    const preserveRecent = options.preserveRecentToolOutputs ?? 2;
    const processed = pruneToolOutputs(messages, maxChars, preserveRecent);

    const recentCount = 4;
    const recent = processed.slice(-recentCount);
    const older = processed.slice(0, -recentCount);

    if (older.length === 0) {
      return { messages: processed, compacted: true };
    }

    const olderText = older.map((m) => `[${m.role}]: ${m.content}`).join("\n\n");

    const summarizeInput = options.existingSummary
      ? `Previous summary:\n${options.existingSummary}\n\nNew conversation to incorporate:\n${olderText}`
      : `Conversation to summarize:\n${olderText}`;

    const response = await this.adapter.chat(
      [
        { role: "system", content: SUMMARIZE_PROMPT },
        { role: "user", content: summarizeInput },
      ],
      { maxTokens: 2000 },
    );

    const summary = response.content;

    const compacted: Message[] = [
      { role: "system", content: `[Conversation Summary]\n${summary}` },
      ...recent,
    ];

    return { messages: compacted, summary, compacted: true };
  }
}
