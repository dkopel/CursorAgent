import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePassword, hashPassword, verifyPassword } from '../utils/password.js';

describe('Password Validation', () => {
  it('rejects empty password', () => {
    const result = validatePassword('');
    assert.equal(result.valid, false);
  });

  it('rejects null password', () => {
    const result = validatePassword(null);
    assert.equal(result.valid, false);
  });

  it('rejects short password', () => {
    const result = validatePassword('Ab1!');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('8 characters')));
  });

  it('rejects password without uppercase', () => {
    const result = validatePassword('abcdefg1!');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('uppercase')));
  });

  it('rejects password without lowercase', () => {
    const result = validatePassword('ABCDEFG1!');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('lowercase')));
  });

  it('rejects password without number', () => {
    const result = validatePassword('Abcdefgh!');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('number')));
  });

  it('rejects password without special character', () => {
    const result = validatePassword('Abcdefg1');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('special character')));
  });

  it('accepts valid password', () => {
    const result = validatePassword('StrongPass1!');
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('accepts complex password', () => {
    const result = validatePassword('MyP@ssw0rd!2024');
    assert.equal(result.valid, true);
  });

  it('rejects password exceeding max length', () => {
    const longPass = 'A'.repeat(129) + 'a1!';
    const result = validatePassword(longPass);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('128')));
  });
});

describe('Password Hashing', () => {
  it('hashes a password', async () => {
    const hash = await hashPassword('StrongPass1!');
    assert.ok(hash);
    assert.notEqual(hash, 'StrongPass1!');
    assert.ok(hash.startsWith('$2'));
  });

  it('produces different hashes for same password', async () => {
    const hash1 = await hashPassword('StrongPass1!');
    const hash2 = await hashPassword('StrongPass1!');
    assert.notEqual(hash1, hash2);
  });

  it('verifies correct password', async () => {
    const hash = await hashPassword('StrongPass1!');
    const valid = await verifyPassword('StrongPass1!', hash);
    assert.equal(valid, true);
  });

  it('rejects incorrect password', async () => {
    const hash = await hashPassword('StrongPass1!');
    const valid = await verifyPassword('WrongPass1!', hash);
    assert.equal(valid, false);
  });
});
