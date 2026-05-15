import path from "node:path";
import type { ServerConfig } from "./types.js";

export const SERVERS: ServerConfig[] = [
  {
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  {
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py", ".pyi"],
  },
  {
    command: "gopls",
    args: [],
    extensions: [".go"],
  },
  {
    command: "rust-analyzer",
    args: [],
    extensions: [".rs"],
  },
  {
    command: "vscode-css-language-server",
    args: ["--stdio"],
    extensions: [".css", ".scss", ".less"],
  },
  {
    command: "vscode-html-language-server",
    args: ["--stdio"],
    extensions: [".html", ".htm"],
  },
  {
    command: "vscode-json-language-server",
    args: ["--stdio"],
    extensions: [".json"],
  },
];

// Build extension lookup map
const extensionMap = new Map<string, ServerConfig>();
for (const server of SERVERS) {
  for (const ext of server.extensions) {
    extensionMap.set(ext, server);
  }
}

/**
 * Find the LSP server config for a file based on its extension.
 */
export function getServerForFile(filePath: string): ServerConfig | undefined {
  const ext = path.extname(filePath);
  return extensionMap.get(ext);
}

/**
 * Return all registered server configs.
 */
export function getAllServers(): ServerConfig[] {
  return SERVERS;
}
