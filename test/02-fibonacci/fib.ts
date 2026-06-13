/**
 * 斐波那契数列快速生成 - 请补全实现
 */

/**
 * 方法1: 递归 + 记忆化
 * 使用 Map 作为缓存，避免重复计算
 * 时间复杂度 O(n)，空间复杂度 O(n)
 */
export function fibMemo(n: number): bigint {
  const cache = new Map<number, bigint>();
  function fib(n: number): bigint {
    if (n === 0) return 0n;
    if (n === 1) return 1n;
    if (cache.has(n)) return cache.get(n)!;
    const result = fib(n - 1) + fib(n - 2);
    cache.set(n, result);
    return result;
  }
  return fib(n);
}

/**
 * 方法2: 迭代法
 * 使用两个变量滚动计算，不使用数组
 * 时间复杂度 O(n)，空间复杂度 O(1)
 */
export function fibIterative(n: number): bigint {
  if (n === 0) return 0n;
  if (n === 1) return 1n;
  let a = 0n, b = 1n;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

/**
 * 方法3: 矩阵快速幂
 * 利用矩阵 [[1,1],[1,0]]^n 的左上角元素即 F(n)
 * 时间复杂度 O(log n)，空间复杂度 O(log n)
 */
type Matrix = [[bigint, bigint], [bigint, bigint]];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
    [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
  ];
}

function matrixPower(m: Matrix, n: number): Matrix {
  if (n === 0) return [[1n, 0n], [0n, 1n]];
  if (n === 1) return m;
  let result: Matrix = [[1n, 0n], [0n, 1n]];
  let base: Matrix = m;
  let exp = n;
  while (exp > 0) {
    if (exp & 1) {
      result = multiply(result, base);
    }
    base = multiply(base, base);
    exp >>= 1;
  }
  return result;
}

export function fibMatrix(n: number): bigint {
  // 基础矩阵 [[1,1],[1,0]]
  let result0 = 1n, result1 = 0n, result2 = 0n, result3 = 1n;
  let base0 = 1n, base1 = 1n, base2 = 1n, base3 = 0n;
  
  let exp = n;
  while (exp > 0) {
    if (exp & 1) {
      const r0 = result0 * base0 + result1 * base2;
      const r1 = result0 * base1 + result1 * base3;
      const r2 = result2 * base0 + result3 * base2;
      const r3 = result2 * base1 + result3 * base3;
      result0 = r0; result1 = r1; result2 = r2; result3 = r3;
    }
    const b0 = base0 * base0 + base1 * base2;
    const b1 = base0 * base1 + base1 * base3;
    const b2 = base2 * base0 + base3 * base2;
    const b3 = base2 * base1 + base3 * base3;
    base0 = b0; base1 = b1; base2 = b2; base3 = b3;
    exp >>= 1;
  }
  
  // result = [[F(n+1), F(n)], [F(n), F(n-1)]] → result0[1] = F(n)
  return result1;
}

/**
 * 方法4: 生成器（无限流）
 * 每次调用 next() 返回下一个斐波那契数
 */
export function* fibGenerator(): Generator<bigint> {
  let a = 0n, b = 1n;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

/**
 * 获取斐波那契数列的前 n 项（使用生成器）
 */
export function fibSequence(n: number): bigint[] {
  const result: bigint[] = [];
  const gen = fibGenerator();
  for (let i = 0; i < n; i++) {
    result.push(gen.next().value!);
  }
  return result;
}