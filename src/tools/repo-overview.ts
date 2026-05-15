import { promises as fs } from "node:fs";
import path from "node:path";
import type { Tool, ToolContext, ToolResult } from "../types.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "__pycache__",
  ".next",
  ".nuxt",
  "dist",
  "build",
  ".cache",
  ".turbo",
  "target",
  "vendor",
  ".venv",
  "venv",
  "env",
  ".env",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "coverage",
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
  currentDepth: number,
  maxDepth: number,
  lines: string[],
  limit: number,
): Promise<void> {
  // currentDepth starts at 0 for top-level entries
  // maxDepth=N means show N levels: depth 0..N-1
  // So we stop recursing when currentDepth >= maxDepth
  if (lines.length >= limit) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Filter out ignored directories
  const filtered = entries.filter((e) => !IGNORED_DIRS.has(e.name));

  // Sort: directories first, then files, alphabetically within each group
  filtered.sort((a, b) => {
    const aDir = a.isDirectory() ? 0 : 1;
    const bDir = b.isDirectory() ? 0 : 1;
    if (aDir !== bDir) return aDir - bDir;
    return a.name.localeCompare(b.name);
  });

  for (const entry of filtered) {
    if (lines.length >= limit) return;

    if (entry.isDirectory()) {
      lines.push(`${prefix}${entry.name}/`);
      // Only recurse if we haven't reached max depth
      if (currentDepth + 1 < maxDepth) {
        await buildStructure(
          path.join(dir, entry.name),
          `${prefix}  `,
          currentDepth + 1,
          maxDepth,
          lines,
          limit,
        );
      }
    } else {
      lines.push(`${prefix}${entry.name}`);
    }
  }
}

export function createRepoOverviewTool(): Tool {
  return {
    name: "repo_overview",
    description:
      "Provides an overview of a repository including detected ecosystems, package managers, entry points, and directory structure.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to the repository directory (defaults to workingDirectory)",
        },
        depth: {
          type: "number",
          description:
            "Maximum depth for directory structure display (default: 3)",
        },
      },
    },
    capabilities: ["ReadOnly"],

    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const { path: inputPath, depth: inputDepth } = input as {
        path?: string;
        depth?: number;
      };

      const depth = inputDepth ?? 3;
      const targetPath = inputPath
        ? path.resolve(ctx.workingDirectory, inputPath)
        : ctx.workingDirectory;

      // Check if directory exists
      try {
        const stat = await fs.stat(targetPath);
        if (!stat.isDirectory()) {
          return {
            toolCallId: "",
            content: `Path is not a directory: ${targetPath}`,
            isError: true,
          };
        }
      } catch {
        return {
          toolCallId: "",
          content: `Directory not found: ${targetPath}`,
          isError: true,
        };
      }

      // Read top-level files for ecosystem detection
      const topEntries = await fs.readdir(targetPath, { withFileTypes: true });
      const topFileNames = new Set(
        topEntries.filter((e) => e.isFile()).map((e) => e.name),
      );

      // Detect ecosystems
      const ecosystems: string[] = [];
      for (const [file, ecosystem] of Object.entries(ECOSYSTEM_FILES)) {
        if (topFileNames.has(file) && !ecosystems.includes(ecosystem)) {
          ecosystems.push(ecosystem);
        }
      }

      // Detect package managers
      const packageManagers: string[] = [];
      for (const [file, manager] of Object.entries(LOCK_FILES)) {
        if (topFileNames.has(file)) {
          packageManagers.push(manager);
        }
      }

      // Read package.json for entry points
      const entryPoints: string[] = [];
      if (topFileNames.has("package.json")) {
        try {
          const pkgContent = await fs.readFile(
            path.join(targetPath, "package.json"),
            "utf-8",
          );
          const pkg = JSON.parse(pkgContent) as Record<string, unknown>;

          if (typeof pkg.main === "string") entryPoints.push(pkg.main);
          if (typeof pkg.module === "string") entryPoints.push(pkg.module);

          if (typeof pkg.bin === "string") {
            entryPoints.push(pkg.bin);
          } else if (typeof pkg.bin === "object" && pkg.bin !== null) {
            for (const val of Object.values(
              pkg.bin as Record<string, string>,
            )) {
              entryPoints.push(val);
            }
          }

          if (
            typeof pkg.exports === "object" &&
            pkg.exports !== null
          ) {
            for (const key of Object.keys(
              pkg.exports as Record<string, unknown>,
            )) {
              if (key.startsWith(".")) {
                const exportVal = (pkg.exports as Record<string, unknown>)[key];
                if (typeof exportVal === "string") {
                  entryPoints.push(exportVal);
                } else if (typeof exportVal === "object" && exportVal !== null) {
                  for (const subVal of Object.values(
                    exportVal as Record<string, string>,
                  )) {
                    if (typeof subVal === "string") {
                      entryPoints.push(subVal);
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Invalid package.json, skip entry point detection
        }
      }

      // Build directory structure
      const structureLines: string[] = [];
      await buildStructure(
        targetPath,
        "",
        0,
        depth,
        structureLines,
        STRUCTURE_LIMIT,
      );

      // Assemble output
      const sections: string[] = [];

      sections.push(
        `Ecosystems: ${ecosystems.length > 0 ? ecosystems.join(", ") : "None detected"}`,
      );

      if (packageManagers.length > 0) {
        sections.push(`Package Manager: ${packageManagers.join(", ")}`);
      }

      if (entryPoints.length > 0) {
        const unique = [...new Set(entryPoints)];
        sections.push(`Entry Points: ${unique.join(", ")}`);
      }

      sections.push("Structure:");
      sections.push(...structureLines);

      return {
        toolCallId: "",
        content: sections.join("\n"),
        isError: false,
        title: `Repo Overview: ${path.basename(targetPath)}`,
      };
    },
  };
}
