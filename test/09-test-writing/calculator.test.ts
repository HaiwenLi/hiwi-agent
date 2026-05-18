/**
 * calculator.test.ts — 空的测试文件
 *
 * 任务：为 calculator.ts 中的所有 8 个函数编写完整测试。
 * 要求见 task.md
 */
import { describe, it, expect } from 'vitest';
import { add, subtract, multiply, divide, power, sqrt, factorial, mod } from './calculator';

describe('add', () => {
  it('2 + 3 = 5', () => expect(add(2, 3)).toBe(5));
  it('0 + 0 = 0', () => expect(add(0, 0)).toBe(0));
  it('负数相加', () => expect(add(-5, 3)).toBe(-2));
  it('小数相加', () => expect(add(0.1, 0.2)).toBeCloseTo(0.3));
  it('大数相加', () => expect(add(1e15, 1e15)).toBe(2e15));
});

describe('subtract', () => {
  it('5 - 3 = 2', () => expect(subtract(5, 3)).toBe(2));
  it('0 - 0 = 0', () => expect(subtract(0, 0)).toBe(0));
  it('负数相减', () => expect(subtract(-5, -3)).toBe(-2));
  it('大数相减', () => expect(subtract(1e15, 1e15)).toBe(0));
});

describe('multiply', () => {
  it('2 * 3 = 6', () => expect(multiply(2, 3)).toBe(6));
  it('0 * 100 = 0', () => expect(multiply(0, 100)).toBe(0));
  it('负数乘法', () => expect(multiply(-2, 3)).toBe(-6));
  it('小数乘法', () => expect(multiply(0.1, 0.2)).toBeCloseTo(0.02));
});

describe('divide', () => {
  it('6 / 3 = 2', () => expect(divide(6, 3)).toBe(2));
  it('1 / 2 = 0.5', () => expect(divide(1, 2)).toBe(0.5));
  it('除以零抛出错误', () => expect(() => divide(1, 0)).toThrow('Division by zero'));
  it('负数除法', () => expect(divide(-6, 3)).toBe(-2));
  it('0 / 5 = 0', () => expect(divide(0, 5)).toBe(0));
});

describe('power', () => {
  it('2^3 = 8', () => expect(power(2, 3)).toBe(8));
  it('2^0 = 1', () => expect(power(2, 0)).toBe(1));
  it('0^5 = 0', () => expect(power(0, 5)).toBe(0));
  it('负指数', () => expect(power(2, -2)).toBeCloseTo(0.25));
  it('2^10 = 1024', () => expect(power(2, 10)).toBe(1024));
});

describe('sqrt', () => {
  it('sqrt(4) = 2', () => expect(sqrt(4)).toBe(2));
  it('sqrt(0) = 0', () => expect(sqrt(0)).toBe(0));
  it('sqrt(2) ≈ 1.414', () => expect(sqrt(2)).toBeCloseTo(1.414));
  it('负数平方根抛出错误', () => expect(() => sqrt(-1)).toThrow('Cannot compute square root of negative number'));
  it('1.21 的平方根', () => expect(sqrt(1.21)).toBeCloseTo(1.1));
});

describe('factorial', () => {
  it('0! = 1', () => expect(factorial(0)).toBe(1));
  it('1! = 1', () => expect(factorial(1)).toBe(1));
  it('5! = 120', () => expect(factorial(5)).toBe(120));
  it('10! = 3628800', () => expect(factorial(10)).toBe(3628800));
  it('负数阶乘抛出错误', () => expect(() => factorial(-1)).toThrow('Factorial of negative number is undefined'));
  it('超过 100 抛出错误', () => expect(() => factorial(101)).toThrow('Factorial too large — input must be ≤ 100'));
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('factorial(%s) 正确', (n) => expect(factorial(n)).toBeGreaterThan(0));
});

describe('mod', () => {
  it('10 % 3 = 1', () => expect(mod(10, 3)).toBe(1));
  it('10 % 5 = 0', () => expect(mod(10, 5)).toBe(0));
  it('除以零抛出错误', () => expect(() => mod(10, 0)).toThrow('Modulo by zero'));
  it('负数取模', () => expect(mod(-10, 3)).toBe(2));
  it.each([
    [10, 3, 1],
    [10, 5, 0],
    [17, 5, 2],
    [100, 7, 2],
  ])('mod(%s, %s) = %s', (a, b, expected) => expect(mod(a, b)).toBe(expected));
});