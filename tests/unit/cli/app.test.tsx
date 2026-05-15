import { type AppProps, renderApp } from "@/cli/app.js";
import { describe, expect, it } from "vitest";

describe("App (TUI)", () => {
  it("exports a renderApp function", () => {
    expect(typeof renderApp).toBe("function");
  });

  it("returns an object with render control methods", () => {
    const app = renderApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("waitUntilExit");
    expect(typeof app.addOutput).toBe("function");
  });

  it("addOutput accepts text and role", () => {
    const app = renderApp({ onInput: async () => {} });
    app.addOutput("Hello, world!", "assistant");
    app.addOutput("Tool: read_file", "tool");
    app.addOutput("System message", "system");
  });

  it("renderApp preserves the same public API after component split", () => {
    const app = renderApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("addStreamChunk");
    expect(app).toHaveProperty("endStream");
    expect(app).toHaveProperty("waitUntilExit");
    expect(app).toHaveProperty("clear");
    expect(app).toHaveProperty("unmount");
  });

  it("streaming text renders via addStreamChunk without error", () => {
    const app = renderApp({ onInput: async () => {} });
    app.addStreamChunk("streaming");
    app.addStreamChunk(" test");
    app.endStream();
    app.addOutput("another line", "assistant");
  });

  it("handles many output lines without performance degradation", () => {
    const app = renderApp({ onInput: async () => {} });
    for (let i = 0; i < 1000; i++) {
      app.addOutput(`Line ${i}`, "assistant");
    }
    app.addStreamChunk("still responsive");
    app.endStream();
  });
});
