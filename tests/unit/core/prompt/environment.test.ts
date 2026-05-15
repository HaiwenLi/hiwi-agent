import os from "node:os";
import { describe, expect, it } from "vitest";
import { buildEnvironmentContext } from "@/core/prompt/environment.js";

describe("buildEnvironmentContext", () => {
  it("includes working directory", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/home/user/project" });
    expect(ctx).toContain("/home/user/project");
  });

  it("includes platform", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/tmp" });
    expect(ctx).toContain(process.platform);
  });

  it("includes current date", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/tmp" });
    const today = new Date().toISOString().split("T")[0];
    expect(ctx).toContain(today);
  });

  it("includes shell info", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: "/tmp" });
    expect(ctx).toMatch(/shell/i);
  });

  it("handles missing git branch gracefully", () => {
    const ctx = buildEnvironmentContext({ workingDirectory: os.tmpdir() });
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(0);
  });
});
