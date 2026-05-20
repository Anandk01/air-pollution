import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard",   icon: "📊", label: "Dashboard"  },
  { to: "/",            icon: "🤖", label: "AI Chatbot", end: true },
  { to: "/safe-routes", icon: "🛡️", label: "Safe Routes" },
  { to: "/alerts",      icon: "🔔", label: "Alerts"      },
  { to: "/map",         icon: "🗺️", label: "India Map"   },
  { to: "/satellite",   icon: "🛰️", label: "Satellite"   },
  { to: "/predict",     icon: "🔮", label: "Predict"     },
  { to: "/anomalies",   icon: "⚠️", label: "Anomalies"   },
  { to: "/upload",      icon: "📁", label: "Upload Data" },
  { to: "/community",   icon: "👥", label: "Community"   },
];

const BOTTOM_ITEMS = [
  { to: "/profile", icon: "👤", label: "Profile" },
  { to: "/admin",   icon: "🔧", label: "Admin"   },
];

const ALL_ITEMS = [...NAV_ITEMS, ...BOTTOM_ITEMS];

export default function AppShell({ children }) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { dark, toggle: toggleTheme } = useTheme();
  const { user, logout, isAuthenticated } = useAuth();
  const [collapsed,    setCollapsed]    = useState(false);
  const [apiOk,        setApiOk]        = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isAuthPage = location.pathname === "/auth";

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.json())
      .then(d => setApiOk(d.status === "ok"))
      .catch(() => setApiOk(false));
  }, []);

  useEffect(() => { setUserMenuOpen(false); }, [location.pathname]);

  if (isAuthPage) return <>{children}</>;

  const sidebarW = collapsed ? 64 : 220;
  const currentPage = ALL_ITEMS.find(n =>
    n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)
  )?.label ?? "AirSight";

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="sidebar" style={{ width: sidebarW }}>
        <div className="sidebar-logo" onClick={() => setCollapsed(c => !c)} title="Toggle sidebar">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {!collapsed && (
            <div className="logo-text">
              <span className="logo-name">AirSight</span>
              <span className="logo-sub">Air Quality</span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          {BOTTOM_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </NavLink>
          ))}

          {!collapsed && (
            <div className="api-status-pill">
              <div className={`status-dot ${apiOk === null ? "amber" : apiOk ? "green" : "red"}`} />
              <span>{apiOk === null ? "Checking…" : apiOk ? "API Online" : "API Offline"}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <div className="shell-main" style={{ marginLeft: sidebarW }}>
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-left">
            <span className="topbar-page">{currentPage}</span>
          </div>
          <div className="topbar-right">
            <button className="icon-btn" onClick={toggleTheme} title={dark ? "Light mode" : "Dark mode"} aria-label="Toggle theme">
              {dark ? "☀️" : "🌙"}
            </button>

            <div style={{ position: "relative" }}>
              <button className="user-btn" onClick={() => setUserMenuOpen(o => !o)} aria-label="User menu">
                <div className="user-avatar">
                  {isAuthenticated ? (user?.email?.[0]?.toUpperCase() ?? "U") : "?"}
                </div>
                {isAuthenticated && <span className="user-name">{user?.email?.split("@")[0]}</span>}
                <span style={{ fontSize: 10, opacity: 0.5 }}>▾</span>
              </button>

              {userMenuOpen && (
                <div className="user-dropdown">
                  {isAuthenticated ? (
                    <>
                      <div className="dropdown-header">
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.email?.split("@")[0]}</div>
                        <div style={{ fontSize: 11, opacity: 0.6 }}>{user?.email}</div>
                      </div>
                      <button className="dropdown-item" onClick={() => navigate("/profile")}>👤 Profile</button>
                      <button className="dropdown-item" onClick={() => navigate("/admin")}>🔧 Admin</button>
                      <div className="dropdown-divider" />
                      <button className="dropdown-item danger" onClick={logout}>🚪 Logout</button>
                    </>
                  ) : (
                    <button className="dropdown-item" onClick={() => navigate("/auth")}>🔑 Login</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
