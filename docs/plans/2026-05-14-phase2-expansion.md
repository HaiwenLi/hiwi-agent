---
date: 2026-05-14
phase: phase-2-planning
status: ready-to-plan
next: after MVP ships, generate TDD plan for Phase 2 modules
---

# Phase 2 Expansion Plan

Built from analysis of OpenCode source code at `d:\repos\opencode`. Captured after Sprint 1-4 plans complete.

---

## Part A: Provider Expansion

**Source:** `d:\repos\opencode\packages\llm\src\`

### New Providers

| Provider | Protocol | API Endpoint | Priority |
|----------|----------|-------------|----------|
| Google Gemini | Native Gemini API | generativelanguage.googleapis.com/v1beta | High |
| Azure OpenAI | OpenAI-compatible | {resource}.openai.azure.com | High |
| AWS Bedrock | Bedrock Converse | bedrock-runtime.{region}.amazonaws.com | High |
| OpenRouter | OpenAI-compatible | openrouter.ai/api/v1 | High |
| Groq | OpenAI-compatible | api.groq.com/openai/v1 | Medium |
| Cerebras | OpenAI-compatible | api.cerebras.ai/v1 | Medium |
| xAI (Grok) | OpenAI-compatible | api.x.ai/v1 | Medium |
| TogetherAI | OpenAI-compatible | api.together.xyz/v1 | Medium |
| Cloudflare | OpenAI-compatible | api.cloudflare.com/client/v4 | Medium |
| GitHub Copilot | Custom Copilot API | api.githubcopilot.com | Low |
| DeepInfra | OpenAI-compatible | api.deepinfra.com/v1 | Low |
| Fireworks | OpenAI-compatible | api.fireworks.ai/inference/v1 | Low |

### Architecture: Protocol Abstraction Layer

Refactor adapters to separate protocol from provider (OpenCode pattern):

```
src/adapters/
├── protocols/
│   ├── anthropic-messages.ts    # Anthropic Messages API
│   ├── openai-chat.ts           # OpenAI Chat Completions
│   ├── openai-responses.ts      # OpenAI Responses API (new)
│   ├── openai-compatible.ts     # Generic compat (covers 10+ providers)
│   ├── gemini.ts                # Google Gemini native
│   └── bedrock-converse.ts      # AWS Bedrock Converse
├── providers/
│   ├── anthropic.ts             # Uses anthropic-messages protocol
│   ├── openai.ts                # Uses openai-chat or openai-responses
│   ├── azure.ts                 # Uses openai-chat + Azure auth
│   ├── bedrock.ts               # Uses bedrock-converse + SigV4
│   ├── gemini.ts                # Uses gemini protocol
│   ├── openrouter.ts            # Uses openai-compatible + routing opts
│   ├── groq.ts                  # Uses openai-compatible
│   ├── ollama.ts                # Native HTTP (unchanged)
│   └── ...                      # All other compat providers
└── registry.ts                  # Provider registry (enhanced)
```

### Provider-Specific Options

```typescript
// Anthropic: extended thinking + cache control
providerOptions: {
  anthropic: { thinking: { budget: 10000 } }
}
system: [{ type: "text", text: "...", cache: { type: "ephemeral", ttl: "5m" } }]

// OpenAI: reasoning effort
providerOptions: {
  openai: { reasoningEffort: "medium", textVerbosity: "low" }
}

// Gemini: thinking config
providerOptions: {
  google: { thinkingConfig: { thinkingBudget: 10000, includeThoughts: true } }
}

// OpenRouter: consensus reasoning
providerOptions: {
  openrouter: { reasoning: { type: "consensus" } }
}
```

### Auth Patterns

| Pattern | Providers | Implementation |
|---------|-----------|---------------|
| Bearer token | OpenAI, Anthropic, xAI, Groq | `Authorization: Bearer <key>` |
| API key header | Gemini | `x-goog-api-key: <key>` |
| Custom header | Azure | `api-key: <key>` |
| SigV4 signing | Bedrock | AWS SDK credential chain |
| Env fallback | All | `env:VAR_NAME` → `process.env.VAR_NAME` |

### Prompt Caching

```typescript
interface CacheOptions {
  mode: "auto" | "none";
  tools?: boolean;        // cache tool definitions
  system?: boolean;       // cache system prompt
  messages?: "latest-user" | { tail: number };
  ttlSeconds?: number;    // >=3600 = 1h, else 5m
}
```

---

## Part B: Tool Expansion

**Source:** `D:\repos\opencode\packages\opencode\src\tool\`

### New Tools

| Tool | File | Description | Priority |
|------|------|-------------|----------|
| **LSP** | `src/tools/lsp.ts` | go-to-def, find-references, hover, symbols, call hierarchy | High |
| **repo_overview** | `src/tools/repo-overview.ts` | Ecosystem detection, entrypoints, deps, tree structure | High |
| **repo_clone** | `src/tools/repo-clone.ts` | Clone repos to managed cache for analysis | Medium |
| **question** | `src/tools/question.ts` | Ask user multi-choice questions | Medium |
| **todo** | `src/tools/todo.ts` | Task tracking within a session | Medium |
| **plan** | `src/tools/plan.ts` | Plan mode with agent switching | Low |

### Existing Tool Improvements

#### edit_file → Advanced Edit (9 strategies from OpenCode)

Current: simple `old_string → new_string` replacement.

Target: 9 matching strategies with fallback chain:

```
1. Simple          — exact string match
2. LineTrimmed     — match ignoring leading/trailing whitespace per line
3. BlockAnchor     — match first/last lines as anchors, content in between
4. WhitespaceNorm  — normalize all whitespace before matching
5. Levenshtein     — fuzzy match with distance threshold
6. LineEndingNorm  — normalize CRLF/LF before matching
7. RegexEscape     — treat special chars as literal
8. FuzzyBlock      — block anchor with fuzzy interior
9. MultiFuzzy      — multiple fuzzy matches, pick best

Fallback: exact → fuzzy → block anchor → fail with helpful error
```

Plus:
- File locking to prevent concurrent edit conflicts
- LSP diagnostics check after edit (verify no new errors)

#### bash → Smart Shell (tree-sitter parsing from OpenCode)

Current: direct execution with basic permission check.

Target:
- Tree-sitter parsing of bash/PowerShell/cmd commands
- Extract file paths from commands for permission checking
- Detect dangerous operations: `rm -rf`, `git push --force`, `DROP TABLE`, etc.
- Environment variable expansion
- Cross-platform path resolution

#### Tool Result Format

Current: `{ toolCallId: string; content: string; isError: boolean }`

Target:
```typescript
interface ToolResult {
  toolCallId: string;
  title?: string;                    // Human-readable title
  metadata?: Record<string, unknown>; // Structured metadata
  output: string;                     // Text output for LLM
  attachments?: Attachment[];         // Images, PDFs, etc.
  isError: boolean;
}
```

#### Output Truncation with Spill-over

```typescript
interface TruncationConfig {
  maxLines?: number;
  maxBytes?: number;
  strategy: "head-tail" | "head-only";
  spillToDisk?: boolean;   // write overflow to temp file
  spillDir?: string;       // temp file directory
}
```

- When output exceeds limits: write to temp file, give LLM a hint to delegate via subagent
- 7-day cleanup of old truncated files
- Head/tail truncation preserving both ends

#### Atomic Multi-File Patches

Enhance `apply_patch` to support:
- Full unified diff format (add/update/delete/move)
- Per-file metadata and diffs
- LSP diagnostics after applying each file
- Atomic: all succeed or all roll back

### LSP Integration Details

```typescript
// src/tools/lsp.ts
type LSPOperation =
  | "definition"        // go-to-definition
  | "references"        // find all references
  | "hover"             // hover information
  | "documentSymbol"    // document symbols
  | "workspaceSymbol"   // workspace-wide symbol search
  | "implementation"    // go-to-implementation
  | "callHierarchy"     // incoming/outgoing calls
```

Requires LSP client connection to running language servers. Auto-detect from project ecosystem (ts_ls for TS, pyright for Python, etc.).

### repo_overview Details

```typescript
// Detects:
- Ecosystem (Node.js, Python, Go, Rust, Java, etc.)
- Package manager (pnpm, npm, yarn, pip, cargo, etc.)
- Entrypoints (main, bin, scripts)
- Dependency files (package.json, requirements.txt, Cargo.toml)
- Project structure tree with depth limits
- Git status (branch, uncommitted changes)
```

---

## Implementation Order (Proposed)

### Phase 2a: Provider Protocol Refactor + New Providers
1. Extract protocol abstraction from existing adapters
2. Implement Gemini native adapter
3. Implement Azure OpenAI adapter
4. Implement OpenRouter adapter
5. Refactor existing OpenAI-compat to use protocol layer
6. Implement Bedrock adapter
7. Add provider-specific options (thinking, caching)

### Phase 2b: Tool Improvements
1. Advanced edit with 9 matching strategies
2. Smart shell with tree-sitter parsing
3. Structured tool results + output truncation
4. Atomic multi-file patches

### Phase 2c: New Tools
1. LSP integration
2. repo_overview
3. question tool
4. todo tool
5. repo_clone

### Phase 2d: Polish
1. Prompt caching across providers
2. Dynamic tool loading / plugin system
3. Tool filtering by model capabilities

---

## Reference Files

### OpenCode LLM (Providers)
- `d:\repos\opencode\packages\llm\src\provider.ts` — Provider interface
- `d:\repos\opencode\packages\llm\src\providers\` — All providers
- `d:\repos\opencode\packages\llm\src\protocols\` — Protocol abstractions

### OpenCode Tools
- `D:\repos\opencode\packages\opencode\src\tool\` — All tool implementations
- `D:\repos\opencode\packages\opencode\src\tool\edit.ts` — 9 edit strategies
- `D:\repos\opencode\packages\opencode\src\tool\shell.ts` — Tree-sitter shell parsing
- `D:\repos\opencode\packages\opencode\src\tool\lsp.ts` — LSP integration
- `D:\repos\opencode\packages\opencode\src\tool\truncate.ts` — Output truncation
- `D:\repos\opencode\packages\opencode\src\tool\repo_overview.ts` — Repo analysis
