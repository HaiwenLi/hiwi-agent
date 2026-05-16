import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "cli/index": "src/cli/index.ts",
  },
  format: ["esm"],
  target: "node20",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: { entry: "src/index.ts" },
  external: ["mem0ai", "mem0ai/oss"],
  banner: {
    js: "// hiwi-agent",
  },
});
