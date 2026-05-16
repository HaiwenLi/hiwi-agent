import { describe, it, expect } from 'vitest';
import { quickSort, choosePivot } from './quicksort';

describe('quickSort', () => {
  it('应该正确处理空数组', () => {
    expect(quickSort([])).toEqual([]);
  });

  it('应该正确处理单元素数组', () => {
    expect(quickSort([1])).toEqual([1]);
  });

  it('应该正确排序已排序数组', () => {
    expect(quickSort([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it('应该正确排序逆序数组', () => {
    expect(quickSort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });

  it('应该正确排序含重复元素的数组', () => {
    expect(quickSort([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5])).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 5, 6, 9]);
  });

  it('应该正确排序随机数组', () => {
    const arr = Array.from({ length: 100 }, () => Math.floor(Math.random() * 1000));
    const sorted = quickSort(arr);
    const expected = [...arr].sort((a, b) => a - b);
    expect(sorted).toEqual(expected);
  });

  it('不应该修改原数组', () => {
    const original = [3, 1, 4, 1, 5];
    const copy = [...original];
    quickSort(original);
    expect(original).toEqual(copy);
  });

  describe('pivot 策略: first', () => {
    it('应该使用首元素作为 pivot', () => {
      expect(quickSort([5, 4, 3, 2, 1], 'first')).toEqual([1, 2, 3, 4, 5]);
      expect(quickSort([1, 2, 3, 4, 5], 'first')).toEqual([1, 2, 3, 4, 5]);
      expect(quickSort([3, 3, 3], 'first')).toEqual([3, 3, 3]);
    });
  });

  describe('pivot 策略: last', () => {
    it('应该使用末元素作为 pivot', () => {
      expect(quickSort([5, 4, 3, 2, 1], 'last')).toEqual([1, 2, 3, 4, 5]);
      expect(quickSort([1, 2, 3, 4, 5], 'last')).toEqual([1, 2, 3, 4, 5]);
      expect(quickSort([3, 3, 3], 'last')).toEqual([3, 3, 3]);
    });
  });

  describe('pivot 策略: median-of-three', () => {
    it('应该使用三数取中作为 pivot', () => {
      expect(quickSort([5, 4, 3, 2, 1], 'median-of-three')).toEqual([1, 2, 3, 4, 5]);
      expect(quickSort([1, 2, 3, 4, 5], 'median-of-three')).toEqual([1, 2, 3, 4, 5]);
      expect(quickSort([3, 1, 2], 'median-of-three')).toEqual([1, 2, 3]);
    });
  });

  describe('性能测试', () => {
    it('应该能在 100ms 内排序 10000 个元素', () => {
      const arr = Array.from({ length: 10000 }, () => Math.floor(Math.random() * 100000));
      const start = performance.now();
      quickSort(arr);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});

describe('choosePivot', () => {
  it('first 策略应返回索引 0', () => {
    expect(choosePivot([3, 1, 4], 'first')).toBe(0);
  });

  it('last 策略应返回最后一个索引', () => {
    expect(choosePivot([3, 1, 4], 'last')).toBe(2);
  });

  describe('median-of-three', () => {
    it('应返回首中尾三个元素的中间值的索引', () => {
      // [3, 2, 1] -> 首=3, 中=2, 尾=1 -> 中间值是 2 -> 索引 1
      expect(choosePivot([3, 2, 1], 'median-of-three')).toBe(1);
      // [1, 3, 2] -> 首=1, 中=3, 尾=2 -> 中间值是 2 -> 索引 2
      expect(choosePivot([1, 3, 2], 'median-of-three')).toBe(2);
      // [2, 1, 3] -> 首=2, 中=1, 尾=3 -> 中间值是 2 -> 索引 0
      expect(choosePivot([2, 1, 3], 'median-of-three')).toBe(0);
    });

    it('当有两个相等值时，应返回索引较小的', () => {
      // [1, 2, 1] -> 首=1, 中=2, 尾=1 -> 中间值是 1 -> 取索引 0
      expect(choosePivot([1, 2, 1], 'median-of-three')).toBe(0);
    });
  });
});
