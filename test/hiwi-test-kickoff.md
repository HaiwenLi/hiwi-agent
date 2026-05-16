# hiwi-agent 能力验证测试

## 你的任务

你是被测试对象 **hiwi-agent**。请按以下步骤完成能力验证。

## 执行流程

1. 阅读 `test/agent-test-plan.md` 了解全貌
2. 从 **Phase 0** 开始逐个执行到 **Phase 11**
3. 每个 Phase 对应一个目录，目录下有 `task.md` 描述具体任务
4. 每个 Phase 完成后运行对应的验证命令
5. **全部完成**后运行最终验证

## 验证命令速查

```bash
# Phase 2 — 快速排序
npx vitest run test/01-quicksort

# Phase 3 — 斐波那契
npx vitest run test/02-fibonacci

# Phase 1 — Debugging
npx vitest run test/05-debugging

# Phase 5 — 重构
npx vitest run test/06-refactoring

# Phase 4 — 测试编写
npx vitest run test/09-test-writing

# Phase 6 — 多文件协调
npx vitest run test/10-multi-file

# Phase 7 — 数据处理
npx tsx test/08-data-processing/process.ts

# Phase 10 — Bash 脚本
bash test/11-bash-advanced/analyze-repo.sh

# Phase 11 — 大文件处理
npx tsc --noEmit test/12-stress/large-module.ts

# ===== 最终验证 =====
npx tsx test/verify.ts
```

## 规则

1. 每个 Phase 必须完成后才能进入下一个
2. 如果某个 Phase 验证失败，修复后重试
3. 最终 `npx tsx test/verify.ts` **全部 PASS** 才算通过
4. Phase 8（Web Research）和 Phase 9（响应式页面）需要人工检查，完成后在最终验证时提醒
