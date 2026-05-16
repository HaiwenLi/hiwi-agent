### Task 11: Environment Context

**Files:**
- Create: `src/core/prompt/environment.ts`
- Test: `tests/unit/core/prompt/environment.test.ts`

**Context:** Generates a text block with working directory, platform, date, and git branch. Injected as the second layer of the system prompt.

---

**Step 1: Write the failing tests**

Create `tests/unit/core/prompt/environment.test.ts`:

```typescript
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    // Should not throw, may or may not include branch
    expect(typeof ctx).toBe("string");
    expect(ctx.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/core/prompt/environment.test.ts`
Expected: FAIL — module not found

**Step 3: Implement buildEnvironmentContext**

Create `src/core/prompt/environment.ts`:

```typescript
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

interface EnvironmentOptions {
  workingDirectory: string;
}

export function buildEnvironmentContext(options: EnvironmentOptions): string {
  const { workingDirectory } = options;
  const platform = process.platform;
  const date = new Date().toISOString().split("T")[0];
  const shell = process.env.SHELL ?? (platform === "win32" ? "cmd" : "/bin/bash");
  const homeDir = os.homedir();

  const lines: string[] = [
    `Working directory: ${workingDirectory}`,
    `Platform: ${platform}`,
    `Shell: ${shell}`,
    `Date: ${date}`,
    `Home: ${homeDir}`,
  ];

  // Try to get git branch
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: workingDirectory,
      encoding: "utf-8",
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (branch) {
      lines.push(`Git branch: ${branch}`);
    }
  } catch {
    // Not a git repo or git not available
  }

  return lines.join("\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/unit/core/prompt/environment.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/prompt/environment.ts tests/unit/core/prompt/environment.test.ts
git commit -m "feat: add environment context builder for system prompt"
```
