import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const AuthContext = createContext(null);
const STORAGE_KEY = "airsight_auth";

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);  // { id, email, token, has_profile }
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage and validate token on mount
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setLoading(false); return; }

    try {
      const saved = JSON.parse(raw);
      // Validate token is still alive before trusting it
      axios.get("/api/auth/me", {
        headers: { Authorization: `Bearer ${saved.token}` },
      }).then(({ data }) => {
        setUser({ ...saved, has_profile: data.has_profile });
      }).catch(() => {
        // Token expired or invalid — clear session silently
        localStorage.removeItem(STORAGE_KEY);
      }).finally(() => setLoading(false));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    }
  }, []);

  const _persist = (session) => {
    setUser(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  };

  const login = useCallback(async (email, password) => {
    try {
      const { data } = await axios.post("/api/auth/login", { email, password });
      _persist({ id: data.user_id, email, token: data.token, has_profile: data.has_profile });
      return { ok: true, has_profile: data.has_profile };
    } catch (err) {
      const d = err.response?.data || {};
      return { ok: false, message: d.error || "Login failed.", ...d };
    }
  }, []);

  const register = useCallback(async (email, password) => {
    try {
      const { data } = await axios.post("/api/auth/register", { email, password });
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, message: err.response?.data?.error || "Registration failed." };
    }
  }, []);

  const verifyOtp = useCallback(async (user_id, otp, email) => {
    try {
      const { data } = await axios.post("/api/auth/verify-otp", { user_id, otp });
      _persist({ id: user_id, email, token: data.token, has_profile: false });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.response?.data?.error || "Verification failed." };
    }
  }, []);

  const resendOtp = useCallback(async (user_id) => {
    try {
      const { data } = await axios.post("/api/auth/resend-otp", { user_id });
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, message: err.response?.data?.error || "Failed to resend code." };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("user_profile");
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, verifyOtp, resendOtp, logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
