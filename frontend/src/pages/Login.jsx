import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login }        = useAuth();
  const navigate         = useNavigate();
  const location         = useLocation();
  const from             = location.state?.from?.pathname ?? "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    setError("");
    // Simulate slight async delay for UX
    await new Promise(r => setTimeout(r, 600));
    const result = login(email, password);
    setLoading(false);
    if (result.ok) {
      navigate(from, { replace: true });
    } else {
      setError(result.message);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)", padding: "24px", position: "relative", overflow: "hidden",
    }}>
      {/* Background orbs */}
      {[
        { top: "10%",  left: "5%",   size: 420, color: "#00d4ff" },
        { bottom: "8%",right: "4%",  size: 320, color: "#a855f7" },
      ].map((o, i) => (
        <div key={i} style={{
          position: "absolute", borderRadius: "50%", pointerEvents: "none",
          width: o.size, height: o.size,
          top: o.top, left: o.left, right: o.right, bottom: o.bottom,
          background: `radial-gradient(circle, ${o.color}, transparent 70%)`,
          opacity: 0.06, filter: "blur(40px)",
        }} />
      ))}

      <div className="animate-slide-up" style={{ width: "100%", maxWidth: 440, zIndex: 1 }}>
        {/* Card */}
        <div className="glass" style={{
          borderRadius: 24, padding: "44px 40px",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}>
          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div className="animate-pulse-glow" style={{
              width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "linear-gradient(135deg,#00d4ff,#4f8ef7)",
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              Sign in to AirSight Dashboard
            </div>
          </div>

          {/* Demo hint */}
          <div style={{
            padding: "10px 14px", borderRadius: 10, marginBottom: 24,
            background: "rgba(79,142,247,0.08)", border: "1px solid rgba(79,142,247,0.2)",
            fontSize: 12, color: "var(--muted)", lineHeight: 1.6,
          }}>
            <span style={{ color: "var(--blue)", fontWeight: 600 }}>Demo credentials:</span>
            {" "}<code style={{ color: "var(--cyan)" }}>admin@air.com</code> / <code style={{ color: "var(--cyan)" }}>123456</code>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              fontSize: 13, color: "#ef4444", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span>❌</span> {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)",
                letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: "50%",
                  transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>
                  ✉️
                </span>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  placeholder="admin@air.com"
                  className="input-field"
                  style={{ width: "100%", paddingLeft: 42, boxSizing: "border-box" }}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)",
                letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 14, top: "50%",
                  transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>
                  🔒
                </span>
                <input
                  id="login-password"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••"
                  className="input-field"
                  style={{ width: "100%", paddingLeft: 42, paddingRight: 44, boxSizing: "border-box" }}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 16, color: "var(--muted)", padding: 2,
                  }}>
                  {showPass ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                width: "100%", padding: "14px", fontSize: 15, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                marginTop: 6,
                opacity: loading ? 0.75 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    animation: "spin 0.75s linear infinite", flexShrink: 0,
                  }} />
                  Signing in…
                </>
              ) : "🔐 Sign In"}
            </button>
          </form>

          {/* Footer note */}
          <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            Smart Air Pollution Forecasting System<br/>
            <span style={{ opacity: 0.6 }}>Protected area — authorised users only</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
