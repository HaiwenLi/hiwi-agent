import { RawUserData, ProcessedUser } from './types';
import { validateEmail } from './validators/email';
import { validatePhone } from './validators/phone';
import { formatCurrency } from './formatters/number';

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

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const slashMatch = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(dateStr);
  if (slashMatch) return `${slashMatch[1]}-${slashMatch[2]}-${slashMatch[3]}`;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

function calculateAge(birthDate: string): number {
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

function validateName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 20) return false;
  return true;
}

export function processUserData(data: RawUserData): ProcessedUser {
  const errors: string[] = [];
  const name = data.name?.trim() || '';
  const email = data.email?.trim() || '';
  const phone = data.phone?.trim() || '';

  const isNameValid = validateName(name);
  if (!isNameValid) errors.push('Invalid name');

  const isEmailValid = validateEmail(email);
  if (!isEmailValid) errors.push('Invalid email');

  const isPhoneValid = validatePhone(phone);
  if (!isPhoneValid) errors.push('Invalid phone');

  let age = -1;
  if (data.birthDate) {
    age = calculateAge(data.birthDate);
  }

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

export type { RawUserData, ProcessedUser };