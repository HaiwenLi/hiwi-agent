export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\s|-/g, '');
  if (digits.length !== 11) return false;
  if (!/^\d+$/.test(digits)) return false;
  if (!/^1[3-9]\d{9}$/.test(digits)) return false;
  return true;
}