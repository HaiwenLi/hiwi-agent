# hiwi-agent 测试任务集

用于验证 hiwi-agent 各项功能的完整性测试。

## 如何让 hiwi-agent 执行所有测试

**一步启动：**

> 启动 hiwi-agent 后，告诉它一句话：
> **"请按照 test/hiwi-test-kickoff.md 完成全部能力验证测试"**

hiwi-agent 会：
1. 读取 kickoff 文件和 `agent-test-plan.md` 了解全貌
2. 从 Phase 0 开始逐个执行（每个目录的 `task.md` 描述具体任务）
3. 每个 Phase 完成后运行对应的验证命令
4. 全部完成后运行 `npx tsx test/verify.ts` 输出最终报告

**或者手动分阶段：**
```bash
# Phase 1 — Bug 排查
npx vitest run test/05-debugging

# Phase 2 — 快速排序
npx vitest run test/01-quicksort

# ... 各 Phase 独立执行

# 最终验证
npx tsx test/verify.ts
```

## 测试结构

```
test/
├── hiwi-test-kickoff.md             # 🏁 给 hiwi-agent 的入口文件
├── run-hiwi-test.sh                 # 🏁 入口脚本
├── verify.ts                        # 🔍 统一验证脚本
├── README.md                        # 本文件
│
├── 01-quicksort/                        # 算法实现测试
│   ├── task.md                          # 任务描述
│   ├── quicksort.ts                     # 待补全骨架
│   └── quicksort.test.ts                # 13 个用例 (vitest)
│
├── 02-fibonacci/                        # 算法优化测试
│   ├── task.md                          # 四种方法
│   ├── fib.ts                           # 待补全骨架
│   └── fib.test.ts                      # 25 个用例
│
├── 03-responsive-page/                  # 前端开发测试
│   ├── task.md                          # Grid/Flexbox/暗色模式
│   └── src/
│       ├── index.html                   # 页面骨架
│       └── styles.css                   # 样式骨架
│
├── 04-tool-tests/                       # 工具能力测试
│   └── task.md                          # 5 个子任务
│
├── 05-debugging/                        # 🔍 Bug 排查
│   ├── task.md                          # 找 5 个 bug
│   ├── buggy-sort.ts                    # 排序 + 二分查找 bug
│   ├── buggy-async.ts                   # Promise 竞态 bug
│   ├── buggy-sort.test.ts               # 修复后验证
│   └── buggy-async.test.ts              # 修复后验证
│
├── 06-refactoring/                      # 🔄 代码重构
│   ├── task.md                          # 拆分为模块化结构
│   ├── spaghetti.ts                     # 200+ 行面条代码
│   └── spaghetti.test.ts                # 重构兼容性测试
│
├── 07-web-research/                     # 🌐 Web Research
│   └── task.md                          # 搜索 CSS Container Queries
│
├── 08-data-processing/                  # 📊 数据处理
│   ├── task.md                          # 解析 CSV → JSON
│   ├── data.csv                         # 1000 行销售数据
│   └── expected-summary.json            # 输出格式参考
│
├── 09-test-writing/                     # 📝 测试编写
│   ├── task.md                          # 为 8 个函数写测试
│   ├── calculator.ts                    # 计算器模块
│   └── calculator.test.ts               # 空文件等你填充
│
├── 10-multi-file/                       # 📁 多文件协调
│   ├── task.md                          # 抽离验证逻辑
│   ├── utils.ts                         # 混合工具模块
│   ├── user-service.ts                  # 引用验证函数
│   ├── product-service.ts               # 引用验证函数
│   ├── order-service.ts                 # 引用验证函数
│   └── multi-file.test.ts              # 8 个用例
│
├── 11-bash-advanced/                    # 🐚 Bash 脚本
│   └── task.md                          # 仓库分析脚本
│
└── 12-stress/                           # 🏋️ 压力测试
    ├── task.md                          # 2000+ 行模块加函数
    └── large-module.ts                  # 2286 行大型模块
```

## 测试范围

| # | 测试模块 | 验证能力 | 测试数 | 难度 |
|---|---------|---------|--------|------|
| 01 | quicksort | 算法实现、递归、不可变排序 | 13 | ⭐⭐⭐ |
| 02 | fibonacci | BigInt、生成器、矩阵快速幂 | 25 | ⭐⭐⭐⭐ |
| 03 | responsive-page | HTML/CSS/JS、响应式设计 | — | ⭐⭐⭐ |
| 04 | tool-tests | 文件/搜索/Web/Git/Bash | 5子任务 | ⭐⭐ |
| **05** | **debugging** | **代码阅读、排错** | **2模块** | **⭐⭐** |
| **06** | **refactoring** | **架构理解、安全重构** | **4组** | **⭐⭐⭐** |
| **07** | **web-research** | **信息获取+代码应用** | **—** | **⭐⭐⭐** |
| **08** | **data-processing** | **文件I/O、数据变换** | **—** | **⭐⭐** |
| **09** | **test-writing** | **测试思维、边界覆盖** | **待编写** | **⭐⭐⭐** |
| **10** | **multi-file** | **跨文件import协调** | **8** | **⭐⭐⭐⭐** |
| **11** | **bash-advanced** | **管道/awk/sort等工具链** | **—** | **⭐⭐** |
| **12** | **stress** | **大文件上下文管理** | **—** | **⭐⭐⭐⭐** |

## 如何运行测试

```bash
# 运行所有 .test.ts 测试
npx vitest run test/01-quicksort test/02-fibonacci test/05-debugging test/10-multi-file

# 运行单个测试
npx vitest run test/05-debugging/buggy-sort.test.ts

# 数据处理（需实现 process.ts 后）
npx tsx test/08-data-processing/process.ts

# 预览响应式页面
# 直接在浏览器打开 test/03-responsive-page/src/index.html

# Bash 脚本（需实现 analyze-repo.sh 后）
bash test/11-bash-advanced/analyze-repo.sh
```

## 执行顺序

建议按以下顺序执行任务，从简单到复杂：

| 阶段 | 测试 | 目的 |
|------|------|------|
| Phase 0 | 04-tool-tests | 验证基础工具能力 |
| Phase 1 | 05-debugging | 验证排错能力 |
| Phase 2 | 01-quicksort | 算法实现（中等） |
| Phase 3 | 02-fibonacci | 算法优化（较难） |
| Phase 4 | 09-test-writing | 验证测试编写能力 |
| Phase 5 | 06-refactoring | 验证架构理解 |
| Phase 6 | 10-multi-file | 验证跨文件协调 |
| Phase 7 | 08-data-processing | 数据处理综合 |
| Phase 8 | 07-web-research | 信息获取+应用 |
| Phase 9 | 03-responsive-page | 前端开发综合 |
| Phase 10 | 11-bash-advanced | 工具链运用 |
| Phase 11 | 12-stress | 大文件处理 |

## 验证方式

**hiwi-agent 判断测试是否通过的方式**：

| 验证方式 | 说明 | 适用模块 |
|---------|------|---------|
| ✅ **vitest 自动化** | 测试用例全部通过即 pass | 01, 02, 05, 06, 09, 10 |
| ✅ **编译检查** | `tsc --noEmit` 无报错即 pass | 12 |
| ✅ **文件存在性** | 预期输出文件已生成即 pass | 04, 08, 11 |
| ✅ **数据校验** | JSON 结构符合预期即 pass | 08 |
| 👁️ **人工检查** | 需在浏览器中手动确认 | 03, 07 |

### 一键验证

完成所有任务后运行：
```bash
npx tsx test/verify.ts
```

输出示例：
```
========================================
  hiwi-agent 统一验证报告
========================================

  01 quicksort                  PASS
         13 tests passed
  02 fibonacci                  PASS
         25 tests passed
  05 debugging                  PASS
         All tests passed
  ...
  12 stress-compile             PASS
         Compiles without errors

----------------------------------------
  需要人工检查的项目
----------------------------------------

  03 responsive-page:
    请手动在浏览器中打开 test/03-responsive-page/src/index.html
   □ 响应式布局：375px单列 / 768px两列 / 1200px四列
   □ 暗色模式切换正常

========================================
  汇总: 11/11 通过
========================================
```
