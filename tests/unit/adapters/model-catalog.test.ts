import type { ModelEntry } from "@/types.js";
import { describe, expect, it } from "vitest";

describe("ModelEntry", () => {
  it("accepts a minimal model entry with id", () => {
    const entry: ModelEntry = { id: "gpt-4o" };
    expect(entry.id).toBe("gpt-4o");
  });

  it("accepts a full model entry with optional fields", () => {
    const entry: ModelEntry = {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      tier: "standard",
      tags: ["anthropic", "fast"],
    };
    expect(entry.label).toBe("Claude Sonnet 4.6");
    expect(entry.tier).toBe("standard");
    expect(entry.tags).toEqual(["anthropic", "fast"]);
  });
});
