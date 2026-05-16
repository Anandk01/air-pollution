export default function PageHeader({ title, subtitle, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      flexWrap: "wrap", gap: 16, marginBottom: 32,
    }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: "var(--muted)" }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>}
    </div>
  );
}
