export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer style={{
      padding: "22px 32px",
      borderTop: "1px solid var(--border)",
      background: "var(--bg-surface)",
      marginTop: "auto",
    }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 12,
      }}>

        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,#00d4ff,#4f8ef7)",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>AirSight</span>
            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 6 }}>
              Smart Air Pollution Forecasting System
            </span>
          </div>
        </div>

        {/* Credit */}
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "right", lineHeight: 1.6 }}>
          Developed by{" "}
          <span style={{ color: "var(--cyan)", fontWeight: 600 }}>JSS MCA College</span>
          {" "}·{" "}
          <span style={{ opacity: 0.55 }}>© {year} All rights reserved</span>
        </div>

      </div>
    </footer>
  );
}
