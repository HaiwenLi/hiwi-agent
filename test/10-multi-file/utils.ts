/**
 * utils.ts — 通用工具模块
 *
 * 包含验证、格式化等多种混在一起的函数。
 * 请将验证函数抽离到 validators/ 目录。
 */

// ===== 用户验证函数（应移动到 validators/user.ts） =====

/**
 * 验证用户名：3-20 个字符，只能包含字母、数字、下划线
 */
export function validateUsername(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  return /^[a-zA-Z0-9_]{3,20}$/.test(name);
}

/**
 * 检查邮箱是否唯一（模拟数据库查询）
 */
export async function isEmailUnique(email: string): Promise<boolean> {
  // 模拟数据库查询
  const takenEmails = ['admin@example.com', 'test@example.com'];
  await new Promise(r => setTimeout(r, 1));
  return !takenEmails.includes(email.toLowerCase());
}

// ===== 库存验证函数（应移动到 validators/inventory.ts） =====

/**
 * 验证 SKU 格式：2-10 个大写字母或数字，用连字符分隔
 * 例如: "ABC-123", "X-999"
 */
export function validateSku(sku: string): boolean {
  if (!sku || typeof sku !== 'string') return false;
  return /^[A-Z0-9]{2,10}(-[A-Z0-9]{1,10})*$/.test(sku);
}

/**
 * 检查库存是否充足
 */
export function checkStock(sku: string, quantity: number): { available: boolean; currentStock: number } {
  if (!validateSku(sku)) {
    return { available: false, currentStock: 0 };
  }

  // 模拟库存数据
  const stockMap: Record<string, number> = {
    'ABC-123': 50,
    'XYZ-999': 0,
    'TEE-001': 100,
  };

  const currentStock = stockMap[sku] ?? 0;
  return {
    available: currentStock >= quantity,
    currentStock,
  };
}

// ===== 格式化函数（保留在 utils.ts） =====

/**
 * 格式化价格为本地化字符串
 */
export function formatPrice(price: number, currency: string = 'CNY'): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency,
  }).format(price);
}

/**
 * 格式化日期
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
