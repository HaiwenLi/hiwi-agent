/**
 * 快速排序 - 请补全实现
 * 要求：实现一个不可变的快速排序，支持多种 pivot 策略
 */

export type PivotStrategy = 'first' | 'last' | 'median-of-three';

/**
 * 对数组进行快速排序
 * @param arr 待排序数组
 * @param strategy pivot 选择策略，默认为 'median-of-three'
 * @returns 排序后的新数组
 */
export function quickSort(arr: number[], strategy: PivotStrategy = 'median-of-three'): number[] {
  if (arr.length <= 1) return [...arr];

  const copy = [...arr];

  function pivotIndex(lo: number, hi: number): number {
    switch (strategy) {
      case 'first': return lo;
      case 'last': return hi;
      case 'median-of-three': {
        const mid = lo + ((hi - lo) >> 1);
        const a = copy[lo], b = copy[mid], c = copy[hi];
        if ((a <= b && b <= c) || (c <= b && b <= a)) return mid;
        if ((b <= a && a <= c) || (c <= a && a <= b)) return lo;
        return hi;
      }
    }
  }

  function sort(lo: number, hi: number): void {
    if (lo >= hi) return;
    const globalPivot = pivotIndex(lo, hi);
    [copy[globalPivot], copy[hi]] = [copy[hi], copy[globalPivot]];
    const pivot = copy[hi];

    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (copy[j] <= pivot) {
        [copy[i], copy[j]] = [copy[j], copy[i]];
        i++;
      }
    }
    [copy[i], copy[hi]] = [copy[hi], copy[i]];

    sort(lo, i - 1);
    sort(i + 1, hi);
  }

  sort(0, copy.length - 1);
  return copy;
}

/**
 * 选择 pivot 元素
 * @param arr 数组片段
 * @param strategy 选择策略
 * @returns pivot 的索引
 */
export function choosePivot(arr: number[], strategy: PivotStrategy): number {
  switch (strategy) {
    case 'first':
      return 0;
    case 'last':
      return arr.length - 1;
    case 'median-of-three': {
      const lo = 0;
      const mid = Math.floor(arr.length / 2);
      const hi = arr.length - 1;
      const a = arr[lo], b = arr[mid], c = arr[hi];
      if ((a <= b && b <= c) || (c <= b && b <= a)) return mid;
      if ((b <= a && a <= c) || (c <= a && a <= b)) return lo;
      return hi;
    }
  }
}
