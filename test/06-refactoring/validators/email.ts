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