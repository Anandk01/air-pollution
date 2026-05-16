import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();
const STORAGE_KEY = "air_auth_session";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // { id, email, token, has_profile }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await axios.post('/api/auth/login', { email, password });
      const session = { id: data.user_id, email, token: data.token, has_profile: data.has_profile };
      setUser(session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, message: err.response?.data?.error || "Login failed" };
    }
  }, []);

  const register = useCallback(async (email, password) => {
    try {
      const { data } = await axios.post('/api/auth/register', { email, password });
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, message: err.response?.data?.error || "Registration failed" };
    }
  }, []);

  const verifyOtp = useCallback(async (user_id, otp, email) => {
    try {
      const { data } = await axios.post('/api/auth/verify-otp', { user_id, otp });
      const session = { id: user_id, email, token: data.token, has_profile: false };
      setUser(session);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.response?.data?.error || "Verification failed" };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('user_profile'); // Also clear profile cache
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyOtp, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
