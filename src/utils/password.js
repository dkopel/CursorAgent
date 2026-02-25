import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

export function validatePassword(password) {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required.'] };
  }

  if (password.length < PASSWORD_RULES.minLength) {
    errors.push(`Password must be at least ${PASSWORD_RULES.minLength} characters long.`);
  }

  if (password.length > PASSWORD_RULES.maxLength) {
    errors.push(`Password must be no more than ${PASSWORD_RULES.maxLength} characters long.`);
  }

  if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }

  if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }

  if (PASSWORD_RULES.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number.');
  }

  if (PASSWORD_RULES.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...).');
  }

  return { valid: errors.length === 0, errors };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export { PASSWORD_RULES };
