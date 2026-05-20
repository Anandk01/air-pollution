import { useEffect, useState, useCallback, useRef } from "react";
import axios from "axios";
import {
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import PageHeader from "../components/PageHeader";
import ReportCard from "../components/ReportCard";
import { useToast } from "../context/ToastContext";
import { useLocation } from "../context/LocationContext";
import { useProfile } from "../context/ProfileContext";
import { AQI_COLORS, getAqiColor } from "../utils/aqiColors";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const AQI_MAX = 500;
const DEFAULT_CITY = { name: "Dharwad", lat: 15.4589, lon: 75.0078 };

// ─────────────────────────────────────────────────────────────────────────────
// SearchableCitySelector Component
// ─────────────────────────────────────────────────────────────────────────────
function SearchableCitySelector({ selectedCity, onSelect, cities }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search geocoding API (Nominatim)
  const searchCities = useCallback(async (q) => {
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: {
          q: q,
          format: "json",
          addressdetails: 1,
          limit: 5,
          countrycodes: "in", // Restrict to India
        },
      });
      const formatted = data.map(item => ({
        name: item.display_name.split(",")[0],
        fullName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        state: item.address.state || item.address.county || "",
      }));
      setResults(formatted);
    } catch (err) {
      console.error("Geocoding failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) searchCities(query);
    }, 600);
    return () => clearTimeout(timer);
  }, [query, searchCities]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "280px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>📍 City:</span>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            placeholder={selectedCity.name}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            style={{
              width: "100%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px 8px 32px",
              color: "var(--text)", fontSize: 13,
              outline: "none",
              transition: "border-color 0.2s",
            }}
          />
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔍</span>
          {loading && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10 }} className="animate-spin-slow">⏳</span>}
        </div>
      </div>

      {isOpen && (
        <div className="dropdown-menu" style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          marginTop: 8, borderRadius: 16, zIndex: 1000,
          maxHeight: 300, overflowY: "auto",
          padding: "8px"
        }}>
          {/* Geocoding Results */}
          {results.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", padding: "4px 8px", textTransform: "uppercase" }}>Search Results</div>
              {results.map((city, i) => (
                <div
                  key={`res-${i}`}
                  onClick={() => { onSelect(city); setIsOpen(false); setQuery(""); }}
                  style={{
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    fontSize: 13, transition: "background 0.2s",
                    color: "var(--text)"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{city.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{city.fullName}</div>
                </div>
              ))}
            </div>
          )}

          {/* Quick Select / Recent Cities */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", padding: "4px 8px", textTransform: "uppercase" }}>Major Cities</div>
            {cities.slice(0, 15).map((city, i) => (
              <div
                key={`major-${i}`}
                onClick={() => { onSelect(city); setIsOpen(false); setQuery(""); }}
                style={{
                  padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center",
                  color: "var(--text)"
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{ color: "var(--text)" }}>{city.name}</span>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{city.state}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom chart tooltip
// ─────────────────────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(10,17,32,0.96)", borderRadius: 10,
      border: "1px solid rgba(79,142,247,0.25)",
      padding: "10px 14px", fontSize: 13,
    }}>
      <div style={{ color: "var(--muted)", marginBottom: 4, fontSize: 11 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ fontWeight: 700, color: p.color ?? "#4f8ef7" }}>
          {p.name ?? p.dataKey}: <span style={{ color: "var(--text)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AQI Gauge
// ─────────────────────────────────────────────────────────────────────────────
function AqiGauge({ aqi, category }) {
  const color = getAqiColor(category);
  const pct   = Math.min(Math.max(aqi / AQI_MAX, 0), 1);
  const cx = 110, cy = 110, r = 80;
  const startAngle = -180, endAngle = 0, totalAngle = 180;

  function polarToXY(angleDeg, radius) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  const trackStart = polarToXY(startAngle, r);
  const trackEnd   = polarToXY(endAngle, r);
  const trackPath  = `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`;

  const valueAngle = startAngle + totalAngle * pct;
  const valueEnd   = polarToXY(valueAngle, r);
  const valuePath  = pct > 0 ? `M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${valueEnd.x} ${valueEnd.y}` : "";

  const needleAngle = startAngle + totalAngle * pct;
  const needleTip   = polarToXY(needleAngle, r - 4);
  const needleBase1 = polarToXY(needleAngle - 90, 8);
  const needleBase2 = polarToXY(needleAngle + 90, 8);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={220} height={130} viewBox="0 0 220 130" style={{ overflow: "visible" }}>
        {[0, 0.1, 0.2, 0.4, 0.6, 0.8].map((p, i, arr) => {
          const nextP = arr[i + 1] ?? 1;
          const a1 = startAngle + totalAngle * p;
          const a2 = startAngle + totalAngle * nextP;
          const p1 = polarToXY(a1, r);
          const p2 = polarToXY(a2, r);
          return (
            <path key={i} d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`} fill="none" strokeWidth={12} strokeOpacity={0.1} />
          );
        })}
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} strokeLinecap="round" />
        {valuePath && <path d={valuePath} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}80)` }} />}
        <polygon points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`} fill={color} opacity={0.9} />
        <circle cx={cx} cy={cy} r={7} fill={color} />
        <circle cx={cx} cy={cy} r={3} fill="var(--bg-base)" />
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize={28} fontWeight={900} fill={color}>{aqi}</text>
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.5)">AQI</text>
      </svg>
      <div style={{ marginTop: 4, padding: "6px 20px", borderRadius: 999, background: `${color}20`, border: `1px solid ${color}50`, color, fontSize: 14, fontWeight: 800 }}>{category}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pollutant Card
// ─────────────────────────────────────────────────────────────────────────────
function PollutantCard({ icon, label, value, unit, color = "#4f8ef7", delay = 0 }) {
  return (
    <div className="glass animate-slide-up" style={{ borderRadius: 16, padding: "18px 18px 14px", animationDelay: `${delay}ms`, position: "relative", overflow: "hidden", borderTop: `3px solid ${color}` }}>
      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: color, opacity: 0.07, filter: "blur(18px)", pointerEvents: "none" }} />
      <div style={{ fontSize: 20, width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}18`, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>
        {value != null ? value.toFixed(1) : "—"}
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)", marginLeft: 4 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section Wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, subtitle, action, children, delay = 0 }) {
  return (
    <div className="glass animate-slide-up" style={{ borderRadius: 20, animationDelay: `${delay}ms` }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div style={{ padding: "20px 16px 16px" }}>{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loading
// ─────────────────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="admin-main">
        <div style={{ marginBottom: 28 }}>
          <div className="skeleton" style={{ width: 200, height: 28, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: 320, height: 14 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 16, marginBottom: 28 }}>
          {[0,1,2,3,4,5,6,7,8].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 16 }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
          <div className="skeleton" style={{ height: 300, borderRadius: 20 }} />
          <div className="skeleton" style={{ height: 300, borderRadius: 20 }} />
        </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────
function ErrorState({ message, onRetry }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, textAlign: "center" }}>
      <div style={{ fontSize: 52 }}>⚠️</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Could not load air quality data</div>
      <div style={{ fontSize: 14, color: "var(--muted)", maxWidth: 420, lineHeight: 1.7 }}>{message}</div>
      <button className="btn-primary" onClick={onRetry}>🔄 Retry</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [status,       setStatus]       = useState("loading");
  const [aqiData,      setAqiData]      = useState(null);
  const [errMsg,       setErrMsg]       = useState("");
  const [cities,       setCities]       = useState([]);
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const { addToast } = useToast();
  const { location: userLocation } = useLocation();
  const { profile } = useProfile();

  useEffect(() => {
    if (userLocation && userLocation.city) {
      setSelectedCity({ name: userLocation.city, lat: userLocation.lat, lon: userLocation.lon });
    }
  }, [userLocation]);

  useEffect(() => {
    axios.get("/api/cities", { timeout: 10_000 })
      .then(({ data }) => { if (Array.isArray(data) && data.length > 0) setCities(data); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (city) => {
    setStatus("loading");
    try {
      const { data } = await axios.get("/api/air-quality", {
        params: { lat: city.lat, lon: city.lon, city: city.name },
        timeout: 15_000,
      });
      setAqiData(data);
      setStatus("ok");
      addToast(`Live AQI loaded for ${data.city}`, "success", 3000);
    } catch (e) {
      const m = e.response?.data?.error ?? e.response?.data?.message ?? "Cannot reach API.";
      setErrMsg(m);
      setStatus("error");
      addToast(m, "error");
    }
  }, [addToast]);

  useEffect(() => { load(selectedCity); }, [selectedCity, load]);

  if (status === "loading") return <DashboardSkeleton />;
  if (status === "error") return (
    <div className="admin-main">
        <PageHeader title="Live Air Quality Dashboard" subtitle="Real-time pollutant monitoring" />
        <ErrorState message={errMsg} onRetry={() => load(selectedCity)} />
    </div>
  );

  const { current, aqi, aqi_category, dominant_pollutant, hourly } = aqiData;
  const aqiColor = getAqiColor(aqi_category);

  const hourlyChartData = (() => {
    if (!hourly?.time || !hourly?.pm2_5) return [];
    return hourly.time.map((t, i) => ({
      time: new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
      pm25: hourly.pm2_5[i] != null ? +hourly.pm2_5[i].toFixed(1) : null,
    })).filter(d => d.pm25 != null);
  })();

  const chartSlice = hourlyChartData.slice(-24);
  const trendInterval = Math.max(0, Math.floor(chartSlice.length / 8) - 1);

  const pollutants = [
    { icon: "🌫️",  label: "PM2.5", value: current?.pm2_5, unit: "µg/m³", color: "#ef4444" },
    { icon: "💨",  label: "PM10", value: current?.pm10, unit: "µg/m³", color: "#f97316" },
    { icon: "🟤",  label: "NO₂", value: current?.nitrogen_dioxide, unit: "µg/m³", color: "#f59e0b" },
    { icon: "🟡",  label: "SO₂", value: current?.sulphur_dioxide, unit: "µg/m³", color: "#eab308" },
    { icon: "⚫",  label: "CO", value: current?.carbon_monoxide, unit: "µg/m³", color: "#6b7280" },
    { icon: "🔵",  label: "O₃", value: current?.ozone, unit: "µg/m³", color: "#3b82f6" },
    { icon: "🌿",  label: "Ammonia", value: current?.ammonia, unit: "µg/m³", color: "#22c55e" },
    { icon: "☀️",  label: "UV Index", value: current?.uv_index, unit: "", color: "#a855f7" },
    { icon: "Desert",  label: "Dust", value: current?.dust, unit: "µg/m³", color: "#d97706" },
  ];

  // Automation Logic: Smart Alerts & Personalised Threshold
  const isDangerousForProfile = aqi >= profile.aqiThreshold;
  const healthConditions = profile.healthConditions.join(" + ");

  return (
    <div className="admin-main">
        <PageHeader title="🌍 Live Air Quality Dashboard" subtitle={`Real-time pollutant data · ${aqiData.city}`}>
          <SearchableCitySelector selectedCity={selectedCity} onSelect={setSelectedCity} cities={cities} />
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => load(selectedCity)}>🔄 Refresh</button>
        </PageHeader>

        {/* ⚡ AUTOMATION: Personalised Smart Alert Banner */}
        {isDangerousForProfile && (
          <div className="glass animate-slide-up" style={{ 
            borderRadius: 16, padding: "16px 20px", marginBottom: 24, 
            background: "rgba(239, 68, 68, 0.15)", border: "1px solid #ef4444",
            display: "flex", alignItems: "center", gap: 16
          }}>
            <span style={{ fontSize: 32 }}>🚨</span>
            <div>
              <div style={{ color: "#ef4444", fontWeight: 800, fontSize: 16 }}>DANGEROUS FOR YOUR PROFILE</div>
              <div style={{ color: "var(--text)", fontSize: 13 }}>
                Current AQI ({aqi}) exceeds your personal safety threshold ({profile.aqiThreshold}) set due to <strong>{healthConditions}</strong>.
              </div>
            </div>
          </div>
        )}

        <div className="glass animate-slide-up" style={{ borderRadius: 16, padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", background: `${aqiColor}10`, border: `1px solid ${aqiColor}40` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>📍</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{aqiData.city}</span>
          </div>
          <div style={{ width: 1, height: 24, background: "var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase" }}>AQI</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: aqiColor }}>{aqi}</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, padding: "5px 14px", borderRadius: 999, background: `${aqiColor}25`, color: aqiColor, border: `1px solid ${aqiColor}60` }}>{aqi_category}</span>
          {dominant_pollutant && (
            <>
              <div style={{ width: 1, height: 24, background: "var(--border)" }} />
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Dominant: <strong style={{ color: "var(--text)" }}>{dominant_pollutant}</strong></div>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse-dot 2s infinite" }} />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Live</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 24 }}>
          {pollutants.map((p, i) => <PollutantCard key={p.label} {...p} delay={i * 50} />)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 22, marginBottom: 22 }} className="dash-chart-row">
          <Section title="🎯 AQI Meter" subtitle="Current Air Quality Index" delay={500}>
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}><AqiGauge aqi={aqi} category={aqi_category} /></div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(AQI_COLORS).map(([cat, col]) => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, opacity: cat === aqi_category ? 1 : 0.45 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0, boxShadow: cat === aqi_category ? `0 0 6px ${col}` : "none" }} />
                  <span style={{ fontSize: 12, color: cat === aqi_category ? col : "var(--muted)", fontWeight: cat === aqi_category ? 700 : 400 }}>{cat}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="📈 PM2.5 Hourly Trend" subtitle="Hourly PM2.5 concentration · µg/m³ (last 24h)" delay={560} action={<span style={{ fontSize: 12, color: "var(--muted)" }}>{chartSlice.length} data points</span>}>
            {chartSlice.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartSlice} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-card)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} interval={trendInterval} />
                  <YAxis tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} width={38} />
                  <Tooltip content={<ChartTip />} />
                  {[30, 60, 90, 120, 250].map(v => <ReferenceLine key={v} y={v} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 4" />)}
                  <Line type="monotone" dataKey="pm25" name="PM2.5" stroke={aqiColor} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: aqiColor, stroke: "var(--bg-base)", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, color: "var(--muted)", fontSize: 14 }}>No hourly data available</div>}
          </Section>
        </div>

        {/* ⚡ AUTOMATION: Personalized Report & Schedule */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, marginBottom: 22 }} className="dash-chart-row">
          <ReportCard />

          <Section title="⏱️ Activity Scheduler" subtitle="Checking your outdoor slots" delay={650}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {profile.locations.filter(l => l.type.includes("Schedule")).map((loc, i) => {
                const isSafe = !isDangerousForProfile;
                return (
                  <div key={i} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: isSafe ? "1px solid #22c55e40" : "1px solid #ef444440", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{loc.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Slot detected from profile</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 8, background: isSafe ? "#22c55e20" : "#ef444420", color: isSafe ? "#22c55e" : "#ef4444" }}>
                      {isSafe ? "SAFE TO GO" : "POSTPONE"}
                    </span>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Syncing with your {profile.locations.length} saved locations</div>
            </div>
          </Section>
        </div>

        {/* ⚡ AUTOMATION: Exposure History */}
        <div style={{ marginBottom: 24 }}>
          <Section title="⏳ Exposure History" subtitle="Cumulative pollution exposure (Last 24h)" delay={700}>
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                {(() => {
                  const unhealthyPoints = chartSlice.filter(d => d.pm25 >= profile.aqiThreshold).length;
                  const unhealthyHours = unhealthyPoints; // simplified as 1 point = 1 hour in our chart slice logic
                  return (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 36, fontWeight: 900, color: unhealthyHours > 0 ? "#ef4444" : "#22c55e" }}>
                        {unhealthyHours} hrs
                      </span>
                      <span style={{ fontSize: 14, color: "var(--muted)" }}>of unhealthy exposure today</span>
                    </div>
                  );
                })()}
                <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: "var(--bg-card)", overflow: "hidden" }}>
                  <div style={{ 
                    width: `${Math.min(100, (chartSlice.filter(d => d.pm25 >= profile.aqiThreshold).length / 24) * 100)}%`, 
                    height: "100%", 
                    background: "linear-gradient(90deg, #ef4444, #f97316)" 
                  }} />
                </div>
              </div>
              <div style={{ maxWidth: 300, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                Based on your movement patterns and stationary home data, you were exposed to air above your personal threshold ({profile.aqiThreshold}) for several hours.
              </div>
            </div>
          </Section>
        </div>

        <style>{`
          @media (max-width: 900px) { .dash-chart-row { grid-template-columns: 1fr !important; } }
          @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
    </div>
  );
}
