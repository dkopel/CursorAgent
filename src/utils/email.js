export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required.' };
  }

  const trimmed = email.trim().toLowerCase();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Email is required.' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email address is too long.' };
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please provide a valid email address.' };
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) {
    return { valid: false, error: 'Please provide a valid email address.' };
  }

  return { valid: true, normalized: trimmed };
}
