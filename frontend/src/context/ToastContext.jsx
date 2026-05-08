import { createContext, useContext, useState, useCallback, useRef } from "react";

const ToastContext = createContext(null);

/**
 * Toast types: "success" | "error" | "info" | "warning"
 * Auto-dismisses after `duration` ms (default 4000).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const addToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++counter.current;
    setToasts(t => [...t, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const removeToast = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastStack toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ── Toast stack UI ───────────────────────────────────────────────────────────
const CONFIGS = {
  success: { icon: "✅", color: "#22c55e", bg: "rgba(22,50,30,0.97)",  border: "rgba(34,197,94,0.35)"  },
  error:   { icon: "❌", color: "#ef4444", bg: "rgba(50,16,16,0.97)",  border: "rgba(239,68,68,0.35)"  },
  info:    { icon: "ℹ️", color: "#4f8ef7", bg: "rgba(14,28,60,0.97)",  border: "rgba(79,142,247,0.35)" },
  warning: { icon: "⚠️", color: "#f59e0b", bg: "rgba(50,38,10,0.97)",  border: "rgba(245,158,11,0.35)" },
};

function ToastStack({ toasts, onClose }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10,
      width: "min(360px, calc(100vw - 32px))",
      pointerEvents: "none",
    }}>
      {toasts.map(t => {
        const cfg = CONFIGS[t.type] ?? CONFIGS.info;
        return (
          <div key={t.id} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "14px 16px", borderRadius: 14,
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${cfg.border}`,
            animation: "toast-in 0.35s cubic-bezier(.34,1.56,.64,1) forwards",
            pointerEvents: "auto",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</span>
            <span style={{ fontSize: 13, color: "#fff", lineHeight: 1.55, flex: 1 }}>
              {t.message}
            </span>
            <button onClick={() => onClose(t.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: cfg.color, fontSize: 18, lineHeight: 1,
              opacity: 0.7, padding: "0 0 0 4px", flexShrink: 0, marginTop: -1,
            }}>×</button>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(32px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}
