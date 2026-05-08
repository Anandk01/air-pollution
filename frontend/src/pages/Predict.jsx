import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import PageHeader from "../components/PageHeader";

// ── AQI config ─────────────────────────────────────────────────────────────
const AQI_CONFIG = {
  "Good":         { icon: "🟢", color: "#22c55e", bg: "rgba(34,197,94,0.10)",  border: "rgba(34,197,94,0.30)"  },
  "Satisfactory": { icon: "🟡", color: "#84cc16", bg: "rgba(132,204,22,0.10)", border: "rgba(132,204,22,0.30)" },
  "Moderate":     { icon: "🟠", color: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.30)" },
  "Poor":         { icon: "🔴", color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.30)" },
  "Very Poor":    { icon: "🔴", color: "#ef4444", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.30)"  },
  "Severe":       { icon: "⚫", color: "#a855f7", bg: "rgba(168,85,247,0.10)", border: "rgba(168,85,247,0.30)" },
};

const AQI_SCALE = [
  { label: "Good",         range: "0–30",    color: "#22c55e" },
  { label: "Satisfactory", range: "31–60",   color: "#84cc16" },
  { label: "Moderate",     range: "61–90",   color: "#f59e0b" },
  { label: "Poor",         range: "91–120",  color: "#f97316" },
  { label: "Very Poor",    range: "121–250", color: "#ef4444" },
  { label: "Severe",       range: "250+",    color: "#a855f7" },
];

const HORIZONS = [
  { value: 1,  label: "Next 1 Hour",   icon: "⚡" },
  { value: 6,  label: "Next 6 Hours",  icon: "🕐" },
  { value: 24, label: "Next 24 Hours", icon: "📅" },
];

// ── Gauge ring ─────────────────────────────────────────────────────────────
function GaugeRing({ pm25, aqi, color }) {
  const MAX  = 350;
  const pct  = Math.min(pm25 / MAX, 1);
  const SIZE = 160;
  const STROKE = 14;
  const R    = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const dash = CIRC * pct;

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "0 auto 8px" }}>
      <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle cx={SIZE/2} cy={SIZE/2} r={R}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
        {/* Progress */}
        <circle cx={SIZE/2} cy={SIZE/2} r={R}
          fill="none" stroke={color} strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRC}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      {/* Center text */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{pm25}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>µg/m³</div>
        <div style={{ fontSize: 10, color, fontWeight: 700, marginTop: 4,
          background: `${color}18`, padding: "2px 8px", borderRadius: 999 }}>
          {aqi}
        </div>
      </div>
    </div>
  );
}

// ── Result card ────────────────────────────────────────────────────────────
function ResultCard({ data, hoursLabel }) {
  const cfg = AQI_CONFIG[data.aqi_status] ?? AQI_CONFIG["Moderate"];

  return (
    <div className="glass animate-slide-up" style={{
      borderRadius: 24, overflow: "hidden",
      border: `1px solid ${cfg.border}`,
      boxShadow: `0 20px 60px ${cfg.color}18`,
    }}>
      {/* Header bar */}
      <div style={{
        padding: "16px 24px",
        background: cfg.bg,
        borderBottom: `1px solid ${cfg.border}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 22 }}>🔮</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>
            Prediction Complete
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Forecast for {hoursLabel} · Model: {data.model}
          </div>
        </div>
      </div>

      {/* Gauge */}
      <div style={{ padding: "28px 24px 16px", textAlign: "center" }}>
        <GaugeRing pm25={data.predicted_pm25} aqi={data.aqi_status} color={cfg.color} />

        {/* AQI badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 20px", borderRadius: 999, marginBottom: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
        }}>
          <span style={{ fontSize: 16 }}>{cfg.icon}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: cfg.color }}>
            {data.aqi_status}
          </span>
        </div>

        {/* Detail pills */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
          marginBottom: 8,
        }}>
          {[
            { label: "Predicted PM2.5", value: `${data.predicted_pm25} µg/m³`, icon: "🌫️" },
            { label: "Last Known PM2.5",value: `${data.last_known_pm25} µg/m³`, icon: "📌" },
            { label: "Hours Ahead",     value: `${data.hours_ahead}h`,          icon: "⏱️" },
            { label: "Model Used",      value: data.model,                      icon: "🤖" },
          ].map(item => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              borderRadius: 12, padding: "12px 14px", textAlign: "left",
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3,
                textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, wordBreak: "break-word" }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────
function ErrorToast({ message, onClose }) {
  return (
    <div className="animate-slide-up" style={{
      display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
      borderRadius: 14, padding: "14px 18px", marginBottom: 20,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ fontSize: 18 }}>❌</span>
        <span style={{ fontSize: 14, color: "#ef4444", fontWeight: 500 }}>{message}</span>
      </div>
      <button onClick={onClose} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#ef4444", fontSize: 18, opacity: 0.7, padding: 0,
      }}>×</button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Predict() {
  const [hoursAhead, setHoursAhead] = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);

  const selectedHorizon = HORIZONS.find(h => h.value === hoursAhead);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await axios.post("/api/predict",
        { hours_ahead: hoursAhead },
        { headers: { "Content-Type": "application/json" }, timeout: 30_000 }
      );
      if (data.success) {
        setResult(data);
      } else {
        setError(data.message || "Prediction failed.");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ??
        (err.response?.status === 404
          ? "Model not trained yet. Go to Train page first."
          : err.code === "ECONNABORTED"
          ? "Request timed out."
          : "Cannot connect to Flask API. Make sure it is running.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell" style={{ background: "var(--bg-base)" }}>
      <div className="admin-main">
        <PageHeader
          title="Predict AQI"
          subtitle="Forecast PM2.5 concentration using the trained ML model"
        />

        {error && <ErrorToast message={error} onClose={() => setError(null)} />}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}
             className="predict-grid">

          {/* ── Left: Controls ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Horizon selector */}
            <div className="glass animate-slide-up" style={{ borderRadius: 20, padding: "28px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                🕐 Select Forecast Horizon
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
                Choose how far ahead you want to predict PM2.5 levels
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {HORIZONS.map(h => {
                  const active = h.value === hoursAhead;
                  return (
                    <button
                      key={h.value}
                      onClick={() => { setHoursAhead(h.value); setResult(null); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        padding: "16px 20px", borderRadius: 14, cursor: "pointer",
                        textAlign: "left", transition: "all 0.2s ease",
                        background: active ? "rgba(79,142,247,0.12)" : "rgba(255,255,255,0.03)",
                        border: active ? "1px solid rgba(79,142,247,0.4)" : "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    >
                      <span style={{
                        fontSize: 22, width: 44, height: 44, borderRadius: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: active ? "rgba(79,142,247,0.18)" : "rgba(255,255,255,0.05)",
                        flexShrink: 0,
                      }}>{h.icon}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: active ? 700 : 500 }}>
                          {h.label}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          Predict {h.value === 1 ? "1 step" : `${h.value * 4} steps`} ahead
                          {" · "}using rolling lag features
                        </div>
                      </div>
                      {active && (
                        <div style={{ marginLeft: "auto", color: "var(--blue)", fontSize: 18 }}>✓</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Predict button */}
            <button
              className="btn-primary"
              onClick={handlePredict}
              disabled={loading}
              style={{
                width: "100%", padding: "16px", fontSize: 16, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                opacity: loading ? 0.7 : 1, cursor: loading ? "not-allowed" : "pointer",
                borderRadius: 14,
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%",
                    border: "2.5px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    animation: "spin 0.75s linear infinite", flexShrink: 0,
                  }} />
                  Predicting…
                </>
              ) : (
                `🔮 Predict for ${selectedHorizon?.label}`
              )}
            </button>

            {/* Info card */}
            <div className="glass" style={{ borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                ⚙️ How It Works
              </div>
              {[
                "Loads the best trained model (XGBoost / RF / LR)",
                "Reads last 24 PM2.5 readings from your dataset",
                "Builds lag1, lag2, lag24, rolling_mean_24 features",
                "Rolls forward step-by-step (15-min intervals)",
                "Returns final PM2.5 at the requested horizon",
              ].map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12,
                  color: "var(--muted)", lineHeight: 1.6, marginBottom: 7 }}>
                  <span style={{ color: "var(--cyan)", flexShrink: 0 }}>{i + 1}.</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Result / Placeholder ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {result ? (
              <ResultCard data={result} hoursLabel={selectedHorizon?.label} />
            ) : (
              /* Placeholder */
              <div className="glass" style={{
                borderRadius: 24, padding: "48px 32px", textAlign: "center",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div className="animate-float" style={{ fontSize: 56, marginBottom: 16 }}>🔮</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                  Ready to Forecast
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7 }}>
                  Select a horizon and click <strong>Predict</strong> to see PM2.5 forecast using your trained model.
                </div>
                {/* Tips */}
                <div style={{
                  marginTop: 28, padding: "14px", borderRadius: 14,
                  background: "rgba(79,142,247,0.06)", border: "1px solid rgba(79,142,247,0.15)",
                  textAlign: "left",
                }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10,
                    fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Prerequisites
                  </div>
                  {[
                    ["📤", "CSV uploaded",    "/upload"],
                    ["🤖", "Model trained",   "/train"],
                  ].map(([icon, label, path]) => (
                    <Link key={path} to={path} style={{ textDecoration: "none" }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 10px", borderRadius: 10, marginBottom: 6,
                        background: "rgba(255,255,255,0.03)", cursor: "pointer",
                        transition: "background 0.2s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                      >
                        <span style={{ fontSize: 16 }}>{icon}</span>
                        <span style={{ fontSize: 13, color: "var(--blue)", fontWeight: 500 }}>{label}</span>
                        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* AQI scale reference */}
            <div className="glass" style={{ borderRadius: 20, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
                🎯 PM2.5 AQI Scale
              </div>
              {AQI_SCALE.map(s => (
                <div key={s.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.range} µg/m³</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (max-width: 860px) {
            .predict-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
