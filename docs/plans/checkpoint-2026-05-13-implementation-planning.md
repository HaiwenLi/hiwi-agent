---
date: 2026-05-14
phase: implementation-planning
status: decisions-closed
next: generate formal implementation plan via writing-plans skill
---

# Implementation Planning Checkpoint

## Decisions Confirmed

### Architecture & Scope
| Topic | Decision |
|-------|----------|
| MVP Scope | Core first, then add-ons (Adapters+AgentLoop → Memory → Skills → MCP) |
| Architecture | Modular Monolith (from design doc) |
| Tech Stack | TypeScript + Node.js LTS |

### Toolchain
| Topic | Decision |
|-------|----------|
| Runtime | Node.js (LTS) |
| Package Manager | pnpm |
| Build | tsup |
| Linting/Formatting | Biome |
| Config Format | JSON/jsonc |
| DI | Manual composition (Claude Code pattern) — interfaces + classes, no framework |
| Error Handling | neverthrow (Result monad) |

### Testing
| Topic | Decision |
|-------|----------|
| Framework | Vitest + Cucumber (@cucumber/cucumber) |
| Approach | TDD + BDD combined |
| TDD scope | Unit tests + Integration tests |
| BDD scope | User scenarios (.feature files) + E2E flows |
| Coverage target | 80%+ |
| Rule | All new code must have tests before implementation (TDD-first) |

### DI Reference
| Repo | Pattern | Our Take |
|------|---------|----------|
| Claude Code | Manual composition, functions/classes, global state | Follow this pattern |
| OpenCode | Effect-ts Layers/Context | Skip (too heavy for MVP) |

## Decisions Resolved

### Implementation Order (Confirmed)
Follow the Sprint 1→4 order as proposed — strict dependency chain:
1. **Core + Adapters** (everything else depends on this)
2. **Memory** (agent loop needs memory for context injection)
3. **Skills** (needs core agent + memory for skill execution)
4. **CLI + MCP** (needs all layers to expose interfaces)

Within Sprint 1, the module order is:
1. Project scaffolding
2. `config.ts` (all modules read config)
3. `base.ts` + `registry.ts` (adapter interfaces before implementations)
4. `anthropic.ts` + `openai-compat.ts` (concrete adapters)
5. `tools.ts` (tool registry, needed by agent loop)
6. `agent.ts` (ties adapters + tools together)

### File Naming Conventions
| Pattern | Rule | Example |
|---------|------|---------|
| Source files | kebab-case | `openai-compat.ts`, `file-store.ts` |
| Test files | kebab-case + `.test` | `openai-compat.test.ts` |
| BDD features | kebab-case | `model-switching.feature` |
| BDD steps | kebab-case + `.steps` | `model.steps.ts` |
| Directories | kebab-case | `src/adapters/`, `src/memory/` |
| Config files | kebab-case | `default.json`, `tsconfig.json` |
| Skill files | UPPER_SNAKE or kebab-case | `SKILL.md` in skill directory |
| Types/Interfaces | PascalCase | `ModelAdapter`, `ToolResult` |
| Classes | PascalCase | `ProviderRegistry`, `ToolRegistry` |
| Functions | camelCase | `loadModel`, `parseSkill` |
| Constants | SCREAMING_SNAKE | `MAX_TOKENS`, `DEFAULT_MODEL` |

### Git Branch Strategy
| Branch | Purpose |
|--------|---------|
| `main` | Stable, deployable code |
| `dev` | Integration branch for sprint work |
| `feat/<module>` | Feature branches (e.g. `feat/adapters`, `feat/memory`) |
| `fix/<issue>` | Bug fixes |

Flow: `feat/*` → PR → `dev` → PR → `main`
For MVP solo development: commit directly to `feat/*`, merge to `dev` when sprint completes.

### CI/CD Pipeline
**GitHub Actions** (minimal for MVP):

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  check:
    - Biome lint + format check
    - TypeScript type check (tsc --noEmit)
    - Vitest unit + integration tests
    - Coverage report (80%+ gate)
  bdd:
    - Cucumber BDD tests
```

No CD for MVP — manual `npm publish` or `pnpm pack` when ready.
Add canary/release pipeline in Phase 2.

### API Key Management
**Environment variables only** for MVP:

| Priority | Source |
|----------|--------|
| 1 (highest) | Runtime env: `ANTHROPIC_API_KEY=xxx` |
| 2 | `.env` file in project root (gitignored) |
| 3 | Config file `config.json` with `env:VAR_NAME` references |

Config format uses `env:` prefix to reference env vars — keys are never stored as plaintext in config:
```json
{ "providers": { "anthropic": { "apiKey": "env:ANTHROPIC_API_KEY" } } }
```

Phase 2 consideration: OS keychain integration via `keytar` for encrypted storage.

## TDD+BDD Structure (Draft)

```
tests/
├── unit/                    # TDD - Vitest
│   ├── adapters/
│   │   ├── anthropic.test.ts
│   │   ├── openai-compat.test.ts
│   │   └── registry.test.ts
│   ├── memory/
│   │   ├── file-store.test.ts
│   │   └── manager.test.ts
│   ├── skills/
│   │   ├── loader.test.ts
│   │   └── executor.test.ts
│   └── tools/
│       ├── file.test.ts
│       └── search.test.ts
├── integration/             # TDD - Vitest
│   ├── agent-loop.test.ts
│   ├── memory-flow.test.ts
│   └── skill-execution.test.ts
├── bdd/                     # BDD - Cucumber
│   ├── features/
│   │   ├── model-switching.feature
│   │   ├── memory-operations.feature
│   │   ├── skill-management.feature
│   │   └── mcp-server.feature
│   └── steps/
│       ├── common.ts
│       ├── model.steps.ts
│       ├── memory.steps.ts
│       └── skill.steps.ts
└── e2e/                     # BDD E2E - Cucumber
    ├── features/
    │   ├── cli-workflow.feature
    │   └── mcp-integration.feature
    └── steps/
        └── e2e.steps.ts
```

## Implementation Order (Proposed)

### Sprint 1: Core Engine + Adapters
1. Project scaffolding (tsconfig, biome, pnpm, vitest, cucumber)
2. `src/core/config.ts` — Config loading with Zod validation
3. `src/adapters/base.ts` — ModelAdapter interface + Tool types
4. `src/adapters/anthropic.ts` — Anthropic adapter
5. `src/adapters/openai-compat.ts` — OpenAI-compatible adapter (covers 5 providers)
6. `src/adapters/registry.ts` — ProviderRegistry
7. `src/core/agent.ts` — Agent loop (query → model → tool → response)
8. `src/core/tools.ts` — ToolRegistry + permission model

### Sprint 2: Memory System
9. `src/memory/file-store.ts` — MEMORY.md index + frontmatter files
10. `src/memory/manager.ts` — Memory orchestrator
11. `src/memory/mem0-client.ts` — mem0 SDK integration
12. `src/memory/compaction.ts` — Context compaction

### Sprint 3: Skills
13. `src/skills/loader.ts` — SKILL.md discovery & parsing
14. `src/skills/registry.ts` — Skill registry
15. `src/skills/executor.ts` — Skill execution engine

### Sprint 4: CLI + MCP
16. `src/cli/commands.ts` — Slash commands
17. `src/cli/app.tsx` — Ink TUI
18. `src/mcp/server.ts` — MCP server (stdio/SSE)
19. `src/mcp/tools.ts` — MCP-exposed tools

## Decisions Added 2026-05-14

### mem0 Deployment
| Topic | Decision |
|-------|----------|
| Mode | Self-hosted Docker (PostgreSQL + Qdrant + API + Dashboard) |
| SDK | mem0ai (TypeScript) |
| Phase 2 | Consider cloud for multi-device sync |

### Session Storage & Recovery
| Topic | Decision |
|-------|----------|
| Storage | SQLite — sessions, messages, summaries 三个表 |
| Recovery | Workspace-bound: 启动时检测当前目录未结束 session → 提示恢复 |
| Commands | `/sessions` 列出, `/resume [id]` 恢复, `/new` 新建 |
| Schema | sessions(id, working_dir, status, created_at, last_active), messages(id, session_id, role, content, tokens, created_at), summaries(id, session_id, content, created_at) |
| 恢复内容 | 压缩摘要作系统上下文 + 最近 N 条完整消息 |

### Context Compaction
| Topic | Decision |
|-------|----------|
| Approach | 增量摘要 (OpenCode 方案) |
| Trigger | 总 token >= context_limit - max_output - reserved(20K) |
| Phase 1 | 裁剪: 截断旧工具输出, 保留最近 N 条工具调用原文 |
| Phase 2 | 摘要: 保留最近 2 轮原文, LLM 将更早消息压缩为结构化摘要 |
| Summary format | Goal / Progress / Decisions / Next Steps / Critical Context / Files |
| Incremental | 新摘要基于旧摘要更新, 不从零生成 |

### AgentLoop Limits
| Topic | Decision |
|-------|----------|
| Max loops | 可配置, 默认 50 |
| Max output tokens per turn | 可配置, 按 model capabilities 取 |

### Skill Bash Isolation
| Topic | Decision |
|-------|----------|
| MVP | 不隔离, 直接执行 |
| Phase 2 | 考虑 sandbox (nsjail/bubblewrap 或 container) |

### TUI Streaming
| Topic | Decision |
|-------|----------|
| Approach | Follow OpenCode pattern: Ink/React, incremental markdown rendering, StreamCommit events |
| Key libs | Ink + React, remend (markdown healing), morphdom (DOM diffing) |
| Buffering | Role-gated: buffer tokens until role confirmed, strip tool echoes |

---

## Agent Loop 设计 (2026-05-14)

### 参考项目对比

#### 基本结构

| 维度 | OpenCode | Hermes-Agent | RD-Agent |
|------|----------|-------------|----------|
| 语言 | TypeScript | Python | Python |
| 循环方式 | 递归 | while-loop | 双层循环（外层 RDLoop + 内层演化） |
| 定位 | 通用 LLM 工具调用循环 | 生产级全功能代理 | 研究流水线（非交互） |
| 核心文件 | `packages/llm/src/tool-runtime.ts` | `run_agent.py` | `components/workflow/rd_loop.py` + `utils/workflow/loop.py` |

#### 工具执行策略

| 维度 | OpenCode | Hermes-Agent | RD-Agent |
|------|----------|-------------|----------|
| 默认策略 | 并行 (concurrency=10) | 混合：智能决策 | 并行 + semaphore 限流 |
| 串行条件 | 无 | 路径冲突、交互工具(terminal/clarify)、never-parallel 列表 | feedback/record 等关键阶段 |
| 并行条件 | 所有工具 | 无冲突 + 非交互 + 多工具同时 | 非关键阶段 |
| 冲突检测 | 无 | 分析工具参数中的文件路径，同文件操作串行 | semaphore 控制 |
| 错误处理 | 工具错误作为 result 喂回 LLM，不中断循环 | 单工具失败不阻断，错误作为 result 返回 | skip/withdraw 两级恢复 |

#### 终止条件

| 条件 | OpenCode | Hermes-Agent | RD-Agent |
|------|----------|-------------|----------|
| 无 tool_calls | ✅ finishReason != "tool-calls" | ✅ assistant 无 tool_calls | — |
| 步数上限 | ✅ stopWhen(stepCountIs(N)) | ✅ max_iterations | ✅ max_loop |
| 预算耗尽 | — | ✅ IterationBudget | ✅ timer timeout |
| 用户中断 | — | ✅ _interrupt_requested | — |
| 质量达标 | — | — | ✅ feedback.finished() / is_acceptable() |
| 护栏拦截 | — | ✅ guardrail_halt | — |
| 空响应恢复 | — | ✅ 3次重试 + nudge + fallback provider | ✅ skip/withdraw error recovery |
| 达上限后行为 | 注入 no-tool prompt 强制纯文本总结 | _handle_max_iterations() 总结 | break 循环 |

#### 流式输出

| 维度 | OpenCode | Hermes-Agent | RD-Agent |
|------|----------|-------------|----------|
| 方式 | Vercel AI SDK streamText | 原生 OpenAI streaming | 非实时（研究场景） |
| 中断支持 | 无 | 可中断 + 90s 超时检测 + 自动重试 | — |
| 推理分离 | 无 | thinking/reasoning 独立回调 | — |
| 事件类型 | text-delta, tool-call, tool-result, step-start/finish | stream_delta, reasoning_delta, tool_gen, progress | — |
| 事件传递 | 事件总线 | 回调函数 | — |
| 陈旧检测 | — | 90s 无新数据视为 stale | — |

#### 特色模式

| 模式 | 来源 | 描述 |
|------|------|------|
| Budget 退款 | Hermes | execute_code 等低成本工具消耗的 iteration 不计入预算，可 refund |
| 空响应恢复 | Hermes | 空响应重试 3 次 + nudge，thinking-only 做 prefill 重试，最终 fallback provider |
| 子代理委派 | Hermes | delegate_task 启动子代理，隔离会话+工具集，父代理阻塞等待结果，禁止递归委派 |
| 知识自生成 | RD-Agent | 每轮循环后从结果中提取知识，存入知识库，下一轮 RAG 检索使用 |
| DAG 追踪 | RD-Agent | 实验历史以 DAG 结构维护，支持回溯到任意检查点继续演化 |
| 增量摘要压缩 | OpenCode | 先裁剪工具输出(>2K截断)，再用 LLM 做结构化增量摘要（Goal/Progress/Decisions/Next Steps/Files） |
| 工具回声剥离 | OpenCode | bash 输出从后续 assistant 文本中移除，避免重复显示 |
| 角色门控缓冲 | OpenCode | 流式 token 缓冲直到 role 确认，防止误显 user role 文本 |
| 规划阶段 | Hermes | planning/ack 消息特殊处理，不触发终止 |
| Memory 提醒 | Hermes | 每 N 轮触发 memory review，每 M 次工具迭代触发 skill improvement nudge |
| 插件钩子 | Hermes | pre_llm_call, pre_tool_call, on_session_start/end, agent:step |

### 推荐方案

定位：**交互式个人代理**，综合三者最佳实践。

#### 循环方式：while-loop (来自 Hermes)

比递归更适合个人代理：
- 易于添加 hook/checkpoint/中断逻辑
- 状态管理直观（iteration count, budget 在循环外层）
- 可读性好，调试方便

#### 工具执行：混合策略 + 冲突检测 (来自 Hermes)

```
shouldParallelize(toolCalls):
  if toolCalls.length <= 1 → serial
  if any tool is interactive (bash with user input) → serial
  extract file paths from write tools
  if any path overlap → serial
  if all ReadOnly → parallel
  else → mixed (reads parallel, writes serial)
```

#### 流式输出：实时事件 + 可中断 (OpenCode + Hermes)

- 流式 token 实时推送到 UI（OpenCode 的 StreamCommit 模式）
- 支持 Ctrl+C 中断（Hermes 的 interrupt 机制）
- 推理模型 thinking 内容独立回调（Hermes）
- 90s 无数据超时检测（Hermes）

#### 终止条件：多条件组合

| 条件 | 实现 |
|------|------|
| 无 tool_calls | finishReason != "tool-calls" |
| 步数上限 | max_loops (默认 50)，达上限注入 no-tool prompt 强制文本总结 |
| 每轮 token 上限 | max_output_tokens_per_turn，按 model capabilities 配置 |
| 预算耗尽 | IterationBudget，低成本工具可 refund |
| 用户中断 | interrupt signal (SIGINT) |
| 权限拒绝 | 工具被权限模型拦截时不执行，结果告知 LLM |

#### 错误处理

| 场景 | 策略 |
|------|------|
| 工具执行失败 | 错误作为 tool result 喂回 LLM，不中断循环 |
| 空响应 | 重试 1 次 + nudge（MVP 简化版，不做 provider fallback） |
| 流式超时 | 90s 无新数据视为 stale，抛错让上层处理 |
| 权限拒绝 | 不执行，返回拒绝原因作为 tool result |

#### 特色模式采纳

| 模式 | 来源 | MVP? |
|------|------|------|
| Budget 退款 | Hermes | ✅ 低成本工具(read_file, glob, grep)不计 iteration |
| 推理分离 | Hermes | ✅ deepseek-r1 等 thinking 独立处理 |
| 角色门控缓冲 | OpenCode | ✅ 防止误显 |
| 工具回声剥离 | OpenCode | ✅ bash 输出去重 |
| 增量摘要压缩 | OpenCode | ✅ Sprint 2 compaction 模块 |
| 空响应恢复 | Hermes | ✅ 简化版：重试 1 次 |
| 知识自生成 | RD-Agent | ✅ 通过 mem0 auto-extraction 实现 |
| 子代理委派 | Hermes | ❌ Phase 2 |
| DAG 追踪 | RD-Agent | ❌ 过度设计 |
| 插件钩子 | Hermes | ❌ Phase 2，但接口预留 |
| Memory 提醒 | Hermes | ❌ Phase 2 |

#### Agent Loop 核心接口

```typescript
interface AgentLoopConfig {
  maxLoops: number                // 默认 50
  maxOutputTokensPerTurn: number  // 按 model capabilities
  budgetTotal: number             // 总 iteration 预算
  refundableTools: string[]       // ['read_file', 'glob', 'grep', 'web_search']
  streaming: boolean
  interruptible: boolean
}

type AgentLoopEventType =
  | 'text-delta'       // 流式文本增量
  | 'reasoning-delta'  // 推理模型 thinking 增量
  | 'tool-call'        // 工具调用开始
  | 'tool-result'      // 工具执行结果
  | 'step-start'       // 新一轮开始
  | 'step-finish'      // 本轮结束
  | 'compaction'       // 触发压缩
  | 'finish'           // 整个 loop 结束
  | 'error'            // 错误

interface AgentLoopEvent {
  type: AgentLoopEventType
  iteration?: number
  text?: string
  toolName?: string
  toolCallId?: string
  toolInput?: unknown
  toolResult?: ToolResult
  finishReason?: 'completed' | 'max-loops' | 'interrupted' | 'error'
  usage?: TokenUsage
}

class AgentLoop {
  private iteration: number
  private budget: IterationBudget
  private interrupted: boolean

  constructor(
    private adapter: ModelAdapter,
    private toolRegistry: ToolRegistry,
    private permissionMode: PermissionMode,
  )

  async *run(messages: Message[], config: AgentLoopConfig): AsyncGenerator<AgentLoopEvent>

  private shouldParallelize(toolCalls: ToolCall[]): 'serial' | 'parallel' | 'mixed'
  private checkPermission(tool: Tool): Promise<boolean>
  private checkCompaction(messages: Message[]): void
  private handleEmptyResponse(attempt: number): { retry: boolean; nudge?: string }
  interrupt(): void
}

class IterationBudget {
  constructor(private total: number, private refundable: Set<string>)
  consume(toolName: string): boolean
  refund(toolName: string): void
  get remaining(): number
}
```

#### Agent Loop 控制流

```
用户消息
    │
    ▼
┌─────────────────────┐
│ 构建初始 request     │ ← system_prompt + memory_context + session_history
└────────┬────────────┘
         │
┌────────▼────────────┐
│ while iteration <    │
│   max_loops AND      │
│   budget.remaining   │
│   AND NOT interrupted│
└────────┬────────────┘
         │
    ┌────▼─────────────┐
    │ adapter.stream()  │ → yield text-delta / reasoning-delta 实时推送到 UI
    │ 可中断 + 超时检测   │
    └────┬─────────────┘
         │
    ┌────▼─────────────┐
    │ finishReason?     │
    └──┬──────────┬─────┘
  no tool     has tool_calls
       │            │
       ▼            ▼
  yield finish  ┌───────────────────────┐
                │ shouldParallelize()   │
                │ 读操作 → 并行           │
                │ 写操作 → 串行           │
                │ 同文件 → 串行           │
                │ 交互工具 → 串行          │
                └──────────┬────────────┘
                           │
                ┌──────────▼────────────┐
                │ 执行工具               │
                │ 权限检查 → 拒绝则返回原因 │
                │ 错误 → 作为 result 喂回  │
                │ refundable → refund()  │
                └──────────┬────────────┘
                           │
                ┌──────────▼────────────┐
                │ 追加到 messages        │
                │ checkCompaction()      │
                │ iteration++            │
                │ budget.consume()       │
                └──────────┬────────────┘
                           │
                ┌──────────▼────────────┐
                │ 达到 max_loops?        │
                └─── YES ─┬── NO ───────┘
                      │          │
            注入 no-tool     继续循环 ↑
            prompt + 总结
                      │
                      ▼
                 yield finish
```

---

## 补充决策 (2026-05-14 第二轮)

### Config 系统

| Topic | Decision |
|-------|----------|
| 全局配置位置 | `~/.hiwi-agent/config.json` |
| 项目级配置位置 | `<project>/.agent/config.json` |
| 优先级 | 环境变量 > 项目级 > 全局（高优先级覆盖低） |
| 热重载 | 不支持。修改后提示 "配置已更新，下次重启生效" |
| 合并策略 | 深层合并，项目级字段覆盖全局同名字段 |

### Session SQLite

| Topic | Decision |
|-------|----------|
| 驱动 | `better-sqlite3` 原生 SQL，不用 ORM |
| DB 位置 | 项目级: `<project>/.agent/session.db` |
| 清理策略 | 不自动清理。用户手动请求时提示确认后再清理 |
| 表结构 | sessions(id TEXT PK, working_dir TEXT, status TEXT, created_at TEXT, last_active TEXT), messages(id INTEGER AUTOINCREMENT, session_id TEXT FK, role TEXT, content TEXT, tokens INTEGER, created_at TEXT), summaries(id INTEGER AUTOINCREMENT, session_id TEXT FK, content TEXT, created_at TEXT) |

### Tool Permission UX

| Topic | Decision |
|-------|----------|
| Normal 模式 | 首次询问，同类工具自动记住（本次会话内） |
| Allowlist 持久化 | 保存在全局 Memory（`~/.hiwi-agent/memory/`）中 |
| YOLO 模式 | `/yolo` 命令切换，切换时需用户确认 |
| 权限数据流 | 首次检查 → 弹出确认 → 记住 → 后续同工具自动通过 |

### Memory 注入

| Topic | Decision |
|-------|----------|
| 系统提示词注入 | MEMORY.md 全文（index 性质，<200行，token 开销可控） |
| 项目记忆加载 | 检测到项目目录时自动加载最新项目记忆文件 |
| 搜索策略 | mem0 + MEMORY.md 合并搜索结果，去重后返回 |
| 搜索合并规则 | 两源结果按相关性排序，相同内容去重，优先 MEMORY.md 原文 |

### Skill 执行

| Topic | Decision |
|-------|----------|
| 与 Agent Loop 关系 | Skill 注入 system prompt 后走标准 Agent Loop |
| 工具权限 | 继承当前 permission mode，无独立权限声明 |
| 失败处理 | 中止 skill 执行，向用户说明错误，fallback 回普通对话模式 |

### 日志与可观测性

| Topic | Decision |
|-------|----------|
| 日志位置 | `~/.hiwi-agent/logs/` |
| 日志级别 | debug / info / warn / error，默认 info |
| Debug 模式 | `--debug` flag 启动时设置日志级别为 debug |
| 日志格式 | JSON structured logging，按日期轮转 |

### 其他

| Topic | Decision |
|-------|----------|
| Ollama 适配器 | Sprint 1 开发（与 OpenAI-compatible 同属 adapter 层） |
| Ctrl+C 中断 | 已输出 token 保留并显示给用户，不丢弃 |
| System prompt 更新 | Compaction 后生成的摘要替换 messages 中的旧摘要，下次请求自动生效 |
| LLM 调用 mock | 固定 fixture mock adapter（不依赖真实 API key，纯单元测试） |
| Adapter 测试 | 纯 mock，不做真实 API 调用 |

### 包名

| Topic | Decision |
|-------|----------|
| Package name | `hiwi-agent` |
