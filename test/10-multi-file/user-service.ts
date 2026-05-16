import { validateUsername, isEmailUnique } from './utils';

export interface CreateUserInput {
  username: string;
  email: string;
}

export async function createUser(input: CreateUserInput): Promise<{ success: boolean; error?: string }> {
  if (!validateUsername(input.username)) {
    return { success: false, error: 'Invalid username format' };
  }

  const unique = await isEmailUnique(input.email);
  if (!unique) {
    return { success: false, error: 'Email already exists' };
  }

  return { success: true };
}
