### Task 04: repo_overview Tool

**Files:**
- Create: `src/tools/repo-overview.ts`
- Test: `tests/unit/tools/repo-overview.test.ts`

**Context:** Detects project ecosystems (Node, Python, Go, Rust, etc.), package managers, entry points, and generates a directory structure tree. Ported from OpenCode `repo_overview.ts`, simplified to use `node:fs` directly (no Effect, no AppFileSystem).

---

**Step 1: Write the failing tests**

Create `tests/unit/tools/repo-overview.test.ts`:

```typescript
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

  it("has correct tool metadata", () => {
    expect(tool.name).toBe("repo_overview");
    expect(tool.capabilities).toContain("ReadOnly");
  });

  it("detects node ecosystem from package.json", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", main: "index.js" }),
    );
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Node.js");
  });

  it("detects python ecosystem from pyproject.toml", async () => {
    await fs.writeFile(path.join(tempDir, "pyproject.toml"), "[project]\nname = 'test'\n");
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Python");
  });

  it("detects go ecosystem from go.mod", async () => {
    await fs.writeFile(path.join(tempDir, "go.mod"), "module example.com/test\n");
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Go");
  });

  it("detects rust ecosystem from Cargo.toml", async () => {
    await fs.writeFile(path.join(tempDir, "Cargo.toml"), '[package]\nname = "test"\n');
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Rust");
  });

  it("detects package manager from lock files", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test" }),
    );
    await fs.writeFile(path.join(tempDir, "pnpm-lock.yaml"), "");
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.content).toContain("pnpm");
  });

  it("generates directory structure", async () => {
    await fs.mkdir(path.join(tempDir, "src"));
    await fs.writeFile(path.join(tempDir, "src", "index.ts"), "");
    await fs.writeFile(path.join(tempDir, "package.json"), '{"name":"t"}');
    const result = await tool.execute({ path: tempDir, depth: 3 }, ctx);
    expect(result.content).toContain("src/");
    expect(result.content).toContain("index.ts");
  });

  it("respects depth limit", async () => {
    await fs.mkdir(path.join(tempDir, "a", "b", "c"), { recursive: true });
    const result = await tool.execute({ path: tempDir, depth: 1 }, ctx);
    expect(result.content).toContain("a/");
    expect(result.content).not.toContain("b/");
  });

  it("ignores common directories", async () => {
    await fs.mkdir(path.join(tempDir, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(tempDir, ".git", "objects"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "package.json"), '{"name":"t"}');
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.content).not.toContain("node_modules");
    expect(result.content).not.toContain(".git");
  });

  it("detects entry points from package.json", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", main: "index.js", bin: "./bin/cli.js" }),
    );
    const result = await tool.execute({ path: tempDir }, ctx);
    expect(result.content).toContain("index.js");
  });

  it("uses workingDirectory when path is omitted", async () => {
    await fs.writeFile(path.join(tempDir, "package.json"), '{"name":"t"}');
    const result = await tool.execute({}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain("Node.js");
  });

  it("returns error for non-existent path", async () => {
    const result = await tool.execute(
      { path: path.join(tempDir, "nope") },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/tools/repo-overview.test.ts`
Expected: FAIL — module not found

**Step 3: Implement createRepoOverviewTool**

Create `src/tools/repo-overview.ts`:

```typescript
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg", "__pycache__", ".next", ".nuxt",
  "dist", "build", ".cache", ".turbo", "target", "vendor", ".venv", "venv",
  "env", ".env", ".tox", ".mypy_cache", ".pytest_cache", "coverage",
]);

const STRUCTURE_LIMIT = 200;

const ECOSYSTEM_FILES: Record<string, string> = {
  "package.json": "Node.js",
  "pyproject.toml": "Python",
  "requirements.txt": "Python",
  "go.mod": "Go",
  "Cargo.toml": "Rust",
  "Gemfile": "Ruby",
  "composer.json": "PHP",
  "build.gradle": "Java/Kotlin",
  "pom.xml": "Java",
};

const LOCK_FILES: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "Cargo.lock": "cargo",
  "go.sum": "go modules",
};

async function buildStructure(
  dir: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  lines: string[],
): Promise<void> {
  if (depth > maxDepth || lines.length >= STRUCTURE_LIMIT) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries = entries.filter((e) => !IGNORED_DIRS.has(e.name)).sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    if (lines.length >= STRUCTURE_LIMIT) break;
    const name = entry.isDirectory() ? `${entry.name}/` : entry.name;
    lines.push(`${prefix}${name}`);
    if (entry.isDirectory()) {
      await buildStructure(
        path.join(dir, entry.name),
        prefix + "  ",
        depth + 1,
        maxDepth,
        lines,
      );
    }
  }
}

export function createRepoOverviewTool(): Tool {
  return {
    name: "repo_overview",
    description:
      "Get an overview of a project repository: detected ecosystems, package manager, entry points, and directory structure.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory to inspect. Defaults to workingDirectory.",
        },
        depth: {
          type: "number",
          description: "Max directory depth for structure tree. Defaults to 3.",
        },
      },
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { path: rawPath, depth = 3 } = input as { path?: string; depth?: number };
      const targetDir = rawPath
        ? path.resolve(ctx.workingDirectory, rawPath)
        : ctx.workingDirectory;

      try {
        const stat = await fs.stat(targetDir);
        if (!stat.isDirectory()) {
          return { toolCallId: "", content: "Path is not a directory", isError: true };
        }
      } catch {
        return { toolCallId: "", content: `Directory not found: ${targetDir}`, isError: true };
      }

      const topFiles = await fs.readdir(targetDir);
      const ecosystems: string[] = [];
      const packageManagers: string[] = [];
      const entryPoints: string[] = [];

      for (const [file, eco] of Object.entries(ECOSYSTEM_FILES)) {
        if (topFiles.includes(file) && !ecosystems.includes(eco)) {
          ecosystems.push(eco);
        }
      }
      for (const [file, pm] of Object.entries(LOCK_FILES)) {
        if (topFiles.includes(file) && !packageManagers.includes(pm)) {
          packageManagers.push(pm);
        }
      }

      if (topFiles.includes("package.json")) {
        try {
          const pkg = JSON.parse(await fs.readFile(path.join(targetDir, "package.json"), "utf-8"));
          for (const field of ["main", "module", "bin", "exports"] as const) {
            if (pkg[field]) {
              const val = typeof pkg[field] === "string" ? pkg[field] : JSON.stringify(pkg[field]);
              entryPoints.push(val);
            }
          }
        } catch { /* ignore */ }
      }

      const structureLines: string[] = [];
      await buildStructure(targetDir, "", 0, depth, structureLines);

      const sections: string[] = [];
      if (ecosystems.length) sections.push(`Ecosystems: ${ecosystems.join(", ")}`);
      if (packageManagers.length) sections.push(`Package Manager: ${packageManagers.join(", ")}`);
      if (entryPoints.length) sections.push(`Entry Points: ${entryPoints.join(", ")}`);
      sections.push(`\nStructure:\n${structureLines.join("\n")}`);

      return {
        toolCallId: "",
        content: sections.join("\n"),
        isError: false,
        title: `Overview: ${path.basename(targetDir)}`,
        metadata: { ecosystems, packageManagers, entryPoints },
      };
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/tools/repo-overview.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/repo-overview.ts tests/unit/tools/repo-overview.test.ts
git commit -m "feat: add repo_overview tool with ecosystem detection"
```
