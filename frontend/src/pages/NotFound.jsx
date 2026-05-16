import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)", flexDirection: "column", gap: 20, textAlign: "center",
      padding: 32, position: "relative", overflow: "hidden",
    }}>
      {/* Background glows */}
      <div style={{
        position: "absolute", top: "20%", left: "15%", width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, #4f8ef7, transparent 70%)",
        opacity: 0.06, filter: "blur(50px)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "20%", right: "15%", width: 250, height: 250, borderRadius: "50%",
        background: "radial-gradient(circle, #a855f7, transparent 70%)",
        opacity: 0.06, filter: "blur(50px)", pointerEvents: "none",
      }} />

      {/* 404 */}
      <div className="animate-slide-up" style={{ zIndex: 1 }}>
        <div style={{
          fontSize: "clamp(80px,15vw,140px)", fontWeight: 900, lineHeight: 1,
          background: "linear-gradient(135deg, #00d4ff, #4f8ef7, #a855f7)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>404</div>
      </div>

      <div className="animate-slide-up" style={{ zIndex: 1, animationDelay: "80ms" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🌫️</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Page Lost in the Smog
        </div>
        <div style={{ fontSize: 14, color: "var(--muted)", maxWidth: 400, lineHeight: 1.7, marginBottom: 28 }}>
          The page you're looking for doesn't exist or has been moved.
          Let's get you back to clear air.
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/">
            <button className="btn-primary">🏠 Go Home</button>
          </Link>
          <Link to="/dashboard">
            <button className="btn-secondary">📊 Dashboard</button>
          </Link>
        </div>
      </div>
    </div>
  );
}
