# Task: 编写单元测试

## 目标
为 `calculator.ts` 中的计算器模块编写完整的单元测试。

## 文件
- `calculator.ts` — 计算器模块，包含 8 个函数
- `calculator.test.ts` — 空文件，等你填充测试

## 函数清单

| 函数 | 签名 | 说明 |
|------|------|------|
| `add` | `(a: number, b: number) => number` | 加法 |
| `subtract` | `(a: number, b: number) => number` | 减法 |
| `multiply` | `(a: number, b: number) => number` | 乘法 |
| `divide` | `(a: number, b: number) => number` | 除法（除以 0 抛出 Error） |
| `power` | `(base: number, exp: number) => number` | 幂运算 |
| `sqrt` | `(n: number) => number` | 平方根（负数抛出 Error） |
| `factorial` | `(n: number) => number` | 阶乘（负数和大于 100 抛出 Error） |
| `mod` | `(a: number, b: number) => number` | 取模 |

## 要求
- 使用 vitest 的 `describe`/`it`/`expect`
- 覆盖正常路径、边界值、错误路径
- 测试除法除以零和负数平方根的错误抛出
- 阶乘测试大数边界
- 使用 `it.each` 参数化至少一组测试

## 验收标准
- [ ] 覆盖率 ≥ 95%（分支覆盖率）
- [ ] 测试数量 ≥ 20 个
- [ ] 包含错误路径测试
- [ ] 包含参数化测试
