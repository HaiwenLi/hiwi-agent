/**
 * 斐波那契数列快速生成 - 请补全实现
 */

/**
 * 方法1: 递归 + 记忆化
 * 使用 Map 作为缓存，避免重复计算
 * 时间复杂度 O(n)，空间复杂度 O(n)
 */
export function fibMemo(n: number): bigint {
  // TODO: 实现记忆化递归
  // 提示：使用 new Map<number, bigint>() 存储已计算的值
  // 注意：n 可能为 0
  return 0n;
}

/**
 * 方法2: 迭代法
 * 使用两个变量滚动计算，不使用数组
 * 时间复杂度 O(n)，空间复杂度 O(1)
 */
export function fibIterative(n: number): bigint {
  // TODO: 实现迭代法
  // 提示：只用两个变量保存前两个值
  // 注意处理 n = 0, 1 的边界情况
  return 0n;
}

/**
 * 方法3: 矩阵快速幂
 * 利用矩阵 [[1,1],[1,0]]^n 的左上角元素即 F(n)
 * 时间复杂度 O(log n)，空间复杂度 O(log n)
 */
export function fibMatrix(n: number): bigint {
  // TODO: 实现矩阵快速幂
  // 提示：实现一个 2x2 矩阵乘法函数
  // 然后使用快速幂算法计算矩阵的 n 次幂
  return 0n;
}

/**
 * 方法4: 生成器（无限流）
 * 每次调用 next() 返回下一个斐波那契数
 */
export function* fibGenerator(): Generator<bigint> {
  // TODO: 实现生成器
  // 提示：使用无限循环 yield 每个值
}

/**
 * 获取斐波那契数列的前 n 项（使用生成器）
 */
export function fibSequence(n: number): bigint[] {
  // TODO: 使用 fibGenerator 获取前 n 项
  const result: bigint[] = [];
  return result;
}
