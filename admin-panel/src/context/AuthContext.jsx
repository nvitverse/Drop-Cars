import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('dc_admin_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((r) => { if (r.data.role === 'admin') setUser(r.data); else logout(); })
      .catch(logout)
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone, password) => {
    const { data } = await api.post('/auth/login', { phone, password });
    if (data.user.role !== 'admin') throw new Error('Not an admin account');
    localStorage.setItem('dc_admin_token', data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('dc_admin_token');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
