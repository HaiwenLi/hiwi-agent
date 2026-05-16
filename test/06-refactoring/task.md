# Task: 重构面条式代码

## 目标
`spaghetti.ts` 是一个 200+ 行的耦合模块，验证逻辑、格式化逻辑、主处理逻辑全部混在一起。请将其重构为清晰的模块化结构。

## 要求

### 重构后的目录结构
```
06-refactoring/
├── task.md
├── spaghetti.ts            # (原文件，不应修改)
├── spaghetti.test.ts       # (测试，必须全部通过)
├── validators/             # 新建 — 验证逻辑
│   ├── index.ts
│   ├── email.ts
│   └── phone.ts
├── formatters/             # 新建 — 格式化逻辑
│   ├── index.ts
│   ├── date.ts
│   └── number.ts
└── processor.ts            # 新建 — 主处理逻辑（编排调用）
```

### 重构原则
1. **不改变外部行为** — `spaghetti.test.ts` 中的所有测试必须通过
2. **单一职责** — 每个文件只做一件事
3. **不修改原文件** — `spaghetti.ts` 保持不变（虽然重构前它是唯一的实现）
4. **新模块需要有 type 导出** — 类型定义放在 `types.ts`

### 验收标准
- [ ] `validators/email.ts` 导出一个 `validateEmail` 函数
- [ ] `validators/phone.ts` 导出一个 `validatePhone` 函数
- [ ] `formatters/date.ts` 导出一个 `formatDate` 函数
- [ ] `formatters/number.ts` 导出一个 `formatCurrency` 函数
- [ ] `processor.ts` 导出一个 `processUserData` 函数
- [ ] 所有测试通过
- [ ] 新模块不包含重复逻辑
