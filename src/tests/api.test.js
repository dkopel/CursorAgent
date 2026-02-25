import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:3001';
let serverProcess;

async function startServer() {
  const { spawn } = await import('child_process');
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['src/server.js'], {
      env: { ...process.env, PORT: '3001', DB_PATH: ':memory:', JWT_SECRET: 'test-secret-key-12345' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let started = false;
    proc.stdout.on('data', (data) => {
      if (data.toString().includes('Server running') && !started) {
        started = true;
        resolve(proc);
      }
    });

    proc.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    setTimeout(() => {
      if (!started) reject(new Error('Server start timeout'));
    }, 10000);
  });
}

async function api(path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

describe('API Integration Tests', () => {
  before(async () => {
    serverProcess = await startServer();
  });

  after(() => {
    if (serverProcess) serverProcess.kill('SIGTERM');
  });

  it('health check returns ok', async () => {
    const { status, data } = await api('/api/health');
    assert.equal(status, 200);
    assert.equal(data.status, 'ok');
  });

  it('registers a new user', async () => {
    const { status, data } = await api('/api/auth/register', 'POST', {
      email: 'test@example.com',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    });
    assert.equal(status, 201);
    assert.equal(data.user.email, 'test@example.com');
    assert.ok(data.user.id);
  });

  it('rejects duplicate email registration', async () => {
    const { status, data } = await api('/api/auth/register', 'POST', {
      email: 'test@example.com',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    });
    assert.equal(status, 409);
    assert.ok(data.error.includes('already exists'));
  });

  it('rejects duplicate email with different case', async () => {
    const { status } = await api('/api/auth/register', 'POST', {
      email: 'TEST@EXAMPLE.COM',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    });
    assert.equal(status, 409);
  });

  it('rejects weak password on registration', async () => {
    const { status, data } = await api('/api/auth/register', 'POST', {
      email: 'weak@example.com',
      password: 'weak',
      confirmPassword: 'weak',
    });
    assert.equal(status, 400);
    assert.ok(data.details.length > 0);
  });

  it('rejects mismatched passwords on registration', async () => {
    const { status, data } = await api('/api/auth/register', 'POST', {
      email: 'mismatch@example.com',
      password: 'StrongPass1!',
      confirmPassword: 'DifferentPass1!',
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes('do not match'));
  });

  it('logs in with correct credentials', async () => {
    const { status, data } = await api('/api/auth/login', 'POST', {
      email: 'test@example.com',
      password: 'StrongPass1!',
    });
    assert.equal(status, 200);
    assert.ok(data.token);
    assert.equal(data.user.email, 'test@example.com');
  });

  it('rejects login with wrong password', async () => {
    const { status, data } = await api('/api/auth/login', 'POST', {
      email: 'test@example.com',
      password: 'WrongPass1!',
    });
    assert.equal(status, 401);
    assert.ok(data.error.includes('Invalid'));
  });

  it('rejects login with nonexistent email', async () => {
    const { status } = await api('/api/auth/login', 'POST', {
      email: 'nobody@example.com',
      password: 'StrongPass1!',
    });
    assert.equal(status, 401);
  });

  it('changes password with valid token', async () => {
    const loginRes = await api('/api/auth/login', 'POST', {
      email: 'test@example.com',
      password: 'StrongPass1!',
    });
    const token = loginRes.data.token;

    const { status, data } = await api('/api/auth/change-password', 'POST', {
      currentPassword: 'StrongPass1!',
      newPassword: 'NewStrong1!@',
      confirmPassword: 'NewStrong1!@',
    }, token);
    assert.equal(status, 200);
    assert.ok(data.message.includes('changed'));

    const newLogin = await api('/api/auth/login', 'POST', {
      email: 'test@example.com',
      password: 'NewStrong1!@',
    });
    assert.equal(newLogin.status, 200);
  });

  it('rejects change-password without auth', async () => {
    const { status } = await api('/api/auth/change-password', 'POST', {
      currentPassword: 'NewStrong1!@',
      newPassword: 'Another1!@',
      confirmPassword: 'Another1!@',
    });
    assert.equal(status, 401);
  });

  it('sends forgot-password without revealing user existence', async () => {
    const existing = await api('/api/auth/forgot-password', 'POST', { email: 'test@example.com' });
    const nonexistent = await api('/api/auth/forgot-password', 'POST', { email: 'nobody@example.com' });
    assert.equal(existing.data.message, nonexistent.data.message);
  });

  it('rejects invalid email on registration', async () => {
    const { status } = await api('/api/auth/register', 'POST', {
      email: 'not-an-email',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    });
    assert.equal(status, 400);
  });
});
