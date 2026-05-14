import { describe, it, expect } from "vitest";
import { renderApp, type AppProps } from "@/cli/app.js";

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
});
