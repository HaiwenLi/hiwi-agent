# hiwi-agent

Personal AI agent with persistent memory, multi-model support, and reusable skills. A TypeScript CLI agent designed to solve memory fragmentation and workflow repetition across AI tools.

## Features

- **Hybrid Memory** — MEMORY.md index + mem0 semantic search with local Ollama embeddings
- **Multi-Provider** — DeepSeek, OpenAI, Anthropic, Kimi, Zhipu (GLM), MiniMax, Ollama via dedicated adapters with thinking/reasoning, structured JSON output, and tool_choice
- **Vision Support** — Multimodal image input via `ContentPart[]` message format, `read_image` tool with base64 encoding, and content-parts injection pipeline from tool results to model
- **Skill System** — Markdown-based SKILL.md files with frontmatter, supports domain/workflow/meta skill types
- **Terminal UI** — pi-based differential rendering engine with animated thinking loader, streaming markdown output, reasoning display (collapsible), slash-command popup, and token usage status bar
- **MCP Server** — Can run as an MCP server (stdio or SSE) for other agents to connect
- **21+ Built-in Tools** — File ops, search, git, web, LSP, subagent, academic search, image reading, and more
- **Permission Model** — Normal (ask before destructive), Auto (auto-approve read-only), YOLO (auto-approve all)
- **Context Compaction** — Automatic token management with LLM-generated summaries when approaching limits

## Quick Start

```bash
# Install
pnpm install
pnpm build

# Configure
cp config/default.json ~/.hiwi-agent/config.json
# Edit ~/.hiwi-agent/config.json with your API keys

# Run interactive REPL
pnpm start
# or
hiwi-agent
```

### Prerequisites

- Node.js >= 20
- pnpm
- [Ollama](https://ollama.ai) (for local memory embeddings)

### Install Ollama Embedding Model (for Memory)

```bash
# Pull the embedding model used by mem0
ollama pull nomic-embed-text

# Or use bge-m3 for higher quality
ollama pull bge-m3
```

## Configuration

Configuration is loaded from two locations, merged left-to-right:

1. `~/.hiwi-agent/config.json` — Global user config
2. `<project>/.agent/config.json` — Project-level overrides

### Example Config

```json
{
  "activeProvider": "anthropic",
  "activeModel": "claude-sonnet-4-6",
  "providers": {
    "anthropic": { "apiKey": "env:ANTHROPIC_API_KEY" },
    "openai": { "apiKey": "env:OPENAI_API_KEY" },
    "deepseek": {
      "apiKey": "env:DEEPSEEK_API_KEY",
      "baseUrl": "https://api.deepseek.com"
    },
    "ollama": { "baseUrl": "http://localhost:11434" },
    "zhipu": {
      "apiKey": "env:ZHIPU_API_KEY",
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4"
    },
    "kimi": {
      "apiKey": "env:MOONSHOT_API_KEY",
      "baseUrl": "https://api.moonshot.cn/v1"
    },
    "minimax": {
      "apiKey": "env:MINIMAX_API_KEY",
      "baseUrl": "https://api.minimax.chat/v1"
    },
    "mem0": {
      "oss": {
        "embedder": {
          "provider": "ollama",
          "config": {
            "model": "nomic-embed-text",
            "url": "http://localhost:11434",
            "embeddingDims": 768
          }
        },
        "vectorStore": {
          "provider": "memory",
          "config": {
            "collectionName": "hiwi_memories",
            "dimension": 768
          }
        }
      }
    }
  },
  "agent": {
    "maxLoops": 50,
    "maxOutputTokensPerTurn": 4096,
    "budgetTotal": 50,
    "refundableTools": ["read_file", "glob", "grep", "web_search"],
    "streaming": true,
    "interruptible": true,
    "thinkingEffort": "high"
  }
}
```

API keys use `env:VAR_NAME` syntax and resolve from environment variables at runtime.

## Usage

```bash
hiwi-agent              # Interactive TUI REPL
hiwi-agent --yolo       # YOLO mode (auto-approve all tools)
hiwi-agent --pipe       # Pipe mode (no TUI, stdin/stdout I/O)
hiwi-agent --mcp        # MCP server mode (stdio)
hiwi-agent --mcp --port 3000  # MCP server mode (SSE)
hiwi-agent --debug      # Debug logging (raw API chunks)
```

### REPL Commands

| Command | Description |
|---------|-------------|
| `/model <id>` | Set or show active model |
| `/provider <name>` | Set or show active provider |
| `/models` | List available models |
| `/effort <low\|medium\|high\|max>` | Set thinking effort for current model |
| `/remember <name>: <content>` | Save a memory |
| `/recall <query>` | Semantic search across memories |
| `/forget <name>` | Delete a memory |
| `/skills` | List loaded skills |
| `/sessions` | List sessions with IDs |
| `/sessions delete <id>` | Delete a session and its messages |
| `/yolo` | Toggle YOLO permission mode |
| `/test <provider?>` | Test connection to provider |
| `/new` | Start a new session |
| `/help` | Show commands |
| `/exit` or `/quit` | Exit REPL |

The slash-command popup (activated by typing `/`) provides autocomplete and discovery for all registered commands.

### MCP Server

Add to Claude Code's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "hiwi-agent": {
      "command": "hiwi-agent",
      "args": ["--mcp"]
    }
  }
}
```

## Streaming & Thinking

The TUI supports real-time streaming with visual separation of thinking and model output:

- **Streaming markdown** — Model output is rendered incrementally via `onStreamChunk` with full markdown parsing
- **Thinking display** — Reasoning content shown in italic dim style, collapsible with `Ctrl+O`
- **Output fold** — Assistant responses >50 rendered lines auto-fold to 15-line preview. First `Ctrl+O` expands the most recent folded output, subsequent toggles thinking panel
- **Animated loader** — Braille spinner during thinking phases
- **Thinking effort** — Configurable via `/effort` command (low/medium/high/max) or `thinkingEffort` in config. Shown in status bar as `[effort]`
- **Default thinking** — Automatically enabled for DeepSeek and Kimi K2.x models. DeepSeek defaults to `reasoning_effort: "high"`
- **Multi-turn reasoning** — `reasoning_content` is persisted across turns and passed back to DeepSeek API (required to avoid 400 errors)
- **Token tracking** — Input/output token counts with context window percentage in the status bar. Falls back to content-length estimation when the API doesn't return usage in streaming mode. Cache read/write tokens tracked for DeepSeek and Anthropic
- **Adapter support** — All adapters emit `reasoning-delta` events:

| Adapter | Reasoning Mechanism |
|---------|-------------------|
| DeepSeek | `reasoning_content` in delta + `<think>` XML tag parsing + `extra_body.thinking` |
| OpenAI | Standard chat completions (no reasoning) |
| Anthropic | `thinking_delta` SDK event |
| Kimi (openai-compat) | `reasoning_content` in delta + `extra_body.thinking` with `keep:all` |
| Zhipu (GLM) | `reasoning_content` in delta |
| MiniMax | `reasoning_content` in delta + `<think>` XML tag parsing |
| Ollama | `reasoning_content` in message/delta |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit input |
| `Esc` | Pause running agent (during processing) |
| `Ctrl+O` | Toggle: expand folded output → toggle thinking panel |
| `Tab` | Select next popup suggestion |
| `↑` / `↓` | Navigate popup (slash commands) |
| `/` | Activate slash-command popup |

## Structured Output

All adapters support OpenAI-compatible `response_format` and `tool_choice` parameters:

- **JSON mode** — Set `response_format: { type: "json_object" }` in `ChatOptions`. Supported by DeepSeek, Kimi (object-only), Zhipu (glm-4.7+), and Anthropic
- **Strict tool mode** — DeepSeek Beta supports `strict: true` on tool function definitions with JSON Schema enforcement (`base_url` must point to `https://api.deepseek.com/beta`)
- **Tool choice** — Control tool invocation with `tool_choice`: `"auto"`, `"none"`, `"required"`, or specific function. Anthropic uses translated enum (`"any"`/`"tool"`)

See [docs/model_comparison.md](docs/model_comparison.md) for the full provider capability matrix and known quirks.

## Vision (Multimodal)

Vision-capable models can process images via the `read_image` tool or programmatic `ContentPart[]` injection:

- **Content parts** — `Message.content` supports `string | ContentPart[]` where `ContentPart` is `{ type: "text", text } | { type: "image_url", image_url: { url, detail? } }`
- **read_image tool** — Reads image files from disk, detects MIME type, encodes as base64 data URL, and returns content parts for the next model turn via `ToolResult.contentParts`
- **Content bridge** — When a `ToolResult` includes `contentParts`, the agent loop pushes a `tool` message (for API compliance) followed by a `user` message with the content parts, enabling the vision model to "see" the image
- **Adapter formats** — OpenAI-compat providers use `image_url` content parts; Anthropic translates to `{ type: "image", source: { type: "base64", media_type, data } }`; Ollama collects image data into the `images` array

## Memory System

Hybrid architecture combining a hand-editable Markdown index with vector-based semantic search:

- **MEMORY.md** — Categorized index (200-line cap) stored as frontmatter markdown files
- **mem0** — Self-hosted OSS mode with Ollama embeddings and in-memory vector store
- **Auto-extraction** — LLM-driven fact extraction from conversations
- **Entity linking** — Cross-reference memories about the same entities
- **Session summaries** — Auto-generated at session end
- **Context compaction** — Automatic compression of older context when approaching token limits

## Built-in Tools

| Category | Tools |
|----------|-------|
| **File** | read, write, edit (5 strategies), apply_patch |
| **Search** | glob, grep, code_search (tree-sitter), LSP |
| **Execution** | bash, task, subagent |
| **Web** | web_search, web_fetch, academic_search |
| **Git** | git, repo_overview |
| **Vision** | read_image (file → base64 → content parts) |
| **Memory** | memory_search, memory_add, memory_get_context, memory_forget |
| **Skills** | skill_execute, skill_list |
| **Other** | question, todo |

## Project Structure

```
hiwi-agent/
├── src/
│   ├── core/           # Agent loop, tool registry, config
│   ├── adapters/       # Dedicated adapters per provider
│   │                   #   DeepSeek (thinking defaults), OpenAI, Anthropic,
│   │                   #   OpenAI-compat (Kimi/abab), Zhipu, MiniMax, Ollama, Mock
│   ├── memory/         # MEMORY.md, mem0, compaction, auto-extraction
│   ├── skills/         # SKILL.md loader, executor, composer, importer
│   ├── tools/          # 21+ built-in tools (including read_image)
│   ├── mcp/            # MCP server (stdio + SSE)
│   ├── tui/            # Pi TUI engine — differential rendering
│   │   ├── components/ # Loader (animated spinner), Text (word-wrapping),
│   │   │               #   Markdown (full renderer)
│   │   ├── tui.ts      # TUI core (render loop, overlays, input routing)
│   │   ├── utils.ts    # ANSI-aware text utilities
│   │   └── keys.ts     # Keyboard input handling (Kitty protocol)
│   └── cli/            # Terminal UI (ChatComponent), REPL, commands, pipe mode
├── docs/                # Documentation (model_comparison.md)
├── skills/              # Built-in skills (paper-search, code-review)
├── config/              # Default configuration
└── tests/               # 81 test files, 683 tests (unit + integration)
```

## Development

```bash
pnpm dev                # Watch mode build
pnpm test               # Run tests
pnpm test:watch         # Watch mode tests
pnpm test:coverage      # Coverage report
pnpm lint               # Biome lint
pnpm typecheck          # TypeScript check
pnpm check              # Lint + typecheck + test
```

## Built-in Skills

Skills are SKILL.md files with frontmatter, discovered from multiple search paths:

- `~/.hiwi-agent/skills/`
- `<project>/skills/`
- `<project>/.agent/skills/`
- `<project>/.opencode/skills/` (OpenCode compatibility)
- `<project>/.claude/skills/` (Claude Code compatibility)

Two built-in skills:
- **paper-search** — Academic paper search via Semantic Scholar and arXiv
- **code-review** — Code review with file analysis and grep

## License

MIT
