import { describe, expect, it } from "vitest";

describe("ProviderPicker", () => {
  it("exports ProviderPicker component", async () => {
    const mod = await import("@/cli/provider-picker.js");
    expect(mod.ProviderPicker).toBeDefined();
  });
});
