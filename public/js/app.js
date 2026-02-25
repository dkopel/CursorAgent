function showAlert(containerId, message, type) {
  const alert = document.getElementById(containerId);
  if (!alert) return;
  alert.className = `alert alert-${type} show`;
  alert.textContent = message;
}

function hideAlert(containerId) {
  const alert = document.getElementById(containerId);
  if (!alert) return;
  alert.className = 'alert';
}

function checkPasswordStrength(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { level: 'weak', color: '#dc2626', width: '25%' };
  if (score <= 3) return { level: 'fair', color: '#f59e0b', width: '50%' };
  if (score <= 4) return { level: 'good', color: '#16a34a', width: '75%' };
  return { level: 'strong', color: '#059669', width: '100%' };
}

function updatePasswordRequirements(password, container) {
  if (!container) return;
  const checks = [
    { test: password.length >= 8, text: '8+ characters' },
    { test: /[A-Z]/.test(password), text: 'Uppercase letter' },
    { test: /[a-z]/.test(password), text: 'Lowercase letter' },
    { test: /[0-9]/.test(password), text: 'Number' },
    { test: /[^A-Za-z0-9]/.test(password), text: 'Special character' },
  ];

  container.innerHTML = checks
    .map(c => `<span class="${c.test ? 'met' : 'unmet'}">${c.test ? '✓' : '○'} ${c.text}</span>`)
    .join(' &nbsp; ');
}

function updateStrengthBar(password, barFill, textEl) {
  if (!barFill || !textEl) return;
  if (!password) {
    barFill.style.width = '0';
    textEl.textContent = '';
    return;
  }
  const strength = checkPasswordStrength(password);
  barFill.style.width = strength.width;
  barFill.style.backgroundColor = strength.color;
  textEl.textContent = `Strength: ${strength.level}`;
  textEl.style.color = strength.color;
}

function getToken() {
  return localStorage.getItem('auth_token');
}

function getUser() {
  const u = localStorage.getItem('auth_user');
  return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_user', JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
}

async function apiCall(url, method, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
