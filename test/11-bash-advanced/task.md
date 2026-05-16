# Task: Bash 脚本 — 代码仓库分析

## 目标
编写一个 bash 脚本来分析代码仓库，生成统计报告。

## 要求
在 `11-bash-advanced/` 下创建 `analyze-repo.sh`，实现以下功能：

### 功能 1: 文件统计
- 递归统计 `src/` 目录下所有 `.ts` 文件的数量和总行数
- 按子目录分组输出
- 输出格式为 Markdown 表格

### 功能 2: 测试覆盖率扫描
- 在 `src/` 中查找所有 `.ts` 文件
- 检查 `tests/` 下是否有对应的 `.test.ts` 文件
- 列出没有被测试覆盖的源文件

### 功能 3: 函数签名提取
- 提取 `src/` 下所有 `export function` 和 `export async function` 的签名
- 按文件分组输出
- 输出格式为 Markdown

### 功能 4: 依赖分析
- 检查每个 `.ts` 文件中 `import from` 语句
- 找出引用最多的前 10 个模块
- 输出为排序列表

### 输出
脚本应生成一个 `repo-analysis.md` 文件，包含以上所有内容。

## 验收标准
- [ ] 脚本可运行：`bash test/11-bash-advanced/analyze-repo.sh`
- [ ] 生成了 `repo-analysis.md`
- [ ] Markdown 格式正确
- [ ] 表格对齐正确
- [ ] 不使用第三方工具（只用 bash、grep、awk、sort、find 等标准命令）
