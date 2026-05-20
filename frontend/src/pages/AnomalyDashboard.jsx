import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceDot, Legend,
} from "recharts";
import axios from "axios";
import PageHeader from "../components/PageHeader";
import { useLocation } from "../context/LocationContext";

const API = "http://localhost:5000/api";

const CAUSE_COLORS = {
  FESTIVAL:       { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
  CROP_BURNING:   { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
  INDUSTRIAL:     { bg: "rgba(239,68,68,0.15)",  text: "#ef4444" },
  TRAFFIC:        { bg: "rgba(79,142,247,0.15)",  text: "#4f8ef7" },
  WEATHER_TRAPPED:{ bg: "rgba(34,197,94,0.15)",  text: "#22c55e" },
  UNKNOWN:        { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
};

const CAUSE_ICONS = {
  FESTIVAL: "🎆", CROP_BURNING: "🌾", INDUSTRIAL: "🏭",
  TRAFFIC: "🚗", WEATHER_TRAPPED: "🌫️", UNKNOWN: "❓",
};

// ── Custom anomaly dot on the chart ──────────────────────────────────────────
function AnomalyDot({ cx, cy, payload }) {
  if (!payload?.is_anomaly) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={12} fill="none" stroke="#ef4444" strokeWidth={1} opacity={0.4} />
    </g>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "#ef4444" : pct >= 60 ? "#f59e0b" : "#4f8ef7";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: "rgba(255,255,255,0.08)",
      }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 3,
          background: color, transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: 12, color, minWidth: 34, fontWeight: 600 }}>{pct}%</span>
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: "var(--bg-card, #0d1526)", border: "1px solid rgba(79,142,247,0.3)",
      borderRadius: 10, padding: "10px 14px", fontSize: 13,
    }}>
      <div style={{ color: "var(--muted, #94a3b8)", marginBottom: 4 }}>{label}</div>
      <div style={{ color: "#4f8ef7", fontWeight: 600 }}>PM2.5: {d?.pm25} µg/m³</div>
      {d?.is_anomaly && (
        <>
          <div style={{ color: "#ef4444", marginTop: 4 }}>⚠️ Anomaly detected</div>
          <div style={{ color: "#f59e0b", fontSize: 12 }}>
            {CAUSE_ICONS[d.cause_label]} {d.cause_label?.replace(/_/g, " ")}
          </div>
        </>
      )}
    </div>
  );
}

export default function AnomalyDashboard() {
  const [anomalies, setAnomalies]   = useState([]);
  const [chartData, setChartData]   = useState([]);
  const [reportCounts, setReportCounts] = useState([]);
  const [activeOnly, setActiveOnly] = useState(false);
  const [city, setCity]             = useState("Delhi");
  const [days, setDays]             = useState(7);
  const [loading, setLoading]       = useState(false);
  const [checking, setChecking]     = useState(false);
  const [manualPm25, setManualPm25] = useState("");
  const [checkResult, setCheckResult] = useState(null);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [currentAqi, setCurrentAqi] = useState(null);
  const { location: userLocation } = useLocation();
  const debounceRef = useRef(null);

  useEffect(() => {
    if (userLocation && userLocation.city) {
      setCity(userLocation.city);
    }
  }, [userLocation]);

  // Geocode city/place name for suggestions
  const handleCitySearch = (query) => {
    setCity(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (query.length < 2) { setCitySuggestions([]); return; }
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: query, format: 'json', limit: 6, countrycodes: 'in' }
        });
        setCitySuggestions(res.data.map(r => ({
          name: r.display_name,
          short: r.display_name.split(',')[0],
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon)
        })));
      } catch { setCitySuggestions([]); }
    }, 350);
  };

  const selectCity = (selected) => {
    setCity(selected.short || selected.name);
    setCitySuggestions([]);
  };

  // Helper to geocode city name to bbox and center
  const geocodeCityData = async (cityName) => {
    try {
      const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: cityName, format: 'json', limit: 1, countrycodes: 'in' }
      });
      if (data && data.length > 0) {
        const { boundingbox, lat, lon } = data[0];
        return {
          bbox: `${boundingbox[0]},${boundingbox[2]},${boundingbox[1]},${boundingbox[3]}`,
          lat: parseFloat(lat),
          lon: parseFloat(lon)
        };
      }
    } catch { return null; }
    return null;
  };

  const fetchAnomalies = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeOnly
        ? `${API}/anomalies/active?city=${city}`
        : `${API}/anomalies?city=${city}&days=${days}`;
      const { data } = await axios.get(url);
      if (data.success) setAnomalies(data.anomalies || []);

      // Fetch city spatial data
      const cityData = await geocodeCityData(city);
      if (cityData) {
        // 1. Fetch community reports
        const reportsRes = await axios.get(`${API}/reports/history?bbox=${cityData.bbox}&days=${days}`);
        if (reportsRes.data.success) {
          const grouped = {};
          reportsRes.data.reports.forEach(r => {
            const d = new Date(r.reported_at).toLocaleDateString();
            grouped[d] = (grouped[d] || 0) + 1;
          });
          setReportCounts(Object.keys(grouped).map(k => ({ date: k, count: grouped[k] })));
        }

        // 2. Fetch live AQI for recommendation
        const aqiRes = await axios.get(`${API}/air-quality`, { 
          params: { city: city, lat: cityData.lat, lon: cityData.lon }
        }).catch(() => null);
        if (aqiRes && aqiRes.data) {
          setCurrentAqi(aqiRes.data);
        } else {
          setCurrentAqi(null);
        }
      } else {
        setReportCounts([]);
        setCurrentAqi(null);
      }
    } catch {
      setAnomalies([]);
      setReportCounts([]);
    } finally {
      setLoading(false);
    }
  }, [city, days, activeOnly]);

  // Build chart data: last 7 days hourly buckets + anomaly markers
  const buildChartData = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/dashboard`);
      if (!data.success) return;
      const trend = (data.recent_trend || []).map(p => ({
        time: p.time, pm25: p.pm25, is_anomaly: false, cause_label: null,
      }));
      // Overlay anomaly markers onto trend points
      anomalies.forEach(ev => {
        const evTime = new Date(ev.detected_at);
        let closest = null, minDiff = Infinity;
        trend.forEach((p, i) => {
          const diff = Math.abs(new Date(p.time) - evTime);
          if (diff < minDiff) { minDiff = diff; closest = i; }
        });
        if (closest !== null && minDiff < 3_600_000) {
          trend[closest].is_anomaly  = true;
          trend[closest].cause_label = ev.cause_label;
        }
      });
      setChartData(trend);
    } catch { /* silent */ }
  }, [anomalies]);

  useEffect(() => { fetchAnomalies(); }, [fetchAnomalies]);
  useEffect(() => { buildChartData(); }, [buildChartData]);

  const handleFalsePositive = async (id) => {
    await axios.post(`${API}/anomalies/${id}/false-positive`);
    fetchAnomalies();
  };

  const handleManualCheck = async () => {
    if (!manualPm25) return;
    setChecking(true);
    setCheckResult(null);
    try {
      const { data } = await axios.post(`${API}/anomalies/check`, {
        city, pm25: parseFloat(manualPm25),
      });
      setCheckResult(data);
      if (data.is_anomaly) fetchAnomalies();
    } catch (e) {
      setCheckResult({ error: e.message });
    } finally {
      setChecking(false);
    }
  };

  const activeCount   = anomalies.filter(a => !a.resolved_at).length;
  const resolvedCount = anomalies.filter(a =>  a.resolved_at).length;

  return (
    <div className="page-shell" style={{ background: "var(--bg-base)" }}>
      <div className="admin-main">
        <PageHeader
          title="Anomaly Detection"
          subtitle="Real-time pollution spike detection and root cause analysis"
        />

        {/* ── Summary strip ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Events",   value: anomalies.length, color: "var(--blue)"   },
            { label: "Active",         value: activeCount,       color: "var(--red)"    },
            { label: "Resolved",       value: resolvedCount,     color: "var(--green)"  },
            { label: "Days Monitored", value: days,              color: "var(--purple)" },
          ].map(s => (
            <div key={s.label} className="glass animate-slide-up"
              style={{ borderRadius: 16, padding: "18px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Health Recommendation ──────────────────────────────────────── */}
        <div className="glass animate-slide-up" style={{ 
          borderRadius: 20, padding: 20, marginBottom: 24, 
          background: activeCount > 0 ? "rgba(239, 68, 68, 0.05)" : "rgba(34, 197, 94, 0.05)",
          borderLeft: `4px solid ${activeCount > 0 ? "#ef4444" : "#22c55e"}`
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{activeCount > 0 ? "⚠️" : "✅"}</span>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              Health Recommendation for {city}
            </div>
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, paddingLeft: 34 }}>
            {activeCount > 2 ? (
              <span style={{ color: "#ef4444" }}><strong>Hazardous Conditions:</strong> Multiple active pollution anomalies detected. Please stay indoors, close all windows, and run air purifiers. Wear an N95 mask.</span>
            ) : activeCount > 0 ? (
              <span style={{ color: "#f59e0b" }}><strong>Unhealthy Air Alert:</strong> An active pollution anomaly is affecting the area. Sensitive groups should limit outdoor exertion.</span>
            ) : currentAqi && currentAqi.aqi > 150 ? (
              <span style={{ color: "#ef4444" }}><strong>Poor Air Quality ({currentAqi.aqi} AQI):</strong> High baseline pollution levels detected even without specific anomalies. Use a mask outdoors.</span>
            ) : currentAqi && currentAqi.aqi > 100 ? (
              <span style={{ color: "#f59e0b" }}><strong>Moderate Pollution ({currentAqi.aqi} AQI):</strong> Air quality is acceptable but may pose a risk for sensitive individuals.</span>
            ) : reportCounts.length > 5 ? (
              <span style={{ color: "#eab308" }}><strong>Community Alert:</strong> No automated anomalies detected, but there is a high volume of community reports. Exercise caution.</span>
            ) : (
              <span style={{ color: "#22c55e" }}><strong>Safe Conditions:</strong> Air quality is good ({currentAqi?.aqi || 'N/A'} AQI). No active anomalies or significant reports found. Safe for outdoor activities.</span>
            )}
          </div>
        </div>

        {/* ── Controls ──────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
          <div style={{ position: 'relative' }}>
            <input
              className="input-field"
              value={city}
              onChange={e => handleCitySearch(e.target.value)}
              placeholder="Type or select city"
              style={{ width: 180, background: "var(--bg-glass)", color: "var(--text)", border: "1px solid var(--border)" }}
            />
            {citySuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                background: '#1a1a2e', border: '1px solid #333', borderRadius: '10px',
                maxHeight: '200px', overflowY: 'auto', marginTop: '4px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
              }}>
                {citySuggestions.map((s, i) => (
                  <div key={i}
                    onClick={() => selectCity(s)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: '13px',
                      color: '#e0e0e0', borderBottom: '1px solid #2a2a3a'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a3e'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    📍 {s.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <select
            className="input-field"
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            style={{ 
              width: 120, 
              background: "#1a1a2e", // Force solid dark background
              color: "white", 
              border: "1px solid var(--border)",
              cursor: "pointer",
              outline: "none"
            }}
          >
            {[1,3,7,14,30].map(d => (
              <option key={d} value={d} style={{ background: "#1a1a2e", color: "white" }}>
                Last {d}d
              </option>
            ))}
          </select>

          {["All", "Active"].map(f => (
            <button key={f} onClick={() => setActiveOnly(f === "Active")} style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500,
              cursor: "pointer", transition: "all 0.2s",
              background: (activeOnly ? f === "Active" : f === "All")
                ? "rgba(79,142,247,0.2)" : "rgba(255,255,255,0.05)",
              color: (activeOnly ? f === "Active" : f === "All")
                ? "var(--blue)" : "var(--muted)",
              border: (activeOnly ? f === "Active" : f === "All")
                ? "1px solid rgba(79,142,247,0.4)" : "1px solid var(--border)",
            }}>{f}</button>
          ))}

          <button onClick={fetchAnomalies} style={{
            padding: "8px 16px", borderRadius: 10, fontSize: 13,
            background: "rgba(79,142,247,0.15)", color: "var(--blue)",
            border: "1px solid rgba(79,142,247,0.3)", cursor: "pointer",
          }}>↻ Refresh</button>
        </div>

        {/* ── Timeline chart ────────────────────────────────────────────── */}
        <div className="glass animate-slide-up" style={{ borderRadius: 20, padding: "20px 16px", marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 16, paddingLeft: 4 }}>
            PM2.5 Trend — Last 48 Hours
            <span style={{ marginLeft: 16, fontSize: 12, color: "#ef4444" }}>
              ● Anomaly detected
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                unit=" µg"
              />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="pm25"
                stroke="#4f8ef7"
                strokeWidth={2}
                dot={<AnomalyDot />}
                activeDot={{ r: 5, fill: "#4f8ef7" }}
                name="PM2.5"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── Community Reports Chart ────────────────────────────────────── */}
        {reportCounts.length > 0 && (
          <div className="glass animate-slide-up" style={{ borderRadius: 20, padding: "20px 16px", marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 16, paddingLeft: 4 }}>
              Community Reports Trend ({city})
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={reportCounts} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', color: '#fff' }} />
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={3} activeDot={{ r: 6 }} name="Reports" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Manual check widget ───────────────────────────────────────── */}
        <div className="glass animate-slide-up" style={{ borderRadius: 20, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
            Manual Anomaly Check
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input-field"
              type="number"
              placeholder="PM2.5 value (µg/m³)"
              value={manualPm25}
              onChange={e => setManualPm25(e.target.value)}
              style={{ width: 200 }}
            />
            <button
              onClick={handleManualCheck}
              disabled={checking || !manualPm25}
              style={{
                padding: "9px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: "rgba(79,142,247,0.2)", color: "var(--blue)",
                border: "1px solid rgba(79,142,247,0.4)", cursor: "pointer",
                opacity: checking ? 0.6 : 1,
              }}
            >
              {checking ? "Checking…" : "Check Now"}
            </button>
            {checkResult && !checkResult.error && (
              <div style={{
                padding: "8px 14px", borderRadius: 10, fontSize: 13,
                background: checkResult.is_anomaly ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                color: checkResult.is_anomaly ? "#ef4444" : "#22c55e",
                border: `1px solid ${checkResult.is_anomaly ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              }}>
                {checkResult.is_anomaly
                  ? `⚠️ Anomaly! ${CAUSE_ICONS[checkResult.cause_label]} ${checkResult.cause_label?.replace(/_/g," ")} (${Math.round(checkResult.cause_confidence*100)}%)`
                  : "✅ Normal — no anomaly detected"}
              </div>
            )}
          </div>
          {checkResult?.explanation && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              {checkResult.explanation}
            </div>
          )}
        </div>

        {/* ── Events table ──────────────────────────────────────────────── */}
        <div className="glass animate-slide-up" style={{ borderRadius: 20, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            Anomaly Events
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>
              {anomalies.length} record{anomalies.length !== 1 ? "s" : ""}
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
          ) : anomalies.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
              No anomaly events found for {city} in the last {days} day{days !== 1 ? "s" : ""}.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Detected At</th>
                  <th>Observed</th>
                  <th>Expected</th>
                  <th>Cause</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map(ev => {
                  const cc = CAUSE_COLORS[ev.cause_label] ?? CAUSE_COLORS.UNKNOWN;
                  const isActive = !ev.resolved_at;
                  return (
                    <tr key={ev.id}>
                      <td style={{ color: "var(--muted)", width: 40 }}>{ev.id}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {new Date(ev.detected_at).toLocaleString()}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: "#ef4444" }}>
                          {ev.observed_value} µg/m³
                        </span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>{ev.expected_value} µg/m³</td>
                      <td>
                        <span className="badge" style={{ background: cc.bg, color: cc.text }}>
                          {CAUSE_ICONS[ev.cause_label]} {ev.cause_label?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ minWidth: 120 }}>
                        <ConfidenceBar value={ev.cause_confidence} />
                      </td>
                      <td>
                        <span className="badge" style={{
                          background: isActive ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                          color: isActive ? "#ef4444" : "#22c55e",
                        }}>
                          {isActive ? "Active" : "Resolved"}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleFalsePositive(ev.id)}
                          title={ev.explanation}
                          style={{
                            padding: "4px 10px", borderRadius: 8, fontSize: 11,
                            background: "rgba(100,116,139,0.15)", color: "var(--muted)",
                            border: "1px solid var(--border)", cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ✗ False Positive
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <style>{`
          @media (max-width: 768px) {
            .data-table th:nth-child(4),
            .data-table td:nth-child(4),
            .data-table th:nth-child(6),
            .data-table td:nth-child(6) { display: none; }
          }
        `}</style>
      </div>
    </div>
  );
}
