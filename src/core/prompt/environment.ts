import { execSync } from "node:child_process";
import os from "node:os";

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
