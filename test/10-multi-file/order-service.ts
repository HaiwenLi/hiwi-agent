import { validateSku, checkStock, formatPrice, formatDate } from './utils';

export interface OrderItem {
  sku: string;
  quantity: number;
  price: number;
}

export interface Order {
  items: OrderItem[];
  orderDate: Date;
  customerEmail: string;
}

export function processOrder(order: Order): { success: boolean; total?: string; errors: string[] } {
  const errors: string[] = [];

  for (const item of order.items) {
    if (!validateSku(item.sku)) {
      errors.push(`Invalid SKU: ${item.sku}`);
      continue;
    }

    const stock = checkStock(item.sku, item.quantity);
    if (!stock.available) {
      errors.push(`Insufficient stock for ${item.sku}: requested ${item.quantity}, available ${stock.currentStock}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const orderDate = formatDate(order.orderDate);

  return {
    success: true,
    total: formatPrice(total),
    errors: [],
  };
}
