import { validateSku, formatPrice } from './utils';

export interface ProductInfo {
  sku: string;
  name: string;
  price: number;
}

export function displayProduct(product: ProductInfo): string {
  if (!validateSku(product.sku)) {
    throw new Error(`Invalid SKU: ${product.sku}`);
  }

  const price = formatPrice(product.price);
  return `${product.name} (${product.sku}) — ${price}`;
}
