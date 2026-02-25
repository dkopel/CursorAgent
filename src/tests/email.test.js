import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEmail } from '../utils/email.js';

describe('Email Validation', () => {
  it('rejects empty email', () => {
    const result = validateEmail('');
    assert.equal(result.valid, false);
  });

  it('rejects null email', () => {
    const result = validateEmail(null);
    assert.equal(result.valid, false);
  });

  it('rejects email without @', () => {
    const result = validateEmail('invalidemail.com');
    assert.equal(result.valid, false);
  });

  it('rejects email without domain', () => {
    const result = validateEmail('user@');
    assert.equal(result.valid, false);
  });

  it('rejects email without TLD', () => {
    const result = validateEmail('user@domain');
    assert.equal(result.valid, false);
  });

  it('accepts valid email', () => {
    const result = validateEmail('user@example.com');
    assert.equal(result.valid, true);
    assert.equal(result.normalized, 'user@example.com');
  });

  it('normalizes email to lowercase', () => {
    const result = validateEmail('User@Example.COM');
    assert.equal(result.valid, true);
    assert.equal(result.normalized, 'user@example.com');
  });

  it('trims whitespace', () => {
    const result = validateEmail('  user@example.com  ');
    assert.equal(result.valid, true);
    assert.equal(result.normalized, 'user@example.com');
  });

  it('accepts email with subdomain', () => {
    const result = validateEmail('user@mail.example.com');
    assert.equal(result.valid, true);
  });

  it('accepts email with plus addressing', () => {
    const result = validateEmail('user+tag@example.com');
    assert.equal(result.valid, true);
  });

  it('rejects overly long email', () => {
    const longEmail = 'a'.repeat(250) + '@b.com';
    const result = validateEmail(longEmail);
    assert.equal(result.valid, false);
  });
});
