/**
 * spaghetti.ts — 面条式代码
 *
 * 此文件将验证、格式化、业务逻辑全部混在一起。
 * 请将其重构为 test/06-refactoring/ 下清晰的模块化结构。
 *
 * 注意：不要修改此文件。应当创建新模块并保持行为一致。
 */

export interface RawUserData {
  name?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  salary?: string;
}

export interface ProcessedUser {
  name: string;
  email: string;
  phone: string;
  age: number;
  salaryFormatted: string;
  isValid: boolean;
  errors: string[];
}

/**
 * 验证邮箱地址
 * 规则：必须包含 @ 符号，@ 前后至少有一个字符，域名至少包含一个点
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return false;
  const localPart = email.substring(0, atIndex);
  const domainPart = email.substring(atIndex + 1);
  if (!localPart || !domainPart) return false;
  const dotIndex = domainPart.indexOf('.');
  if (dotIndex < 1) return false;
  if (dotIndex === domainPart.length - 1) return false;
  return true;
}

/**
 * 验证手机号（中国大陆）
 * 规则：11 位数字，以 1 开头
 */
export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\s|-/g, '');
  if (digits.length !== 11) return false;
  if (!/^\d+$/.test(digits)) return false;
  if (!/^1[3-9]\d{9}$/.test(digits)) return false;
  return true;
}

/**
 * 验证姓名
 * 规则：2-20 个字符，不能为空
 */
export function validateName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) return false;
  return true;
}

/**
 * 格式化日期为 "YYYY-MM-DD"
 * 输入格式：ISO 日期字符串或 "YYYY/MM/DD"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';

  // 尝试解析 ISO 格式
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // 尝试解析 "YYYY/MM/DD" 格式
  const slashMatch = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(dateStr);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;

  // 尝试解析 Date 对象
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  return '';
}

/**
 * 计算年龄（基于出生日期）
 */
export function calculateAge(birthDate: string): number {
  const formatted = formatDate(birthDate);
  if (!formatted) return -1;

  const [y, m, d] = formatted.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
    age--;
  }
  return age;
}

/**
 * 格式化货币（人民币）
 * 输入：字符串或数字，输出：¥X,XXX.XX 格式
 */
export function formatCurrency(amount: string | number): string {
  if (amount === undefined || amount === null || amount === '') return '';

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '';

  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');

  // 添加千分位逗号
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `¥${formattedInt}.${decPart}`;
}

/**
 * 处理用户数据 — 主入口函数
 * 这个函数混合了验证和格式化逻辑
 */
export function processUserData(data: RawUserData): ProcessedUser {
  const errors: string[] = [];
  const name = data.name?.trim() || '';
  const email = data.email?.trim() || '';
  const phone = data.phone?.trim() || '';

  // 验证
  const isNameValid = validateName(name);
  if (!isNameValid) errors.push('Invalid name');

  const isEmailValid = validateEmail(email);
  if (!isEmailValid) errors.push('Invalid email');

  const isPhoneValid = validatePhone(phone);
  if (!isPhoneValid) errors.push('Invalid phone');

  // 计算年龄
  let age = -1;
  if (data.birthDate) {
    age = calculateAge(data.birthDate);
  }

  // 格式化
  const salaryFormatted = formatCurrency(data.salary ?? '');

  return {
    name,
    email,
    phone,
    age,
    salaryFormatted,
    isValid: errors.length === 0,
    errors,
  };
}
