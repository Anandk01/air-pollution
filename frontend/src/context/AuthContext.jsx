import { createContext, useContext, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Dummy credentials (replace with real auth later)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_EMAIL    = "admin@air.com";
const VALID_PASSWORD = "123456";
const STORAGE_KEY    = "air_auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Persist across page refresh
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? null; }
    catch { return null; }
  });

  const login = useCallback((email, password) => {
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      const u = { email, name: "Admin", role: "Administrator" };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      setUser(u);
      return { ok: true };
    }
    return { ok: false, message: "Invalid email or password." };
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
