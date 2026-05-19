import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

// ── Password strength ─────────────────────────────────────────────────────────
function getStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: "",          color: "" },
    { label: "Weak",      color: "#ef4444" },
    { label: "Fair",      color: "#f97316" },
    { label: "Good",      color: "#eab308" },
    { label: "Strong",    color: "#22c55e" },
    { label: "Very strong", color: "#10b981" },
  ];
  return { score, ...levels[score] };
}

// ── 6-box OTP input ───────────────────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  const refs = Array.from({ length: 6 }, () => useRef(null));

  const handleKey = (i, e) => {
    if (e.key === "Backspace") {
      if (value[i]) {
        const next = value.split("");
        next[i] = "";
        onChange(next.join(""));
      } else if (i > 0) {
        refs[i - 1].current?.focus();
      }
      return;
    }
    if (e.key === "ArrowLeft" && i > 0) { refs[i - 1].current?.focus(); return; }
    if (e.key === "ArrowRight" && i < 5) { refs[i + 1].current?.focus(); return; }
  };

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, "").slice(-1);
    if (!char) return;
    const next = value.split("").concat(Array(6).fill("")).slice(0, 6);
    next[i] = char;
    onChange(next.join(""));
    if (i < 5) refs[i + 1].current?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) { onChange(pasted.padEnd(6, "").slice(0, 6)); refs[Math.min(pasted.length, 5)].current?.focus(); }
    e.preventDefault();
  };

  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ""}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          style={{
            width: 48, height: 56, textAlign: "center",
            fontSize: 22, fontWeight: 700,
            borderRadius: 12,
            background: value[i] ? "rgba(99,102,241,0.15)" : "var(--bg-card)",
            border: value[i] ? "2px solid var(--blue)" : "1px solid var(--border)",
            color: "var(--text)", outline: "none",
            transition: "all 0.15s",
          }}
        />
      ))}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, error, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </label>
      {children}
      {error && <span style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
function Input({ type = "text", value, onChange, placeholder, autoComplete, suffix }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: "100%", padding: suffix ? "12px 44px 12px 16px" : "12px 16px",
          borderRadius: 10, fontSize: 14,
          background: "var(--bg-card)", border: "1px solid var(--border)",
          color: "var(--text)", outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={e => e.target.style.borderColor = "var(--blue)"}
        onBlur={e => e.target.style.borderColor = "var(--border)"}
      />
      {suffix && (
        <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
          {suffix}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Auth() {
  const [mode,       setMode]       = useState("login");   // "login" | "register" | "verify"
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [otp,        setOtp]        = useState("");
  const [tempUserId, setTempUserId] = useState(null);
  const [devOtp,     setDevOtp]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [resendCd,   setResendCd]   = useState(0);         // resend cooldown seconds
  const [errors,     setErrors]     = useState({});

  const { login, register, verifyOtp, resendOtp } = useAuth();
  const { addToast } = useToast();
  const navigate     = useNavigate();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCd <= 0) return;
    const t = setTimeout(() => setResendCd(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCd]);

  const validate = () => {
    const e = {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email address.";
    if (!password || password.length < 8) e.password = "Password must be at least 8 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    if (mode === "register") {
      const res = await register(email, password);
      if (res.ok) {
        setTempUserId(res.user_id);
        setDevOtp(res.dev_otp || null);
        setMode("verify");
        setResendCd(60);
        addToast(
          res.email_sent ? "Verification code sent to your email." : "Dev mode: check server logs for OTP.",
          res.email_sent ? "success" : "warning",
          6000,
        );
      } else {
        addToast(res.message, "error");
      }
    } else {
      const res = await login(email, password);
      if (res.ok) {
        addToast("Welcome back!", "success");
        navigate(res.has_profile ? "/dashboard" : "/profile");
      } else if (res.needs_verification) {
        setTempUserId(res.user_id);
        setMode("verify");
        setResendCd(60);
        addToast("Please verify your email first.", "warning");
      } else {
        addToast(res.message, "error");
      }
    }
    setLoading(false);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.replace(/\s/g, "").length < 6) {
      addToast("Enter all 6 digits.", "error");
      return;
    }
    setLoading(true);
    const res = await verifyOtp(tempUserId, otp.trim(), email);
    if (res.ok) {
      addToast("Account verified! Welcome to AirSight.", "success");
      navigate("/profile");
    } else {
      addToast(res.message, "error");
      setOtp("");
    }
    setLoading(false);
  };

  const handleResend = async () => {
    if (resendCd > 0 || !tempUserId) return;
    const res = await resendOtp(tempUserId);
    if (res.ok) {
      setDevOtp(res.dev_otp || null);
      setResendCd(60);
      addToast(res.email_sent ? "New code sent." : "Dev mode: check server logs.", "success");
    } else {
      addToast(res.message, "error");
    }
  };

  const strength = mode === "register" ? getStrength(password) : null;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)", padding: 20,
    }} className="mesh-bg">
      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Card */}
        <div className="glass animate-slide-up" style={{ borderRadius: 24, padding: "40px 36px" }}>

          {/* Logo + title */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "linear-gradient(135deg,#00d4ff,#6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 24px rgba(99,102,241,0.4)",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
              {mode === "verify" ? "Check your email" : mode === "login" ? "Welcome back" : "Create account"}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {mode === "verify"
                ? `We sent a 6-digit code to ${email || "your email"}`
                : mode === "login"
                ? "Sign in to your AirSight account"
                : "Start monitoring air quality"}
            </div>
          </div>

          {/* ── Verify step ── */}
          {mode === "verify" ? (
            <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <OtpInput value={otp} onChange={setOtp} />

              {devOtp && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 13, color: "#f59e0b", textAlign: "center" }}>
                  Dev OTP: <strong style={{ letterSpacing: 4 }}>{devOtp}</strong>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otp.replace(/\s/g, "").length < 6}
                className="btn-primary"
                style={{ width: "100%", padding: "13px" }}
              >
                {loading ? "Verifying…" : "Verify & Continue"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                <button
                  type="button"
                  onClick={() => { setMode("login"); setOtp(""); }}
                  style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0 }}
                >
                  ← Back to login
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendCd > 0}
                  style={{
                    background: "none", border: "none", cursor: resendCd > 0 ? "not-allowed" : "pointer",
                    color: resendCd > 0 ? "var(--muted)" : "var(--blue)", fontWeight: 600, padding: 0,
                  }}
                >
                  {resendCd > 0 ? `Resend in ${resendCd}s` : "Resend code"}
                </button>
              </div>
            </form>

          ) : (
          /* ── Login / Register step ── */
            <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Field label="Email" error={errors.email}>
                <Input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: "" })); }}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>

              <Field label="Password" error={errors.password}>
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: "" })); }}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--muted)", padding: 0, lineHeight: 1 }}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? "🙈" : "👁️"}
                    </button>
                  }
                />

                {/* Password strength bar — register only */}
                {mode === "register" && password && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <div key={n} style={{
                          flex: 1, height: 3, borderRadius: 2,
                          background: n <= strength.score ? strength.color : "var(--border)",
                          transition: "background 0.2s",
                        }} />
                      ))}
                    </div>
                    {strength.label && (
                      <span style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>
                        {strength.label}
                      </span>
                    )}
                  </div>
                )}
              </Field>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{ width: "100%", padding: "13px", marginTop: 4 }}
              >
                {loading
                  ? (mode === "login" ? "Signing in…" : "Creating account…")
                  : (mode === "login" ? "Sign in" : "Create account")}
              </button>

              <div style={{ textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}
                {" "}
                <button
                  type="button"
                  onClick={() => { setMode(mode === "login" ? "register" : "login"); setErrors({}); setPassword(""); }}
                  style={{ background: "none", border: "none", color: "var(--blue)", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 13 }}
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Demo credentials hint */}
        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
            Demo: <code style={{ color: "var(--cyan)" }}>admin@air.com</code> / <code style={{ color: "var(--cyan)" }}>123456</code>
          </div>
        )}
      </div>
    </div>
  );
}
