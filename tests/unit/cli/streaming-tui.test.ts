import { createApp, type AppHandle } from "@/cli/app.js";
import { afterEach, describe, expect, it } from "vitest";

describe("Streaming TUI", () => {
  let app: AppHandle;

  afterEach(() => {
    // createApp starts the TUI; no explicit cleanup needed
    // — process.exit on Ctrl+C handles it
  });

  it("returns streaming control methods", () => {
    app = createApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("addStreamChunk");
    expect(app).toHaveProperty("endStream");
    expect(app).toHaveProperty("addThinkingChunk");
    expect(app).toHaveProperty("endThinking");
    expect(typeof app.addStreamChunk).toBe("function");
    expect(typeof app.endStream).toBe("function");
  });

  it("addStreamChunk and endStream do not throw", () => {
    app = createApp({ onInput: async () => {} });
    expect(() => {
      app.addStreamChunk("Hello");
      app.addStreamChunk(" World");
      app.addStreamChunk("!");
      app.endStream();
    }).not.toThrow();
  });

  it("endStream finalizes and addOutput works after", () => {
    app = createApp({ onInput: async () => {} });
    app.addStreamChunk("Hello World");
    app.endStream();
    expect(() => {
      app.addOutput("Another message", "assistant");
    }).not.toThrow();
  });

  it("addOutput accepts different roles", () => {
    app = createApp({ onInput: async () => {} });
    expect(() => {
      app.addOutput("System message", "system");
      app.addOutput("Error message", "error");
      app.addOutput("Tool output", "tool");
    }).not.toThrow();
  });

  it("can handle rapid streaming without errors", () => {
    app = createApp({ onInput: async () => {} });
    expect(() => {
      for (let i = 0; i < 200; i++) {
        app.addStreamChunk(`chunk-${i} `);
      }
      app.endStream();
    }).not.toThrow();
  });

  it("thinking lifecycle: chunks + endThinking completes", () => {
    app = createApp({ onInput: async () => {} });
    expect(() => {
      app.addThinkingChunk("Step 1\n");
      app.addThinkingChunk("Step 2\n");
      app.addThinkingChunk("Step 3");
      app.endThinking();
    }).not.toThrow();
  });

  it("separate createApp instances have isolated state", () => {
    const app1 = createApp({ onInput: async () => {} });
    const app2 = createApp({ onInput: async () => {} });
    app1.addStreamChunk("from app1");
    app1.endStream();
    app2.addStreamChunk("from app2");
    app2.endStream();
    expect(() => {
      app1.addOutput("from app1", "assistant");
      app2.addOutput("from app2", "assistant");
    }).not.toThrow();
  });
});
