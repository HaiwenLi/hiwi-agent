import { describe, it, expect } from 'vitest';
import { fibMemo, fibIterative, fibMatrix, fibGenerator, fibSequence } from './fib';

describe('fibMemo (递归 + 记忆化)', () => {
  it('fibMemo(0) 应该返回 0n', () => {
    expect(fibMemo(0)).toBe(0n);
  });

  it('fibMemo(1) 应该返回 1n', () => {
    expect(fibMemo(1)).toBe(1n);
  });

  it('fibMemo(10) 应该返回 55n', () => {
    expect(fibMemo(10)).toBe(55n);
  });

  it('fibMemo(50) 应该正确', () => {
    expect(fibMemo(50)).toBe(12586269025n);
  });

  it('fibMemo(100) 应该正确', () => {
    expect(fibMemo(100)).toBe(354224848179261915075n);
  });

  it('应该使用缓存避免重复计算（多次调用相同值应快速返回）', () => {
    const start = performance.now();
    const results = Array.from({ length: 100 }, () => fibMemo(50));
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(50);
    expect(results.every(r => r === 12586269025n)).toBe(true);
  });
});

describe('fibIterative (迭代法)', () => {
  it('fibIterative(0) = 0', () => {
    expect(fibIterative(0)).toBe(0n);
  });

  it('fibIterative(1) = 1', () => {
    expect(fibIterative(1)).toBe(1n);
  });

  it('fibIterative(20) = 6765', () => {
    expect(fibIterative(20)).toBe(6765n);
  });

  it('fibIterative(50) = 12586269025', () => {
    expect(fibIterative(50)).toBe(12586269025n);
  });

  it('fibIterative(100) 应该正确', () => {
    expect(fibIterative(100)).toBe(354224848179261915075n);
  });

  it('fibIterative(1000) 应该能正确计算大数', () => {
    const result = fibIterative(1000);
    expect(result.toString().length).toBeGreaterThan(200);
    // 验证已知值
    const expected = BigInt(
      '43466557686937456435688527675040625802564660517371780402481729089536555417949051890403879840079255169295922593080322634775209689623239873322471161642996440906533187938298969649928516003704476137795166849228875'
    );
    expect(result).toBe(expected);
  });
});

describe('fibMatrix (矩阵快速幂)', () => {
  it('fibMatrix(0) = 0', () => {
    expect(fibMatrix(0)).toBe(0n);
  });

  it('fibMatrix(1) = 1', () => {
    expect(fibMatrix(1)).toBe(1n);
  });

  it('fibMatrix(10) = 55', () => {
    expect(fibMatrix(10)).toBe(55n);
  });

  it('fibMatrix(50) = 12586269025', () => {
    expect(fibMatrix(50)).toBe(12586269025n);
  });

  it('fibMatrix(100) 应该正确', () => {
    expect(fibMatrix(100)).toBe(354224848179261915075n);
  });

  it('应该与迭代法结果一致', () => {
    for (let i = 0; i < 30; i++) {
      expect(fibMatrix(i)).toBe(fibIterative(i));
    }
  });

  it('应该非常快（O(log n)），n=10^6 也应该在 1ms 内', () => {
    const start = performance.now();
    fibMatrix(1000000);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1);
  });
});

describe('fibGenerator (生成器)', () => {
  it('应该能生成前 10 个斐波那契数', () => {
    const gen = fibGenerator();
    const first10 = Array.from({ length: 10 }, () => gen.next().value);
    expect(first10).toEqual([0n, 1n, 1n, 2n, 3n, 5n, 8n, 13n, 21n, 34n]);
  });

  it('生成器应该是无限的', () => {
    const gen = fibGenerator();
    const first20 = Array.from({ length: 20 }, () => gen.next().value);
    expect(first20.length).toBe(20);
    expect(first20[19]).toBe(4181n);
  });
});

describe('fibSequence (工具函数)', () => {
  it('应该返回前 n 项', () => {
    expect(fibSequence(0)).toEqual([]);
    expect(fibSequence(1)).toEqual([0n]);
    expect(fibSequence(5)).toEqual([0n, 1n, 1n, 2n, 3n]);
  });
});

describe('跨方法一致性验证', () => {
  it('三种方法对 n=0..30 都应该返回相同结果', () => {
    for (let n = 0; n <= 30; n++) {
      const a = fibMemo(n);
      const b = fibIterative(n);
      const c = fibMatrix(n);
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });
});
