import { describe, it, expect } from 'vitest';
import { insertionSort, binarySearch } from './buggy-sort';

describe('insertionSort (修复后)', () => {
  it('空数组', () => {
    expect(insertionSort([])).toEqual([]);
  });

  it('单元素', () => {
    expect(insertionSort([5])).toEqual([5]);
  });

  it('已排序数组', () => {
    expect(insertionSort([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  it('逆序数组', () => {
    expect(insertionSort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
  });

  it('随机数组', () => {
    const arr = [3, 7, 1, 9, 2, 8, 4, 6, 5];
    expect(insertionSort(arr)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('含重复元素', () => {
    expect(insertionSort([4, 2, 4, 2, 1])).toEqual([1, 2, 2, 4, 4]);
  });

  it('大数组无栈溢出', () => {
    const arr = Array.from({ length: 1000 }, (_, i) => 1000 - i);
    const sorted = insertionSort(arr);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i - 1]).toBeLessThanOrEqual(sorted[i]);
    }
  });
});

describe('binarySearch (修复后)', () => {
  const arr = [1, 3, 5, 7, 9, 11, 13, 15];

  it('找到存在的元素', () => {
    expect(binarySearch(arr, 1)).toBe(0);
    expect(binarySearch(arr, 7)).toBe(3);
    expect(binarySearch(arr, 15)).toBe(7);
  });

  it('找不到时返回 -1（不陷入死循环）', () => {
    const start = performance.now();
    const result = binarySearch(arr, 2);
    const duration = performance.now() - start;
    expect(result).toBe(-1);
    expect(duration).toBeLessThan(10); // 快速返回，证明无死循环
  });

  it('小于所有元素返回 -1', () => {
    expect(binarySearch(arr, 0)).toBe(-1);
  });

  it('大于所有元素返回 -1', () => {
    expect(binarySearch(arr, 100)).toBe(-1);
  });

  it('空数组返回 -1', () => {
    expect(binarySearch([], 1)).toBe(-1);
  });

  it('单元素数组查找', () => {
    expect(binarySearch([5], 5)).toBe(0);
    expect(binarySearch([5], 3)).toBe(-1);
  });
});
