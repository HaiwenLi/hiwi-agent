/**
 * calculator.ts — 计算器模块
 *
 * 任务：为以下所有函数编写完整的测试。
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}

export function power(base: number, exp: number): number {
  return Math.pow(base, exp);
}

export function sqrt(n: number): number {
  if (n < 0) throw new Error('Cannot compute square root of negative number');
  return Math.sqrt(n);
}

export function factorial(n: number): number {
  if (n < 0) throw new Error('Factorial of negative number is undefined');
  if (n > 100) throw new Error('Factorial too large — input must be ≤ 100');
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

export function mod(a: number, b: number): number {
  if (b === 0) throw new Error('Modulo by zero');
  return ((a % b) + b) % b;
}
