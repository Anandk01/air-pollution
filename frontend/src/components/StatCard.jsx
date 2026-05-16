export default function StatCard({ id, icon, label, value, sub, color = "#4f8ef7", trend, delay = 0 }) {
  const glow = color + "25";
  return (
    <div id={id} className="animate-slide-up glass" style={{
      animationDelay: `${delay}ms`,
      borderRadius: 18,
      padding: "22px 24px",
      border: `1px solid ${color}22`,
      boxShadow: `0 8px 32px ${glow}`,
      transition: "transform 0.25s ease, box-shadow 0.25s ease",
      cursor: "default",
      position: "relative",
      overflow: "hidden",
    }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = `0 16px 48px ${color}30`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = `0 8px 32px ${glow}`;
      }}
    >
      {/* bg accent */}
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 100, height: 100, borderRadius: "50%",
        background: color, opacity: 0.06, filter: "blur(20px)",
      }}/>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, background: `${color}18`, border: `1px solid ${color}30`,
        }}>
          {icon}
        </div>
        {trend && (
          <div className="badge" style={{
            background: trend > 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: trend > 0 ? "#22c55e" : "#ef4444",
          }}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </div>
        )}
      </div>

      <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
    </div>
  );
}
