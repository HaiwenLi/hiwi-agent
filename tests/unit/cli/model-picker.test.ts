import { flattenModels, fuzzyFilter } from "@/cli/model-picker.js";
import { describe, expect, it } from "vitest";

describe("fuzzyFilter", () => {
  it("returns items that contain the query (case-insensitive)", () => {
    const result = fuzzyFilter("son", ["claude-sonnet-4-6", "claude-opus-4-7", "gpt-4o"]);
    expect(result).toEqual(["claude-sonnet-4-6"]);
  });

  it("returns all items when query is empty", () => {
    const items = ["claude-sonnet-4-6", "gpt-4o"];
    expect(fuzzyFilter("", items)).toEqual(items);
  });

  it("returns empty array when no matches", () => {
    expect(fuzzyFilter("xyz", ["claude-sonnet-4-6", "gpt-4o"])).toEqual([]);
  });

  it("matches case-insensitively", () => {
    expect(fuzzyFilter("CLAUDE", ["claude-sonnet-4-6"])).toEqual(["claude-sonnet-4-6"]);
  });
});

describe("flattenModels", () => {
  it("flattens provider groups into single array with provider field", () => {
    const catalog = {
      anthropic: [{ id: "claude-sonnet-4-6" }, { id: "claude-opus-4-7" }],
      openai: [{ id: "gpt-4o" }],
    };

    const result = flattenModels(catalog);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ model: { id: "claude-sonnet-4-6" }, provider: "anthropic" });
    expect(result[2]).toEqual({ model: { id: "gpt-4o" }, provider: "openai" });
  });

  it("returns empty array for empty catalog", () => {
    expect(flattenModels({})).toEqual([]);
  });
});
