import { createApp } from "@/cli/app.js";
import { describe, expect, it, vi } from "vitest";

describe("App (TUI)", () => {
  it("exports a createApp function", () => {
    expect(typeof createApp).toBe("function");
  });

  it("returns an object with render control methods", () => {
    const app = createApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("waitUntilExit");
    expect(typeof app.addOutput).toBe("function");
  });

  it("addOutput accepts text and role", () => {
    const app = createApp({ onInput: async () => {} });
    app.addOutput("Hello, world!", "assistant");
    app.addOutput("Tool: read_file", "tool");
    app.addOutput("System message", "system");
  });

  it("exposes all streaming and thinking control methods", () => {
    const app = createApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("addStreamChunk");
    expect(app).toHaveProperty("endStream");
    expect(app).toHaveProperty("addThinkingChunk");
    expect(app).toHaveProperty("endThinking");
    expect(app).toHaveProperty("setStatusBarData");
    expect(app).toHaveProperty("waitUntilExit");
  });

  it("streaming text renders via addStreamChunk without error", () => {
    const app = createApp({ onInput: async () => {} });
    app.addStreamChunk("streaming");
    app.addStreamChunk(" test");
    app.endStream();
    app.addOutput("another line", "assistant");
  });

  it("thinking chunks accumulate and finalize via endThinking", () => {
    const app = createApp({ onInput: async () => {} });
    app.addThinkingChunk("Let me think...");
    app.addThinkingChunk(" about this.");
    app.endThinking();
    // Thinking should not throw and should produce output
  });

  it("setStatusBarData accepts token usage", () => {
    const app = createApp({ onInput: async () => {} });
    app.setStatusBarData({
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      contextPercent: 5,
      contextWindow: 200000,
      modelName: "test-model",
      provider: "test-provider",
    });
  });

  it("handles many output lines", () => {
    const app = createApp({ onInput: async () => {} });
    for (let i = 0; i < 1000; i++) {
      app.addOutput(`Line ${i}`, "assistant");
    }
    app.addStreamChunk("still responsive");
    app.endStream();
  });

  it("onPauseRequest callback is exposed in app handle", () => {
    const onPause = vi.fn();
    const app = createApp({ onInput: async () => {}, onPauseRequest: onPause });
    expect(typeof (app as any).onPauseRequest).toBe("function");
  });
});
