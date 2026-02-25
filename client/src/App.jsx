import { useState, useEffect } from 'react';
import AuthPage from './components/AuthPage';
import SpotMap from './components/SpotMap';
import { logout } from './api';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('spotmap_user');
    const token = localStorage.getItem('spotmap_token');
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('spotmap_user');
        localStorage.removeItem('spotmap_token');
      }
    }
  }, []);

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
