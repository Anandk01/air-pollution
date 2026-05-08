import { useState } from "react";
import axios from "axios";
import PageHeader from "../components/PageHeader";
import { useToast } from "../context/ToastContext";

// ─────────────────────────────────────────────────────────────────────────────
// AQI category config — color values match shared AQI_COLORS constants
// Additional properties (bg, border, icon, grade) are local to this page.
// ─────────────────────────────────────────────────────────────────────────────
const AQI_CONFIG = {
  "Good":        { color: "#00b050",  bg: "rgba(0,176,80,0.12)",    border: "rgba(0,176,80,0.3)",    icon: "🟢", grade: "A" },
  "Satisfactory":{ color: "#92d050",  bg: "rgba(146,208,80,0.12)",  border: "rgba(146,208,80,0.3)",  icon: "🔵", grade: "B" },
  "Moderate":    { color: "#ffbf00",  bg: "rgba(255,191,0,0.12)",   border: "rgba(255,191,0,0.3)",   icon: "🟡", grade: "C" },
  "Poor":        { color: "#ff0000",  bg: "rgba(255,0,0,0.12)",     border: "rgba(255,0,0,0.3)",     icon: "🟠", grade: "D" },
  "Very Poor":   { color: "#7030a0",  bg: "rgba(112,48,160,0.12)",  border: "rgba(112,48,160,0.3)",  icon: "🔴", grade: "E" },
  "Severe":      { color: "#c00000",  bg: "rgba(192,0,0,0.14)",     border: "rgba(192,0,0,0.4)",     icon: "⚫", grade: "F" },
};
const getAqiCfg = (cat) => AQI_CONFIG[cat] ?? AQI_CONFIG["Moderate"];

// Maps short API keys → human-readable labels
const LABEL_MAP = {
  pm25: "PM2.5", pm10: "PM10", no2: "NO₂",
  so2:  "SO₂",   co:   "CO",   o3:  "O₃",
};
const toLabel = (key) => LABEL_MAP[key] ?? key.toUpperCase();



// ─────────────────────────────────────────────────────────────────────────────
// Pollutant definitions
// ─────────────────────────────────────────────────────────────────────────────
const POLLUTANTS = [
  { key: "pm25", label: "PM2.5",  unit: "µg/m³", icon: "💨", hint: "Fine particulate matter < 2.5µm", min: 0, max: 500,  step: 0.1 },
  { key: "pm10", label: "PM10",   unit: "µg/m³", icon: "🌫️", hint: "Coarse particulate matter < 10µm", min: 0, max: 1000, step: 1   },
  { key: "no2",  label: "NO₂",    unit: "µg/m³", icon: "🏭", hint: "Nitrogen dioxide from combustion",  min: 0, max: 1000, step: 0.1 },
  { key: "so2",  label: "SO₂",    unit: "µg/m³", icon: "🔥", hint: "Sulphur dioxide, industrial emissions", min: 0, max: 2000, step: 0.1 },
  { key: "co",   label: "CO",     unit: "mg/m³", icon: "🚗", hint: "Carbon monoxide from traffic",     min: 0, max: 100,  step: 0.01 },
  { key: "o3",   label: "O₃",     unit: "µg/m³", icon: "☀️", hint: "Ozone formed by sunlight + NOx",  min: 0, max: 1000, step: 0.1 },
];

const DEFAULTS = { pm25: 90, pm10: 140, no2: 45, so2: 18, co: 1.4, o3: 32 };

// ─────────────────────────────────────────────────────────────────────────────
// Sub-index gauge bar
// ─────────────────────────────────────────────────────────────────────────────
function SubBar({ label, value, max = 500 }) {
  const pct   = Math.min(100, (value / max) * 100);
  const color = value <= 50  ? "#00b050"
              : value <= 100 ? "#92d050"
              : value <= 200 ? "#ffbf00"
              : value <= 300 ? "#ff0000"
              : value <= 400 ? "#7030a0"
              :                "#c00000";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99, width: `${pct}%`,
          background: color,
          transition: "width 0.8s cubic-bezier(.34,1.3,.64,1)",
          boxShadow: `0 0 8px ${color}80`,
        }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AQI circular score
// ─────────────────────────────────────────────────────────────────────────────
function AQIGauge({ aqi, category }) {
  const cfg = getAqiCfg(category);
  const pct = Math.min(100, aqi / 5); // 500 → 100%
  const r = 54, cx = 64, cy = 64;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 128, height: 128 }}>
        <svg width="128" height="128" style={{ transform: "rotate(-90deg)" }}>
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle cx={cx} cy={cy} r={r} fill="none"
            stroke={cfg.color} strokeWidth="10"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s cubic-bezier(.34,1.3,.64,1)", filter: `drop-shadow(0 0 8px ${cfg.color}80)` }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: cfg.color, lineHeight: 1 }}>{aqi}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>AQI</div>
        </div>
      </div>
      <span style={{
        padding: "4px 16px", borderRadius: 999, fontSize: 13, fontWeight: 700,
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
      }}>
        {cfg.icon} {category}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function ParameterAnalyzer() {
  const [values,  setValues]  = useState(DEFAULTS);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const { addToast } = useToast();

  const handleChange = (key, val) => {
    setValues(v => ({ ...v, [key]: val }));
    if (result) setResult(null);
    if (error)  setError("");
  };

  const handleAnalyze = async () => {
    // Basic client-side validation
    for (const p of POLLUTANTS) {
      const v = parseFloat(values[p.key]);
      if (isNaN(v) || v < 0) {
        const msg = `${p.label} must be a non-negative number.`;
        setError(msg);
        addToast(msg, "error");
        return;
      }
    }

    setLoading(true);
    setError("");
    setResult(null);

    // Build payload with floats
    const payload = Object.fromEntries(
      POLLUTANTS.map(p => [p.key, parseFloat(values[p.key])])
    );

    try {
      const { data } = await axios.post("/api/aqi-calculate", payload, { timeout: 10_000 });
      if (data.success) {
        setResult(data);
        addToast(`Analysis complete — AQI ${data.aqi} (${data.category})`, "success");
      } else {
        setError(data.message ?? "Analysis failed.");
        addToast(data.message ?? "Analysis failed.", "error");
      }
    } catch (e) {
      const msg = e.response?.data?.message ?? "Cannot reach Flask API. Is it running?";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setValues(DEFAULTS);
    setResult(null);
    setError("");
  };

  const cfg = result ? getAqiCfg(result.category) : null;

  return (
    <div className="page-shell" style={{ background: "var(--bg-base)" }}>
      <div className="admin-main">
        <PageHeader
          title="Pollution Parameter Analyzer"
          subtitle="Enter real-time pollutant concentrations to get instant AQI and health assessment"
        />


        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 24, alignItems: "start",
        }} className="analyzer-grid">

          {/* ── Left: Input form ─────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Input grid */}
            <div className="glass animate-slide-up" style={{ borderRadius: 20 }}>
              <div style={{
                padding: "18px 24px 14px", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "linear-gradient(135deg,#00d4ff,#4f8ef7)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>🔬</div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Pollutant Concentrations</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Enter measured values for each parameter</div>
                </div>
              </div>

              <div style={{
                padding: "22px 24px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 18,
              }}>
                {POLLUTANTS.map(p => (
                  <div key={p.key}>
                    <label style={{
                      display: "block", fontSize: 12, fontWeight: 700,
                      color: "var(--muted)", marginBottom: 7,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      {p.icon} {p.label}
                      <span style={{ marginLeft: 6, fontWeight: 400, opacity: 0.7 }}>({p.unit})</span>
                    </label>

                    <div style={{ position: "relative" }}>
                      <input
                        id={`input-${p.key}`}
                        type="number"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={values[p.key]}
                        onChange={e => handleChange(p.key, e.target.value)}
                        className="input-field"
                        style={{ paddingRight: 68 }}
                        placeholder="0.0"
                      />
                      <span style={{
                        position: "absolute", right: 12, top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: 11, color: "var(--muted)", fontWeight: 500,
                        pointerEvents: "none",
                      }}>{p.unit}</span>
                    </div>

                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5, opacity: 0.7 }}>
                      {p.hint}
                    </div>
                  </div>
                ))}
              </div>

              {/* Error banner */}
              {error && (
                <div style={{
                  margin: "0 24px 20px", padding: "10px 14px", borderRadius: 10,
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  fontSize: 13, color: "#ef4444", display: "flex", alignItems: "center", gap: 8,
                }}>
                  ❌ {error}
                </div>
              )}

              {/* Submit */}
              <div style={{ padding: "0 24px 22px" }}>
                <button
                  className="btn-primary"
                  onClick={handleAnalyze}
                  disabled={loading}
                  style={{
                    width: "100%", padding: 15, fontSize: 15, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        animation: "spin 0.75s linear infinite",
                        flexShrink: 0,
                      }} />
                      Analyzing…
                    </>
                  ) : "🔬 Analyze Air Quality"}
                </button>
              </div>
            </div>

            {/* Reference table */}
            <div className="glass animate-slide-up" style={{ borderRadius: 20, animationDelay: "80ms" }}>
              <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>📖 AQI Reference Scale</div>
              </div>
              <div style={{ padding: "12px 24px 16px" }}>
                {Object.entries(AQI_CONFIG).map(([cat, c]) => (
                  <div key={cat} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <span style={{ fontSize: 16 }}>{c.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.color }}>{cat}</span>
                  </div>
                ))}

              </div>
            </div>
          </div>

          {/* ── Right: Results ───────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {result ? (
              <>
                {/* AQI Card */}
                <div className="glass animate-slide-up" style={{
                  borderRadius: 20, overflow: "hidden",
                  border: `1px solid ${cfg.border}`,
                  boxShadow: `0 16px 48px ${cfg.color}20`,
                }}>
                  <div style={{
                    padding: "20px 24px",
                    background: `linear-gradient(135deg, ${cfg.bg}, transparent)`,
                    borderBottom: "1px solid var(--border)",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 16 }}>
                      OVERALL AIR QUALITY INDEX
                    </div>
                    <AQIGauge aqi={result.aqi} category={result.category} />
                  </div>
                  <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Dominant pollutant */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 14px", borderRadius: 12,
                      background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600,
                          textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Dominant Pollutant
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: cfg.color, marginTop: 3 }}>
                          {result.dominant_pollutant}
                        </div>
                      </div>
                      <div style={{ fontSize: 36 }}>⚠️</div>
                    </div>

                    {/* Health advice */}
                    <div style={{
                      padding: "14px 16px", borderRadius: 12,
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                    }}>
                      <div style={{ fontSize: 11, color: cfg.color, fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                        💊 Health Advice
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.6 }}>
                        {result.health_advice}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-indices breakdown */}
                <div className="glass animate-slide-up" style={{ borderRadius: 20, animationDelay: "80ms" }}>
                  <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>📊 Per-Pollutant Sub-Index</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                      Overall AQI = highest sub-index (CPCB standard)
                    </div>
                  </div>
                  <div style={{ padding: "18px 24px" }}>
                    {Object.entries(result.sub_indices)
                      .sort(([, a], [, b]) => b - a)           // highest first
                      .map(([key, val]) => (
                        <SubBar key={key} label={toLabel(key)} value={val} />
                    ))}

                  </div>
                </div>
              </>
            ) : (
              /* Placeholder when no result yet */
              <div className="glass animate-slide-up" style={{
                borderRadius: 20, padding: "48px 28px",
                textAlign: "center", animationDelay: "40ms",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🌬️</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                  Ready to Analyze
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, maxWidth: 240, margin: "0 auto" }}>
                  Enter pollutant concentrations on the left and click{" "}
                  <strong style={{ color: "var(--cyan)" }}>Analyze Air Quality</strong>{" "}
                  to see your AQI report.
                </div>
              </div>
            )}

            {/* Quick tips */}
            <div className="glass animate-slide-up" style={{ borderRadius: 18, padding: "18px 20px", animationDelay: "120ms" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>💡 Input Tips</div>
              {[
                ["PM2.5 / PM10", "From air quality monitors (µg/m³)"],
                ["NO₂ / SO₂ / O₃", "From gas sensors or CPCB portals (µg/m³)"],
                ["CO", "Carbon monoxide in mg/m³ (not µg/m³)"],
              ].map(([label, tip]) => (
                <div key={label} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <span style={{ color: "var(--blue)", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (max-width: 860px) {
            .analyzer-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
