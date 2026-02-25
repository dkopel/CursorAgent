import { useState } from 'react';
import AuthPage from './components/AuthPage';
import SpotMap from './components/SpotMap';
import { logout } from './api';

function loadStoredUser() {
  const stored = localStorage.getItem('spotmap_user');
  const token = localStorage.getItem('spotmap_token');
  if (stored && token) {
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem('spotmap_user');
      localStorage.removeItem('spotmap_token');
    }
  }
  return null;
}

export default function App() {
  const [user, setUser] = useState(loadStoredUser);

  function handleAuth(userData) {
    setUser(userData);
  }

  function handleLogout() {
    logout();
    setUser(null);
  }

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return <SpotMap user={user} onLogout={handleLogout} />;
}
