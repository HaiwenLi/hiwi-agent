import { describe, it, expect } from 'vitest';
import { createUser } from './user-service';
import { displayProduct } from './product-service';
import { processOrder } from './order-service';

describe('user-service (重构后)', () => {
  it('有效用户名', async () => {
    const result = await createUser({ username: 'john_doe', email: 'john@example.com' });
    expect(result.success).toBe(true);
  });

  it('无效用户名', async () => {
    const result = await createUser({ username: 'ab', email: 'john@example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid username');
  });

  it('已存在的邮箱', async () => {
    const result = await createUser({ username: 'new_user', email: 'admin@example.com' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Email already exists');
  });
});

describe('product-service (重构后)', () => {
  it('有效 SKU', () => {
    const result = displayProduct({ sku: 'ABC-123', name: 'Widget', price: 29.99 });
    expect(result).toContain('Widget');
    expect(result).toContain('ABC-123');
    expect(result).toContain('¥');
  });

  it('无效 SKU 抛出错误', () => {
    expect(() => displayProduct({ sku: '!@#', name: 'Bad', price: 10 })).toThrow('Invalid SKU');
  });
});

describe('order-service (重构后)', () => {
  it('成功处理订单', () => {
    const result = processOrder({
      items: [
        { sku: 'ABC-123', quantity: 2, price: 50 },
        { sku: 'TEE-001', quantity: 1, price: 100 },
      ],
      orderDate: new Date('2026-05-16'),
      customerEmail: 'test@example.com',
    });

    expect(result.success).toBe(true);
    expect(result.total).toContain('¥');
    expect(result.errors).toEqual([]);
  });

  it('库存不足', () => {
    const result = processOrder({
      items: [{ sku: 'XYZ-999', quantity: 1, price: 10 }],
      orderDate: new Date(),
      customerEmail: 'test@example.com',
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('无效 SKU', () => {
    const result = processOrder({
      items: [{ sku: 'BAD', quantity: 1, price: 10 }],
      orderDate: new Date(),
      customerEmail: 'test@example.com',
    });

    expect(result.success).toBe(false);
  });
});
