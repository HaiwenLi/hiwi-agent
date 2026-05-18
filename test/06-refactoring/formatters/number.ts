export function formatCurrency(amount: string | number): string {
  if (amount === undefined || amount === null || amount === '') return '';

  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '';

  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `¥${formattedInt}.${decPart}`;
}