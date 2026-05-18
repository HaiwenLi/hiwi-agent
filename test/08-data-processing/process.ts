import { readFileSync, writeFileSync } from 'fs';

const csv = readFileSync('test/08-data-processing/data.csv', 'utf-8');
const lines = csv.trim().split('\n');
const headers = lines[0].split(',');

const data: Record<string, string>[] = [];
for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',');
  const row: Record<string, string> = {};
  headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
  data.push(row);
}

// Filter
const filtered = data.filter(r =>
  r.status !== 'cancelled' &&
  Number(r.price) >= 0 &&
  Number(r.quantity) >= 0 &&
  r.product.trim() !== ''
);

// Transform
const cleaned = filtered.map(r => {
  const total = Number(r.price) * Number(r.quantity);
  const formattedPrice = `¥${Number(r.price).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [y, m, d] = r.order_date.split('-');
  const formattedDate = `${y}年${m}月${d}日`;
  return { ...r, total, price: formattedPrice, order_date: formattedDate };
});

// Save cleaned data
writeFileSync('test/08-data-processing/cleaned-data.json', JSON.stringify(cleaned, null, 2));

// Group by category
const groups: Record<string, typeof cleaned> = {};
cleaned.forEach(r => {
  if (!groups[r.category]) groups[r.category] = [];
  groups[r.category].push(r);
});

const summary: Record<string, any> = {};
Object.entries(groups).forEach(([cat, rows]) => {
  const totalSales = rows.reduce((s, r) => s + Number(r.total), 0);
  const orderCount = rows.length;
  const avgAmount = totalSales / orderCount;
  const productSales: Record<string, number> = {};
  rows.forEach(r => { productSales[r.product] = (productSales[r.product] || 0) + Number(r.total); });
  const topProduct = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  summary[cat] = { totalSales, orderCount, avgAmount: avgAmount.toFixed(2), topProduct };
});

writeFileSync('test/08-data-processing/summary.json', JSON.stringify(summary, null, 2));
console.log('Done: cleaned-data.json and summary.json created');