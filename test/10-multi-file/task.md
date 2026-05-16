# Task: 多文件协调重构

## 目标
`utils.ts` 包含了多种工具函数。请将验证相关函数抽离到独立的 `validators/` 目录，并更新所有 import 引用。

## 要求

### 当前结构
```
10-multi-file/
├── task.md
├── utils.ts              # 验证 + 格式化 + 工具函数混在一起
├── user-service.ts       # 引用 utils 中的验证函数
├── product-service.ts    # 引用 utils 中的格式化函数
├── order-service.ts      # 引用 utils 中两种函数
└── multi-file.test.ts    # 测试 — 必须通过
```

### 重构后的结构
```
10-multi-file/
├── ...
├── utils.ts              # 只保留格式化 + 通用工具函数
├── validators/           # 新建
│   ├── index.ts          #   重新导出所有验证函数
│   ├── user.ts           #   validateUsername, isEmailUnique
│   └── inventory.ts      #   validateSku, checkStock
├── user-service.ts       # 更新 import → validators/
├── product-service.ts    # 更新 import → validators/（如果需要）
└── order-service.ts      # 更新 import → validators/
```

### 任务
1. 创建 `validators/` 目录和内部文件
2. 从 `utils.ts` 移动验证函数到 `validators/` 下的对应文件
3. 更新 `utils.ts` — 删除已移动的函数，但从 `validators/` re-export 以保持向后兼容
4. 更新 `user-service.ts`、`product-service.ts`、`order-service.ts` 的 import
5. 确保 `multi-file.test.ts` 全部通过

### 验收标准
- [ ] `validators/user.ts` 包含用户相关验证
- [ ] `validators/inventory.ts` 包含库存相关验证
- [ ] 所有 .ts 文件通过 TypeScript 编译检查
- [ ] 测试全部通过
- [ ] 未改变被验证函数的原始行为
