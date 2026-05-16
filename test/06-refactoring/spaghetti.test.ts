import { describe, it, expect } from 'vitest';

/**
 * 重构兼容性测试
 *
 * 这些测试引用的函数最终应从重构后的模块导入。
 * 测试验证：重构前后行为完全一致。
 */

describe('validateEmail', () => {
  async function testValidate(email: string): Promise<boolean> {
    // 尝试从重构后的模块导入，失败则回退到原模块
    try {
      const { validateEmail } = await import('./validators/email');
      return validateEmail(email);
    } catch {
      const { validateEmail } = await import('./spaghetti');
      return validateEmail(email);
    }
  }

  it('有效邮箱', async () => {
    expect(await testValidate('user@example.com')).toBe(true);
    expect(await testValidate('a@b.co')).toBe(true);
    expect(await testValidate('test.user@domain.com.cn')).toBe(true);
  });

  it('无效邮箱', async () => {
    expect(await testValidate('')).toBe(false);
    expect(await testValidate('notanemail')).toBe(false);
    expect(await testValidate('@domain.com')).toBe(false);
    expect(await testValidate('user@')).toBe(false);
    expect(await testValidate('user@.com')).toBe(false);
    expect(await testValidate('user@domain')).toBe(false);
  });
});

describe('validatePhone', () => {
  async function testValidate(phone: string): Promise<boolean> {
    try {
      const { validatePhone } = await import('./validators/phone');
      return validatePhone(phone);
    } catch {
      const { validatePhone } = await import('./spaghetti');
      return validatePhone(phone);
    }
  }

  it('有效手机号', async () => {
    expect(await testValidate('13800138000')).toBe(true);
    expect(await testValidate('15912345678')).toBe(true);
    expect(await testValidate('138 0013 8000')).toBe(true);
    expect(await testValidate('138-0013-8000')).toBe(true);
  });

  it('无效手机号', async () => {
    expect(await testValidate('')).toBe(false);
    expect(await testValidate('12345678901')).toBe(false); // 不以 1 开头
    expect(await testValidate('1380013800')).toBe(false);  // 10 位
    expect(await testValidate('138001380000')).toBe(false); // 12 位
    expect(await testValidate('abc')).toBe(false);
  });
});

describe('formatDate', () => {
  async function testFormat(date: string): Promise<string> {
    try {
      const { formatDate } = await import('./formatters/date');
      return formatDate(date);
    } catch {
      const { formatDate } = await import('./spaghetti');
      return formatDate(date);
    }
  }

  it('ISO 格式', async () => {
    expect(await testFormat('2024-01-15')).toBe('2024-01-15');
  });

  it('斜杠格式', async () => {
    expect(await testFormat('2024/01/15')).toBe('2024-01-15');
  });

  it('空字符串', async () => {
    expect(await testFormat('')).toBe('');
  });
});

describe('formatCurrency', () => {
  async function testFormat(amount: string | number): Promise<string> {
    try {
      const { formatCurrency } = await import('./formatters/number');
      return formatCurrency(amount);
    } catch {
      const { formatCurrency } = await import('./spaghetti');
      return formatCurrency(amount);
    }
  }

  it('整数', async () => {
    expect(await testFormat(1000)).toBe('¥1,000.00');
  });

  it('小数', async () => {
    expect(await testFormat(1234.5)).toBe('¥1,234.50');
  });

  it('大数', async () => {
    expect(await testFormat(1234567.89)).toBe('¥1,234,567.89');
  });

  it('字符串输入', async () => {
    expect(await testFormat('5000')).toBe('¥5,000.00');
  });

  it('空输入', async () => {
    expect(await testFormat('')).toBe('');
  });
});

describe('processUserData', () => {
  async function testProcess(data: any): Promise<any> {
    try {
      const { processUserData } = await import('./processor');
      return processUserData(data);
    } catch {
      const { processUserData } = await import('./spaghetti');
      return processUserData(data);
    }
  }

  it('处理完整有效数据', async () => {
    const result = await testProcess({
      name: '张三',
      email: 'zhangsan@example.com',
      phone: '13800138000',
      birthDate: '1990-05-15',
      salary: '15000',
    });

    expect(result.name).toBe('张三');
    expect(result.email).toBe('zhangsan@example.com');
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.age).toBeGreaterThanOrEqual(0);
    expect(result.salaryFormatted).toBe('¥15,000.00');
  });

  it('处理无效数据', async () => {
    const result = await testProcess({
      name: 'A',
      email: 'invalid',
      phone: '123',
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('处理空数据', async () => {
    const result = await testProcess({});
    expect(result.isValid).toBe(false);
    expect(result.name).toBe('');
  });
});
