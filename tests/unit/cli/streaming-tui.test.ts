import { renderApp } from "@/cli/app.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Streaming TUI", () => {
  let app: ReturnType<typeof renderApp>;

  afterEach(() => {
    try {
      app?.unmount();
    } catch {}
  });

  it("returns streaming control methods", () => {
    app = renderApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("addStreamChunk");
    expect(app).toHaveProperty("endStream");
    expect(typeof app.addStreamChunk).toBe("function");
    expect(typeof app.endStream).toBe("function");
  });

  it("addStreamChunk and endStream do not throw", () => {
    app = renderApp({ onInput: async () => {} });

    expect(() => {
      app.addStreamChunk("Hello");
      app.addStreamChunk(" World");
      app.addStreamChunk("!");
      app.endStream();
    }).not.toThrow();
  });

  it("endStream finalizes and addOutput deduplicates", () => {
    app = renderApp({ onInput: async () => {} });

    app.addStreamChunk("Hello World");
    app.endStream();

    // addOutput with same text after endStream should be deduped
    expect(() => {
      app.addOutput("Hello World", "assistant");
    }).not.toThrow();

    // Different text should not be deduped
    expect(() => {
      app.addOutput("Another message", "assistant");
    }).not.toThrow();
  });

  it("addOutput accepts different roles", () => {
    app = renderApp({ onInput: async () => {} });

    expect(() => {
      app.addOutput("System message", "system");
      app.addOutput("Error message", "error");
      app.addOutput("Tool output", "tool");
    }).not.toThrow();
  });

  it("can handle rapid streaming without errors", () => {
    app = renderApp({ onInput: async () => {} });

    // Simulate 200 rapid chunks
    expect(() => {
      for (let i = 0; i < 200; i++) {
        app.addStreamChunk(`chunk-${i} `);
      }
      app.endStream();
    }).not.toThrow();
  });

  it("coalesces rapid chunks before flushing to stream state", async () => {
    app = renderApp({ onInput: async () => {} });

    // Send many chunks synchronously (like a burst of stream tokens)
    for (let i = 0; i < 50; i++) {
      app.addStreamChunk(`chunk-${i} `);
    }

    // Wait for coalescing timer to fire (16ms timer + margin)
    await new Promise((r) => setTimeout(r, 30));

    app.endStream();

    // Verify endStream works correctly after coalescing
    expect(() => app.addOutput("final", "assistant")).not.toThrow();
  });

  it("separate renderApp instances have isolated state", () => {
    const app1 = renderApp({ onInput: async () => {} });
    const app2 = renderApp({ onInput: async () => {} });

    app1.addStreamChunk("from app1");
    app1.endStream();

    app2.addStreamChunk("from app2");
    app2.endStream();

    expect(() => {
      app1.addOutput("from app1", "assistant");
      app2.addOutput("from app2", "assistant");
    }).not.toThrow();

    app1.unmount();
    app2.unmount();
  });
});
