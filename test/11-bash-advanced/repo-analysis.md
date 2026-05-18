# 代码仓库分析报告

生成时间: 2026-05-16 12:35:38

## 文件统计

| 子目录 | 文件数 | 总行数 |
|--------|--------|--------|
| adapters | 9 | 1451 |
| agentfs | 5 | 869 |
| cli | 3 | 657 |
| core | 7 | 800 |
| mcp | 3 | 451 |
| memory | 10 | 1536 |
| skills | 7 | 621 |
| tools | 39 | 4515 |

## 测试覆盖率扫描

以下文件没有对应的测试:
- src/adapters/anthropic.ts
- src/adapters/connection-test.ts
- src/adapters/minimax.ts
- src/adapters/mock.ts
- src/adapters/model-catalog.ts
- src/adapters/ollama.ts
- src/adapters/openai-compat.ts
- src/adapters/registry.ts
- src/adapters/zhipu.ts
- src/agentfs/audit-trail.ts
- src/agentfs/index.ts
- src/agentfs/kv-store.ts
- src/agentfs/schema.ts
- src/agentfs/virtual-fs.ts
- src/cli/commands.ts
- src/cli/index.ts
- src/cli/repl.ts
- src/core/agent.ts
- src/core/config.ts
- src/core/todo-store.ts
- src/core/tools.ts
- src/mcp/server.ts
- src/mcp/sse-transport.ts
- src/mcp/tools.ts
- src/memory/auto-extract.ts
- src/memory/compaction.ts
- src/memory/entity-link.ts
- src/memory/file-store.ts
- src/memory/knowledge-base.ts
- src/memory/manager.ts
- src/memory/mem0-client.ts
- src/memory/session-summary.ts
- src/memory/session.ts
- src/memory/user-profile.ts
- src/skills/composer.ts
- src/skills/executor.ts
- src/skills/importer.ts
- src/skills/loader.ts
- src/skills/meta-executor.ts
- src/skills/packager.ts
- src/skills/registry.ts
- src/tools/academic-search.ts
- src/tools/agentfs-tools.ts
- src/tools/apply-patch.ts
- src/tools/bash.ts
- src/tools/code-search.ts
- src/tools/edit-tool.ts
- src/tools/git.ts
- src/tools/glob.ts
- src/tools/grep.ts
- src/tools/index.ts
- src/tools/lsp.ts
- src/tools/memory-tools.ts
- src/tools/question.ts
- src/tools/read.ts
- src/tools/repo-overview.ts
- src/tools/skill-tools.ts
- src/tools/subagent.ts
- src/tools/task.ts
- src/tools/todo.ts
- src/tools/truncation.ts
- src/tools/web-fetch.ts
- src/tools/web-search.ts
- src/tools/write.ts


## 函数签名

### anthropic.ts
```
```

### connection-test.ts
```
async function testConnection(
```

### minimax.ts
```
```

### mock.ts
```
```

### model-catalog.ts
```
function buildCatalog(
```

### ollama.ts
```
```

### openai-compat.ts
```
```

### registry.ts
```
```

### zhipu.ts
```
```

### audit-trail.ts
```
```

### index.ts
```
```

### kv-store.ts
```
```

### schema.ts
```
```

### virtual-fs.ts
```
```

### commands.ts
```
```

### index.ts
```
async function main(options: CLIOptions = {}): Promise<void> {
```

### repl.ts
```
```

### agent.ts
```
```

### config.ts
```
function resolveApiKey(value: string | undefined): string | undefined {
function resolveConfig(config: AgentConfig): AgentConfig {
async function loadConfig(
async function saveModelSelection(
async function saveProviderConfig(
```

### todo-store.ts
```
```

### tools.ts
```
```

### server.ts
```
```

### sse-transport.ts
```
```

### tools.ts
```
function createMCPTools(ctx: MCPToolContext): MCPTool[] {
```

### auto-extract.ts
```
```

### compaction.ts
```
function estimateTokens(text: string): number {
function shouldCompact(
function pruneToolOutputs(
```

### entity-link.ts
```
```

### file-store.ts
```
```

### knowledge-base.ts
```
```

### manager.ts
```
```

### mem0-client.ts
```
```

### session-summary.ts
```
```

### session.ts
```
```

### user-profile.ts
```
```

### composer.ts
```
```

### executor.ts
```
```

### importer.ts
```
```

### loader.ts
```
```

### meta-executor.ts
```
```

### packager.ts
```
```

### registry.ts
```
```

### academic-search.ts
```
function createAcademicSearchTool(): Tool {
```

### agentfs-tools.ts
```
function createAgentFSTools(agentfs: AgentFS): Tool[] {
```

### apply-patch.ts
```
function createApplyPatchTool(): Tool {
```

### bash.ts
```
function createBashTool(truncationDir?: string): Tool {
```

### code-search.ts
```
function createCodeSearchTool(): Tool {
```

### edit-tool.ts
```
function createEditTool(): Tool {
```

### git.ts
```
function parseGitStatus(output: string): GitStatus {
function parseGitLog(output: string): GitLogEntry[] {
function createGitTool(): Tool {
```

### glob.ts
```
function createGlobTool(): Tool {
```

### grep.ts
```
function createGrepTool(): Tool {
```

### index.ts
```
function registerCoreTools(registry: ToolRegistry): void {
function registerExtraTools(registry: ToolRegistry): void {
function registerAgentTools(
function registerAgentFSTools(registry: ToolRegistry, agentfs: AgentFS): void {
```

### lsp.ts
```
function createLspTool(): Tool {
```

### memory-tools.ts
```
function createMemorySearchTool(memoryManager: MemoryManager): Tool {
function createMemoryAddTool(memoryManager: MemoryManager): Tool {
function createMemoryGetContextTool(memoryManager: MemoryManager): Tool {
function createMemoryForgetTool(memoryManager: MemoryManager): Tool {
```

### question.ts
```
function createQuestionTool(): Tool {
```

### read.ts
```
function createReadTool(): Tool {
```

### repo-overview.ts
```
function createRepoOverviewTool(): Tool {
```

### skill-tools.ts
```
function createSkillExecuteTool(
function createSkillListTool(skillRegistry: SkillRegistry): Tool {
```

### subagent.ts
```
function createSubagentTool(deps: SubagentDeps): Tool {
```

### task.ts
```
function createTaskTool(): Tool {
```

### todo.ts
```
function createTodoTool(): Tool {
```

### truncation.ts
```
```

### web-fetch.ts
```
function convertHTMLToMarkdown(html: string): string {
function extractTextFromHTML(html: string): string {
function createWebFetchTool(): Tool {
```

### web-search.ts
```
function formatSearchResults(results: SearchResult[]): string {
function createWebSearchTool(): Tool {
```

### write.ts
```
function createWriteTool(): Tool {
```

## 依赖分析

| 模块 | 引用次数 |
|------|----------|

---
报告生成完毕。
