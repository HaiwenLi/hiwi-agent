# Personal Agent Architecture Design

**Date:** 2026-05-13
**Version:** v1.0
**Status:** Approved (brainstorming complete)

---

## 1. Overview

Build a personal AI workflow infrastructure that solves cross-tool "memory fragmentation" and "workflow repetition" problems. A TypeScript CLI agent with persistent memory, multi-model support, reusable skills, and MCP server mode.

### Problems Solved

| Problem | Description |
|---------|-------------|
| Memory fragmentation | Every conversation starts from scratch across different AI tools |
| Workflow repetition | Same prompt patterns (paper search, code review) recreated daily |
| Tool switching | Switching between Claude/OpenCode/DeepSeek loses context |
| Static model binding | Different tasks need different models, fixed binding is too rigid |

### Reference Agents Surveyed

| Agent | Language | Key Takeaway |
|-------|----------|--------------|
| OpenCode | TypeScript/Effect-ts | Provider-agnostic LLM, SQLite persistence, SKILL.md discovery |
| RD-Agent | Python/Pydantic | LiteLLM multi-backend, R&D loop, knowledge self-generation |
| DeepSeek TUI | Rust/ratatui | Workspace crates, ModelRegistry fallback, side-git snapshots |
| Claude Code | TypeScript/React-Ink | Tool orchestration, hook system, MEMORY.md + context compaction |
| mem0 | Python + TypeScript | Semantic memory, auto-extraction, entity linking, self-hosted |

---

## 2. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tech stack | TypeScript + Node.js | Richest LLM SDK ecosystem, type safety, matches Claude Code/OpenCode |
| Architecture | Modular Monolith | Fastest to MVP, proven by Claude Code at production scale |
| Memory | Hybrid: MEMORY.md + mem0 | Hand-editable index + semantic search with auto-extraction |
| Skills | SKILL.md (Markdown + frontmatter) | Simple to author, compatible with Claude Code/OpenCode skill dirs |
| Model selection | Manual (`/model`, `/provider`) | Predictable, no routing complexity |
| Interface | CLI/TUI + MCP server | CLI for daily use, MCP for other agents to connect |
| Providers | 7 providers (4 int'l + 3 Chinese) | OpenAI-compatible adapter covers most Chinese providers |

---

## 3. Memory System

### Architecture: Hybrid (MEMORY.md + mem0)

```
~/.hiwi-agent/
├── MEMORY.md                     # Index file (cap: 200 lines / 25KB)
├── memory/
│   ├── user-profile.md           # Who you are, preferences, expertise
│   ├── projects/
│   │   ├── agent-design.md       # Per-project context & decisions
│   │   └── _index.md             # Project registry
│   ├── knowledge/
│   │   ├── papers.md             # Domain knowledge accumulated
│   │   └── patterns.md           # Recurring patterns & learnings
│   └── sessions/
│       └── 2026-05-13.md         # Today's session summary (auto-generated)
├── skills/                       # SKILL.md files
└── config.json                   # Agent configuration
```

### Memory File Format

```markdown
---
name: agent-design-project
type: project
created: 2026-05-13
updated: 2026-05-13
tags: [agent, architecture, typescript]
---

# Agent Design Project
Building a personal agent with TypeScript...
```

### mem0 Integration

- **TypeScript SDK**: `npm install mem0ai`
- **Self-hosted**: Docker Compose (PostgreSQL + Qdrant + API + Dashboard)
- **Auto-extraction**: LLM-driven fact extraction from conversations
- **Semantic search**: Vector-based with hybrid scoring (semantic + keyword + entity)
- **Entity linking**: Cross-reference memories about same entities

### Context Injection Strategy

- **System prompt**: loads MEMORY.md index + user-profile.md (always)
- **Per-query**: injects relevant project memory + session context (on demand)
- **Compaction**: when approaching token limits, compress older session data into summaries

### Memory Operations

- `remember <content>` — save to memory (user confirms)
- `recall <topic>` — search memory (mem0 semantic search + keyword)
- `forget <topic>` — remove memory entry
- Auto-summarize at session end

---

## 4. Model Adapter Layer

### Interface

```typescript
interface ModelAdapter {
  id: string                    // e.g. "claude-sonnet-4"
  provider: string              // e.g. "anthropic"
  chat(messages, options): Promise<Response>
  stream(messages, options): AsyncIterable<Chunk>
  capabilities: Capabilities    // { tools, vision, maxTokens }
}

class ProviderRegistry {
  setProvider(name, apiKey?): void      // /provider anthropic sk-xxx
  setModel(modelId): void              // /model claude-sonnet-4
  listModels(): ModelInfo[]            // /models
  getActiveAdapter(): ModelAdapter
  testConnection(): Promise<boolean>
}
```

### Supported Providers (Phase 1)

| Provider | SDK/API | Base URL | Models |
|----------|---------|----------|--------|
| Anthropic | `@anthropic-ai/sdk` | api.anthropic.com | Claude family |
| OpenAI | `openai` | api.openai.com | GPT family |
| DeepSeek | OpenAI-compatible | api.deepseek.com | deepseek-v3, deepseek-r1 |
| Ollama | HTTP | localhost:11434 | Llama, Qwen, etc. |
| Zhipu (智谱) | OpenAI-compatible | open.bigmodel.cn | GLM-4-plus, GLM-4-flash |
| Kimi (月之暗面) | OpenAI-compatible | api.moonshot.cn | moonshot-v1 |
| MiniMax | OpenAI-compatible | api.minimax.chat | abab series |

### Key Pattern

A single `OpenAICompatibleAdapter` with configurable `baseUrl` covers DeepSeek, Zhipu, Kimi, and MiniMax. Adding new providers is just a config entry.

### Config

```json
{
  "activeProvider": "anthropic",
  "activeModel": "claude-sonnet-4-6",
  "providers": {
    "anthropic": { "apiKey": "env:ANTHROPIC_API_KEY" },
    "openai": { "apiKey": "env:OPENAI_API_KEY" },
    "deepseek": { "apiKey": "env:DEEPSEEK_API_KEY", "baseUrl": "https://api.deepseek.com" },
    "ollama": { "baseUrl": "http://localhost:11434" },
    "zhipu": { "apiKey": "env:ZHIPU_API_KEY", "baseUrl": "https://open.bigmodel.cn/api/paas/v4" },
    "kimi": { "apiKey": "env:MOONSHOT_API_KEY", "baseUrl": "https://api.moonshot.cn/v1" },
    "minimax": { "apiKey": "env:MINIMAX_API_KEY", "baseUrl": "https://api.minimax.chat/v1" }
  }
}
```

---

## 5. Skill System

### SKILL.md Format

```markdown
---
name: paper-search
version: 1.0.0
type: domain          # domain | workflow | meta
category: research
tools: [web_search, file_write]
description: 检索并分析学术论文
trigger: /paper-search
---

# Paper Search Skill

You are a research paper search specialist.

## Steps
1. Parse the user's research query
2. Search academic databases (Semantic Scholar, arXiv)
3. Summarize top 5 results
4. Save findings to a structured report

## Output Format
...
```

### Discovery Paths (in order)

```
~/.hiwi-agent/skills/       # Global skills
<project>/.agent/skills/        # Project-specific skills
<project>/.opencode/skills/     # OpenCode compatibility
<project>/.claude/skills/       # Claude Code compatibility
```

### Skill Types

| Type | Description | Example |
|------|-------------|---------|
| domain | Single-purpose, fine-grained | paper_search, code_review |
| workflow | Composes multiple domain skills | paper_workflow (search → read → analyze) |
| meta | Operates on the agent itself | memory_manage, tool_router |

### Skill Lifecycle

1. **Discovery** — scan skill directories on startup
2. **Loading** — parse frontmatter, validate required fields
3. **Registration** — register `/command` triggers
4. **Execution** — inject skill prompt into system prompt + execute with specified tools
5. **Sharing** — export as `.skill.md` files (just copy the file)

---

## 6. Built-in Tools

### File Operations

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents with line numbers |
| `write_file` | Write/create files |
| `edit_file` | String replacement editing |
| `apply_patch` | Apply unified diff patches |
| `glob` | Pattern-based file search |
| `grep` | Content search (ripgrep wrapper) |

### Execution

| Tool | Description |
|------|-------------|
| `bash` | Run shell commands with sandboxing |
| `task` | Background task execution |

### Web & Search

| Tool | Description |
|------|-------------|
| `web_search` | Search the web |
| `web_fetch` | Fetch and parse URLs |
| `code_search` | AST-based code search (tree-sitter) |

### Agent Operations

| Tool | Description |
|------|-------------|
| `subagent` | Spawn sub-agents for parallel tasks |
| `skill_execute` | Execute a loaded skill |
| `memory_search` | Search mem0 memories |
| `memory_add` | Store new memories |

### Git & Repo

| Tool | Description |
|------|-------------|
| `git` | Git operations (status, diff, log) |
| `repo_overview` | Analyze repo structure |

### Tool Interface

```typescript
interface Tool {
  name: string
  description: string
  inputSchema: ZodSchema
  outputSchema: ZodSchema
  capabilities: ToolCapability[]  // ReadOnly, WriteFiles, ExecCode, Network
  execute(input, context): Promise<ToolResult>
}

class ToolRegistry {
  register(tool: Tool): void
  get(name: string): Tool
  list(capability?: ToolCapability): Tool[]
  execute(name, input, context, permissions): Promise<ToolResult>
}
```

### Permission Model

| Mode | Behavior |
|------|----------|
| Normal | Ask before destructive operations |
| Auto | Auto-approve read-only, ask for writes |
| YOLO | Auto-approve everything (user explicitly enables) |

---

## 7. MCP Server Mode

### Dual-Mode Operation

```
┌─────────────────────────────────────────────┐
│              Core Engine                     │
│  Memory (mem0 + MEMORY.md)                  │
│  Skills (SKILL.md loader)                   │
│  Model Adapters (multi-provider)            │
│  Tools (built-in)                           │
├──────────┬──────────────────────────────────┤
│ CLI Mode │ MCP Server Mode                  │
│ (Ink)    │ (stdio/SSE transport)            │
└──────────┴──────────────────────────────────┘
```

### MCP-Exposed Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Search memories via mem0 |
| `memory_add` | Add a new memory |
| `memory_get_context` | Get relevant context for a query |
| `skill_list` | List available skills |
| `skill_execute` | Execute a named skill |
| `model_list` | List available models |

### Startup Modes

```bash
hiwi-agent              # CLI mode (default)
hiwi-agent --mcp        # MCP server mode (stdio)
hiwi-agent --mcp --port 3000  # MCP server mode (SSE)
```

### Connecting from Other Agents

```json
// In Claude Code's .claude/settings.json
{
  "mcpServers": {
    "hiwi-agent": {
      "command": "hiwi-agent",
      "args": ["--mcp"]
    }
  }
}
```

---

## 8. Project Structure

```
hiwi-agent/
├── src/
│   ├── core/
│   │   ├── agent.ts           # Agent loop (query → model → tools → response)
│   │   ├── tools.ts           # Tool registry & built-in tools
│   │   └── config.ts          # Config loading & validation
│   ├── memory/
│   │   ├── manager.ts         # Memory orchestrator (mem0 + MEMORY.md)
│   │   ├── file-store.ts      # MEMORY.md index + frontmatter files
│   │   ├── mem0-client.ts     # mem0 SDK integration
│   │   └── compaction.ts      # Context compaction logic
│   ├── adapters/
│   │   ├── base.ts            # ModelAdapter interface
│   │   ├── anthropic.ts       # Claude adapter
│   │   ├── openai-compat.ts   # OpenAI-compatible (GPT, DeepSeek, Zhipu, Kimi, MiniMax)
│   │   ├── ollama.ts          # Ollama adapter
│   │   └── registry.ts        # Provider registry (/model, /provider)
│   ├── skills/
│   │   ├── loader.ts          # SKILL.md discovery & parsing
│   │   ├── executor.ts        # Skill execution engine
│   │   └── registry.ts        # Skill registry (/skills command)
│   ├── mcp/
│   │   ├── server.ts          # MCP server (stdio/SSE)
│   │   └── tools.ts           # MCP-exposed tools
│   ├── cli/
│   │   ├── app.tsx            # Ink-based TUI
│   │   ├── commands.ts        # Slash commands (/model, /provider, /skills, etc.)
│   │   └── repl.ts            # Interactive REPL loop
│   └── tools/
│       ├── file.ts            # File read/write/edit
│       ├── search.ts          # Grep/glob
│       ├── shell.ts           # Shell execution
│       └── web.ts             # Web search/fetch
├── skills/                    # Built-in skills
│   ├── paper-search/SKILL.md
│   └── code-review/SKILL.md
├── memories/                  # Memory storage (runtime)
├── config/
│   └── default.json           # Default configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 9. MVP Roadmap

### Phase 1 (~2-3 weeks)

| Week | Milestone | Deliverable |
|------|-----------|-------------|
| 1a | Core + Adapters | Agent loop, provider adapters, `/model` `/provider` commands |
| 1b | Memory | MEMORY.md + mem0 integration, `remember`/`recall`/`forget` commands |
| 2a | Skills | SKILL.md loader, discovery, `/skills` command, 2-3 built-in skills |
| 2b | CLI + MCP | Ink TUI, slash commands, MCP server mode |

### Phase 2 (after MVP)

- Multi-agent orchestration (master-slave pattern)
- Cascade model routing
- Logging & monitoring
- More built-in tools (LSP integration, repo overview)

### Phase 3 (production)

- Learning-type routing
- Multi-model voting
- User skill editor (visual)
- Skill marketplace

---

## 10. Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Type safety |
| `@anthropic-ai/sdk` | Claude API |
| `openai` | OpenAI-compatible APIs |
| `mem0ai` | Memory management |
| `ink` + `react` | Terminal UI |
| `zod` | Schema validation |
| `commander` | CLI framework |
| `@modelcontextprotocol/sdk` | MCP server |
