# Task: 找出并修复 Bug

## 目标
以下两个模块中各隐藏了若干 bug。请找出并修复它们。

## 文件
1. `buggy-sort.ts` — 有 **3 个 bug** 的排序实现
2. `buggy-async.ts` — 有 **2 个 bug** 的异步代码

## 要求
- 不要重写整个函数 — 只修复有问题的行
- 修复后，对应的测试文件 `buggy-sort.test.ts` 和 `buggy-async.test.ts` 必须全部通过
- 修复后运行：`npx vitest run test/05-debugging`

## Bug 提示
- 边界条件错误（off-by-one）
- 死循环或无限递归
- 类型或变量引用错误
- Promise 链断裂
- 竞态条件
