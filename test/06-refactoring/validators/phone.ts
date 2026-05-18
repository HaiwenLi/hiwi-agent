export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\s|-/g, '');
  if (digits.length !== 11) return false;
  if (!/^\d+$/.test(digits)) return false;
  if (!digits.startsWith('1')) return false;
  return true;
}