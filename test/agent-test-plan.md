# hiwi-agent 执行计划

> 这是给 hiwi-agent 的完整执行指南。请按顺序完成所有 Phase。

---

## Phase 0: 工具验证（04-tool-tests）

**目标:** 验证基础工具操作能力。

**文件:** `test/04-tool-tests/task.md`

**关键检查点:**
- [ ] 文件创建/读取/修改/重命名
- [ ] Grep 搜索和 Glob 匹配
- [ ] Web 请求
- [ ] Git 操作
- [ ] Bash 命令执行

---

## Phase 1: 找 Bug（05-debugging）

**目标:** 找出并修复 5 个隐藏的 bug。

**文件:** `test/05-debugging/task.md`

**验证:** `npx vitest run test/05-debugging`

---

## Phase 2: 快速排序（01-quicksort）

**文件:**
- 阅读: `test/01-quicksort/task.md`
- 编辑: `test/01-quicksort/quicksort.ts`
- 验证: `npx vitest run test/01-quicksort`

**注意:** 不可变排序 + 三种 pivot 策略 + 10000 元素 < 100ms

---

## Phase 3: 斐波那契数列（02-fibonacci）

**文件:**
- 阅读: `test/02-fibonacci/task.md`
- 编辑: `test/02-fibonacci/fib.ts`
- 验证: `npx vitest run test/02-fibonacci`

**注意:** 四种方法都需实现，使用 bigint，矩阵快速幂要 O(log n)

---

## Phase 4: 测试编写（09-test-writing）

**目标:** 为 calculator.ts 的 8 个函数编写完整测试。

**文件:** `test/09-test-writing/task.md`

**验证:** `npx vitest run test/09-test-writing`

**要求:** ≥ 20 个测试，≥ 95% 覆盖率，含参数化测试

---

## Phase 5: 代码重构（06-refactoring）

**目标:** 将 200+ 行面条代码拆分为清晰模块。

**文件:** `test/06-refactoring/task.md`

**验证:** `npx vitest run test/06-refactoring`

---

## Phase 6: 多文件协调（10-multi-file）

**目标:** 将验证函数从 utils.ts 抽离到 validators/ 目录，更新所有 import。

**文件:** `test/10-multi-file/task.md`

**验证:** `npx vitest run test/10-multi-file`

---

## Phase 7: 数据处理（08-data-processing）

**目标:** 解析 1000 行 CSV，清洗变换，输出 JSON。

**文件:**
- 阅读: `test/08-data-processing/task.md`
- 创建: `test/08-data-processing/process.ts`
- 运行: `npx tsx test/08-data-processing/process.ts`

---

## Phase 8: Web Research（07-web-research）

**目标:** 搜索 CSS Container Queries 文档并应用到响应式页面。

**文件:** `test/07-web-research/task.md`

---

## Phase 9: 响应式页面（03-responsive-page）

**文件:**
- `test/03-responsive-page/task.md`
- `test/03-responsive-page/src/index.html`
- `test/03-responsive-page/src/styles.css`

**要求:** Grid / Flexbox / 暗色模式 / 容器查询 / 动画 / 可访问性

---

## Phase 10: Bash 脚本（11-bash-advanced）

**文件:** `test/11-bash-advanced/task.md`

**运行:** `bash test/11-bash-advanced/analyze-repo.sh`

---

## Phase 11: 大文件处理（12-stress）

**文件:**
- `test/12-stress/task.md`
- `test/12-stress/large-module.ts`（2286 行）

**验证:** `npx tsc --noEmit test/12-stress/large-module.ts`

---

## 最终验证

运行统一验证脚本：
```bash
npx tsx test/verify.ts
```

脚本会自动执行：
- ✅ vitest 测试（01/02/05/06/09/10）
- ✅ 编译检查（12）
- ✅ 文件存在性检查（04/08/11）
- ✅ JSON 数据校验（08）
- 👁️ 显示需要人工检查的项目（03/07）

## Phase 11: 大文件处理（12-stress）

**文件:**
- `test/12-stress/task.md`
- `test/12-stress/large-module.ts`（2286 行）

**验证:** `npx tsc --noEmit test/12-stress/large-module.ts`

---

## 完成检查清单

- [ ] Phase 0 — 工具操作全部成功
- [ ] Phase 1 — 5 个 bug 全部修复，测试通过
- [ ] Phase 2 — 13 个测试通过
- [ ] Phase 3 — 25 个测试通过
- [ ] Phase 4 — 20+ 个测试，覆盖率 ≥ 95%
- [ ] Phase 5 — 重构兼容性测试通过
- [ ] Phase 6 — 8 个多文件测试通过
- [ ] Phase 7 — process.ts 成功输出 JSON
- [ ] Phase 8 — 容器查询在浏览器中生效
- [ ] Phase 9 — 页面在浏览器正常渲染
- [ ] Phase 10 — repo-analysis.md 生成
- [ ] Phase 11 — 新函数编译通过
- [ ] 所有文件已保存并提交

---

## 提示

- 使用 `npx vitest run <path>` 验证测试
- 对于响应式页面，可以在浏览器中打开预览
- 如果某任务卡住，先跳过继续后面的任务
- 有任何不确定的决定，请向我确认
