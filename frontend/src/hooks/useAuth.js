import { useState, useCallback } from 'react';
import { TOKEN_KEY } from '../constants';

export function useAuth() {
  const [token, setToken]               = useState(localStorage.getItem(TOKEN_KEY));
  const [mustChangePassword, setMustChange] = useState(false);

  const login = useCallback((t, rt, mustChange = false) => {
    localStorage.setItem(TOKEN_KEY, t);
    if (rt) localStorage.setItem('spid_refresh_token', rt);
    setToken(t);
    setMustChange(mustChange);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMustChange(false);
  }, []);

  const passwordChanged = useCallback(() => setMustChange(false), []);

  return { token, login, logout, mustChangePassword, passwordChanged };
}

export function getUserRole() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role || null;
  } catch { return null; }
}
