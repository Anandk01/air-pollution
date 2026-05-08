import { NavLink, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";

const NAV_LINKS = [
  { to: "/",          label: "Chatbot",    icon: "🤖" },
  { to: "/dashboard", label: "Dashboard",  icon: "📊" },
  { to: "/map",       label: "India Map",  icon: "🗺️" },
  { to: "/predict",   label: "Predict",    icon: "🔮" },
  { to: "/alerts",    label: "Alerts",     icon: "🔔" },
  { to: "/upload",    label: "Upload",     icon: "📁" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open,     setOpen]     = useState(false);
  const [apiOk,    setApiOk]    = useState(null);
  const location                = useLocation();
  const { dark, toggle: toggleTheme } = useTheme();

  useEffect(() => setOpen(false), [location]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(d => setApiOk(d.status === "ok"))
      .catch(() => setApiOk(false));
  }, []);

  const navStyle = {
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, height: 68,
    display: "flex", alignItems: "center", padding: "0 24px",
    background: scrolled 
      ? (dark ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.92)")
      : (dark ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.75)"),
    backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
    transition: "all 0.35s ease",
  };

  const linkBase = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 14px", borderRadius: 10,
    fontSize: 14, fontWeight: 500,
    textDecoration: "none", color: "var(--muted)",
    transition: "all 0.2s",
  };

  return (
    <>
      <nav style={navStyle}>
        {/* Logo */}
        <NavLink to="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
          <div className="animate-pulse-glow" style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg,#00d4ff,#4f8ef7)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>AirSight</div>
            <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1 }}>Pollution Forecasting</div>
          </div>
        </NavLink>

        {/* Desktop nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: "auto", marginRight: 16 }}
             className="hidden-mobile">
          {NAV_LINKS.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} style={({ isActive }) => ({
              ...linkBase,
              color:        isActive ? "var(--text)" : "var(--muted)",
              background:   isActive ? "rgba(79,142,247,0.15)" : "transparent",
              borderBottom: isActive ? "1px solid rgba(79,142,247,0.5)" : "1px solid transparent",
            })}>
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="hidden-mobile"
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
            cursor: "pointer", fontSize: 16, marginRight: 10,
            transition: "all 0.2s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
        >
          {dark ? "☀️" : "🌙"}
        </button>

        {/* API status pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
          padding: "5px 12px", borderRadius: 999,
        }} className="hidden-mobile">
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: apiOk === null ? "#f59e0b" : apiOk ? "#22c55e" : "#ef4444",
            boxShadow: `0 0 6px ${apiOk === null ? "#f59e0b" : apiOk ? "#22c55e" : "#ef4444"}`,
          }}/>
          <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)" }}>
            {apiOk === null ? "Checking…" : apiOk ? "API Online" : "API Offline"}
          </span>
        </div>

        {/* Hamburger */}
        <button onClick={() => setOpen(o => !o)} aria-label="menu" className="show-mobile"
          style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 10px", cursor: "pointer", marginLeft: "auto", display: "none",
          }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                display: "block", width: 20, height: 2, background: "var(--text)", borderRadius: 1,
                transform: open && i === 0 ? "rotate(45deg) translate(4px,4px)"
                         : open && i === 2 ? "rotate(-45deg) translate(4px,-4px)" : "none",
                opacity: open && i === 1 ? 0 : 1, transition: "all 0.25s",
              }} />
            ))}
          </div>
        </button>
      </nav>

      {/* Mobile drawer */}
      <div style={{
        position: "fixed", top: 68, left: 0, right: 0, zIndex: 99,
        background: dark ? "rgba(15, 23, 42, 0.97)" : "rgba(255, 255, 255, 0.97)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
        maxHeight: open ? 520 : 0, overflow: "hidden",
        transition: "max-height 0.3s ease",
      }}>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_LINKS.map(l => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} style={({ isActive }) => ({
              ...linkBase, padding: "10px 14px",
              color:      isActive ? "var(--text)" : "var(--muted)",
              background: isActive ? "rgba(79,142,247,0.15)" : "transparent",
            })}>
              <span>{l.icon}</span> {l.label}
            </NavLink>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
      `}</style>
    </>
  );
}
