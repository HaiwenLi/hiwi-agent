/**
 * buggy-async.ts
 *
 * 此文件包含 2 个故意的 bug。请找出并修复它们。
 * Bug 类型：错误处理、竞态条件
 */

/**
 * 模拟 API 请求
 */
function simulateRequest(id: number, shouldFail: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        reject(new Error(`Request ${id} failed`));
      } else {
        resolve(`Result ${id}`);
      }
    }, Math.random() * 100);
  });
}

/**
 * 并行获取多个请求的结果，失败时返回 fallback
 *
 * Bug 1: 未处理的 Promise 拒绝 — 当某个请求失败时，
 *         Promise.allSettled 的结果未被正确处理
 */
export async function fetchAllWithFallback(
  ids: number[],
  fallback: string = "N/A"
): Promise<string[]> {
  const promises = ids.map(id => simulateRequest(id, id % 3 === 0));
  const results = await Promise.allSettled(promises);

  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : fallback
  );
}

/**
 * Bug 2: 竞态条件 — 缓存和请求之间存在 TOCTOU 问题
 */
const cache = new Map<number, string>();
const pendingRequests = new Map<number, Promise<string>>();

export async function getCachedOrFetch(id: number): Promise<string> {
  if (cache.has(id)) {
    return cache.get(id)!;
  }

  if (pendingRequests.has(id)) {
    return pendingRequests.get(id)!;
  }

  const promise = simulateRequest(id, false).then(result => {
    cache.set(id, result);
    pendingRequests.delete(id);
    return result;
  });

  pendingRequests.set(id, promise);
  return promise;
}
