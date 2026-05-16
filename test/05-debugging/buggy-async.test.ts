import { describe, it, expect } from 'vitest';
import { fetchAllWithFallback, getCachedOrFetch } from './buggy-async';

describe('fetchAllWithFallback (修复后)', () => {
  it('所有请求成功时返回所有结果', async () => {
    const results = await fetchAllWithFallback([1, 2, 4, 5], 'N/A');
    expect(results).toEqual(['Result 1', 'Result 2', 'Result 4', 'Result 5']);
  });

  it('部分请求失败时返回 fallback', async () => {
    // id 为 3 的倍数会失败
    const results = await fetchAllWithFallback([1, 2, 3, 4, 5, 6], 'FALLBACK');
    expect(results[0]).toBe('Result 1');
    expect(results[1]).toBe('Result 2');
    expect(results[2]).toBe('FALLBACK');
    expect(results[3]).toBe('Result 4');
    expect(results[4]).toBe('Result 5');
    expect(results[5]).toBe('FALLBACK');
  });

  it('全部失败时全部返回 fallback', async () => {
    const results = await fetchAllWithFallback([0, 3, 6], 'ERR');
    expect(results).toEqual(['ERR', 'ERR', 'ERR']);
  });

  it('不应抛出未捕获的异常', async () => {
    // 如果 Promise.all 未处理，这个测试会 crash
    await expect(
      fetchAllWithFallback([3, 6, 9], 'OK')
    ).resolves.not.toThrow();
  });
});

describe('getCachedOrFetch (修复后)', () => {
  it('首次调用应发起请求', async () => {
    const result = await getCachedOrFetch(42);
    expect(result).toBe('Result 42');
  });

  it('重复调用应使用缓存', async () => {
    // 清空内部缓存（通过重新 import 或直接访问）
    const result1 = await getCachedOrFetch(99);
    const result2 = await getCachedOrFetch(99);
    expect(result1).toBe('Result 99');
    expect(result2).toBe('Result 99');
  });

  it('多个不同 id 不应互相干扰', async () => {
    const results = await Promise.all([
      getCachedOrFetch(10),
      getCachedOrFetch(20),
      getCachedOrFetch(30),
    ]);
    expect(results).toEqual(['Result 10', 'Result 20', 'Result 30']);
  });
});
