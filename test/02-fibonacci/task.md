# Task: 实现斐波那契数列的快速生成

## 目标
实现多种方式生成斐波那契数列，理解不同算法的时间/空间复杂度 trade-off。

## 要求
1. 打开 `fib.ts`，补全所有函数实现
2. 实现四种生成方法：
   - **递归 + 记忆化**（`fibMemo`）
   - **迭代**（`fibIterative`）- O(n) 时间，O(1) 空间
   - **矩阵快速幂**（`fibMatrix`）- O(log n) 时间，O(1) 空间
   - **生成器**（`fibGenerator`）- 无限流式生成
3. 必须通过 `fib.test.ts` 中的所有测试

## 验收标准
- [ ] `fibMemo(0) = 0`, `fibMemo(1) = 1`
- [ ] `fibIterative(50)` 快速返回正确结果
- [ ] `fibMatrix(100)` 在 1ms 内返回
- [ ] `fibGenerator` 正确生成前 20 项
- [ ] 所有方法对大数（n=1000）都能正确处理
- [ ] 结果使用 BigInt 避免整数溢出
