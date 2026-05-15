import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRepoOverviewTool } from "@/tools/repo-overview.js";
import type { Tool, ToolContext } from "@/types.js";

describe("repo_overview tool", () => {
  let tempDir: string;
  let tool: Tool;
  let ctx: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hiwi-repo-"));
    tool = createRepoOverviewTool();
    ctx = { workingDirectory: tempDir, sessionId: "test" };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it("has correct metadata", () => {
    expect(tool.name).toBe("repo_overview");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("detects Node.js ecosystem from package.json", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", version: "1.0.0" }),
    );

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Node.js");
  });

  it("detects Python ecosystem from pyproject.toml", async () => {
    await fs.writeFile(
      path.join(tempDir, "pyproject.toml"),
      "[project]\nname = 'test'\nversion = '1.0.0'\n",
    );

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Python");
  });

  it("detects Go ecosystem from go.mod", async () => {
    await fs.writeFile(
      path.join(tempDir, "go.mod"),
      "module example.com/test\ngo 1.21\n",
    );

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Go");
  });

  it("detects Rust ecosystem from Cargo.toml", async () => {
    await fs.writeFile(
      path.join(tempDir, "Cargo.toml"),
      '[package]\nname = "test"\nversion = "1.0.0"\n',
    );

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Rust");
  });

  it("detects package manager from lock files (pnpm-lock.yaml)", async () => {
    await fs.writeFile(path.join(tempDir, "package.json"), "{}");
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("pnpm");
  });

  it("generates directory structure showing src/ and index.ts", async () => {
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "export {}");
    await fs.writeFile(path.join(tempDir, "package.json"), "{}");

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("src/");
    expect(result.content).toContain("index.ts");
  });

  it("respects depth limit (depth:1 should not show nested dirs)", async () => {
    await fs.mkdir(path.join(tempDir, "src", "components"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "src", "components", "App.tsx"), "");
    await fs.writeFile(path.join(tempDir, "package.json"), "{}");

    const result = await tool.execute({ depth: 1 }, ctx);
    expect(result.isError).toBe(false);
    // depth:1 means only top-level, so src/ is shown but not components/
    expect(result.content).toContain("src/");
    expect(result.content).not.toContain("components");
  });

  it("ignores common directories (node_modules, .git)", async () => {
    await fs.mkdir(path.join(tempDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git", "objects"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "node_modules", "pkg", "index.js"), "");
    await fs.writeFile(path.join(tempDir, ".git", "objects", "abc"), "");
    await fs.writeFile(path.join(tempDir, "package.json"), "{}");

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).not.toContain("node_modules");
    expect(result.content).not.toContain(".git");
  });

  it("detects entry points from package.json (main, bin fields)", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "test",
        main: "lib/index.js",
        bin: { "my-cli": "./bin/cli.js" },
      }),
    );

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("lib/index.js");
    expect(result.content).toContain("cli.js");
  });

  it("uses workingDirectory when path is omitted", async () => {
    await fs.writeFile(path.join(tempDir, "package.json"), "{}");

    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Ecosystems");
  });

  it("returns error for non-existent path", async () => {
    const result = await tool.execute({ path: "/nonexistent/dir/xyz" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });
});
