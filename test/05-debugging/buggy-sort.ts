/**
 * buggy-sort.ts
 *
 * 此文件包含 3 个故意的 bug。请找出并修复它们。
 * Bug 类型：边界条件、死循环、索引错误
 */

/**
 * 对数组执行插入排序（升序）
 * Bug 1: 边界条件错误导致漏排最后一个元素
 * Bug 2: 死循环导致栈溢出
 */
export function insertionSort(arr: number[]): number[] {
  const result = [...arr];

  for (let i = 1; i < result.length; i++) {
    const key = result[i];
    let j = i - 1;

    while (j >= 0 && result[j] > key) {
      result[j + 1] = result[j];
      j--;
    }

    result[j + 1] = key;
  }

  return result;
}

/**
 * 二分查找（在有序数组中查找目标值）
 * Bug 3: 死循环风险 — 当目标值不存在时陷入死循环
 */
export function binarySearch(arr: number[], target: number): number {
  let left = 0;
  let right = arr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (arr[mid] === target) return mid;

    // BUG: 缺少边界移动更新，当 arr[mid] < target 时 left 不更新
    if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return -1;
}
