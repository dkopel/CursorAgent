const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('spotmap_token');
}

function getHeaders(auth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function register(username, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  localStorage.setItem('spotmap_token', data.token);
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  localStorage.setItem('spotmap_token', data.token);
  return data;
}

export function logout() {
  localStorage.removeItem('spotmap_token');
  localStorage.removeItem('spotmap_user');
}

export async function getDatapoints(lat, lng, radius = 50) {
  const params = new URLSearchParams();
  if (lat != null && lng != null) {
    params.set('lat', lat);
    params.set('lng', lng);
    params.set('radius', radius);
  }
  const res = await fetch(`${API_BASE}/datapoints?${params}`);
  if (!res.ok) throw new Error('Failed to fetch datapoints');
  return res.json();
}

export async function createDatapoint({ type, label, lat, lng, duration, custom_emoji }) {
  const res = await fetch(`${API_BASE}/datapoints`, {
    method: 'POST',
    headers: getHeaders(true),
    body: JSON.stringify({ type, label, lat, lng, duration, custom_emoji }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function deleteDatapoint(id) {
  const res = await fetch(`${API_BASE}/datapoints/${id}`, {
    method: 'DELETE',
    headers: getHeaders(true),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export async function getDatapointTypes() {
  const res = await fetch(`${API_BASE}/datapoints/types`);
  if (!res.ok) throw new Error('Failed to fetch types');
  return res.json();
}
