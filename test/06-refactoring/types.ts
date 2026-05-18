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