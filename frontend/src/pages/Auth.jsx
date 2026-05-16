import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useNavigate } from "react-router-dom";

export default function Auth() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("form"); // "form", "verify"
  const [tempUserId, setTempUserId] = useState(null);
  const [loading, setLoading] = useState(false);

  const { login, register, verifyOtp } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (isRegister) {
      const res = await register(email, password);
      if (res.ok) {
        setTempUserId(res.user_id);
        setStep("verify");
        if (res.email_sent) {
          addToast("Verification code sent to your email!", "success");
        } else {
          addToast("Email delivery failed. Code has been logged to the server terminal.", "warning", 8000);
        }
      } else {
        addToast(res.message, "error");
      }
    } else {
      const res = await login(email, password);
      if (res.ok) {
        addToast("Logged in successfully!", "success");
        if (res.has_profile) navigate("/dashboard");
        else navigate("/profile"); // Force profile onboarding
      } else {
        addToast(res.message, "error");
      }
    }
    setLoading(false);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await verifyOtp(tempUserId, otp, email);
    if (res.ok) {
      addToast("Account verified!", "success");
      navigate("/profile"); // Proceed to onboarding
    } else {
      addToast(res.message, "error");
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)", padding: 20
    }} className="mesh-bg">
      <div className="glass animate-slide-up" style={{
        maxWidth: 420, width: "100%", padding: 40, borderRadius: 32, textAlign: "center"
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🌍</div>
        <h1 style={{ marginBottom: 8, fontSize: 24, fontWeight: 900 }}>
          {step === "verify" ? "Verify Account" : (isRegister ? "Create Account" : "Welcome Back")}
        </h1>
        <p style={{ color: "var(--muted)", marginBottom: 32, fontSize: 14 }}>
          {step === "verify" ? "Enter the 6-digit code sent to your email." : "Access personalized air quality intelligence."}
        </p>

        {step === "form" ? (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ textAlign: "left" }}>
              <label style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>EMAIL</label>
              <input 
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: "100%", padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)", color: "var(--text)", outline: "none", marginTop: 6
                }}
              />
            </div>
            <div style={{ textAlign: "left" }}>
              <label style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>PASSWORD</label>
              <input 
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%", padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)", color: "var(--text)", outline: "none", marginTop: 6
                }}
              />
            </div>
            <button disabled={loading} className="btn-primary" style={{ width: "100%", padding: 16, marginTop: 10 }}>
              {loading ? "Please wait..." : (isRegister ? "Register" : "Login")}
            </button>
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
              {isRegister ? "Already have an account?" : "New to AirSight?"} 
              <span onClick={() => setIsRegister(!isRegister)} style={{ color: "var(--blue)", cursor: "pointer", marginLeft: 6, fontWeight: 700 }}>
                {isRegister ? "Login here" : "Register here"}
              </span>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <input 
              type="text" required maxLength="6" value={otp} onChange={e => setOtp(e.target.value)}
              placeholder="000000"
              style={{
                width: "100%", padding: "20px", borderRadius: 14, background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border)", color: "var(--text)", outline: "none", fontSize: 24, textAlign: "center", letterSpacing: 10
              }}
            />
            <button disabled={loading} className="btn-primary" style={{ width: "100%", padding: 16 }}>
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>
            <span onClick={() => setStep("form")} style={{ color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>Go back</span>
          </form>
        )}
      </div>
    </div>
  );
}
