import { MockAdapter } from "@/adapters/mock.js";
import { renderApp } from "@/cli/app.js";
import { AgentLoop } from "@/core/agent.js";
import { ToolRegistry } from "@/core/tools.js";
import type { AgentLoopConfig } from "@/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

const STREAM_CONFIG: AgentLoopConfig = {
  maxLoops: 50,
  maxOutputTokensPerTurn: 4096,
  budgetTotal: 50,
  refundableTools: ["read_file"],
  streaming: true,
  interruptible: true,
};

describe("Streaming integration flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("end-to-end: adapter.stream() → AgentLoop → renderApp coalesced output", async () => {
    const adapter = new MockAdapter([
      { content: "The quick brown fox jumps over the lazy dog.", toolCalls: [], finishReason: "stop" },
    ]);

    const registry = new ToolRegistry();

    const loop = new AgentLoop(adapter, registry, "normal", STREAM_CONFIG);

    const events: any[] = [];
    for await (const event of loop.run([{ role: "user", content: "Hello" }])) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text-delta");
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    const fullText = textDeltas.map((e) => e.text).join("");
    expect(fullText).toContain("The quick brown fox");

    const app = renderApp({ onInput: async () => {} });
    for (const delta of textDeltas) {
      app.addStreamChunk(delta.text);
    }
    app.endStream();

    await new Promise((r) => setTimeout(r, 30));

    app.addOutput("next message", "assistant");
    app.unmount();
  });
});
