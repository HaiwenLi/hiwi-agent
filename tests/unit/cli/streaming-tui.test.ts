import { type AppProps, type OutputLine, renderApp } from "@/cli/app.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Streaming TUI", () => {
  let app: ReturnType<typeof renderApp>;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    try { app?.unmount(); } catch {}
  });

  it("returns streaming control methods", () => {
    app = renderApp({ onInput: async () => {} });
    expect(app).toHaveProperty("addOutput");
    expect(app).toHaveProperty("addStreamChunk");
    expect(app).toHaveProperty("endStream");
    expect(typeof app.addStreamChunk).toBe("function");
    expect(typeof app.endStream).toBe("function");
  });

  it("addStreamChunk writes chunks incrementally", () => {
    app = renderApp({ onInput: async () => {} });

    app.addStreamChunk("Hello");
    expect(stdoutWriteSpy).toHaveBeenCalled();

    app.addStreamChunk(" World");
    expect(stdoutWriteSpy).toHaveBeenCalled();

    app.addStreamChunk("!");
    app.endStream();

    // All chunks should have been written
    const allCalls = stdoutWriteSpy.mock.calls.map((c) => c[0]).join("");
    expect(allCalls).toContain("Hello");
    expect(allCalls).toContain(" World");
    expect(allCalls).toContain("!");
  });

  it("endStream adds newline after streaming", () => {
    app = renderApp({ onInput: async () => {} });

    app.addStreamChunk("Test");
    app.endStream();

    const allCalls = stdoutWriteSpy.mock.calls.map((c) => c[0]).join("");
    expect(allCalls).toContain("\n");
  });

  it("addOutput still writes to stdout with newline", () => {
    app = renderApp({ onInput: async () => {} });

    app.addOutput("Complete message", "assistant");

    expect(stdoutWriteSpy).toHaveBeenCalled();
    const allCalls = stdoutWriteSpy.mock.calls.map((c) => c[0]).join("");
    expect(allCalls).toContain("Complete message");
    expect(allCalls).toContain("\n");
  });

  it("can handle rapid streaming without errors", () => {
    app = renderApp({ onInput: async () => {} });

    // Simulate 200 rapid chunks
    for (let i = 0; i < 200; i++) {
      app.addStreamChunk(`chunk-${i} `);
    }
    app.endStream();

    // No errors thrown = pass
    expect(stdoutWriteSpy).toHaveBeenCalled();
  });
});
