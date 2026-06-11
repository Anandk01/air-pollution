import { useState, useEffect } from "react";
import axios from "axios";
import PageHeader from "../components/PageHeader";
import { useLocation as useUserLocation } from "../context/LocationContext";

const SEED_ALERTS = [
  { id:1,  location:"Sector 4, Dharwad",      pollutant:"PM2.5", aqi:178, level:"Unhealthy",     time:"2026-04-21 22:30", status:"Active"   },
  { id:2,  location:"Andheri, Mumbai",       pollutant:"NO₂",   aqi:142, level:"Moderate",      time:"2026-04-21 22:12", status:"Active"   },
  { id:3,  location:"MG Road, Bangalore",    pollutant:"PM10",  aqi:116, level:"Moderate",      time:"2026-04-21 21:45", status:"Active"   },
  { id:4,  location:"Salt Lake, Kolkata",    pollutant:"SO₂",   aqi:203, level:"Very Unhealthy", time:"2026-04-21 21:00", status:"Resolved" },
  { id:5,  location:"CG Road, Ahmedabad",    pollutant:"CO",    aqi: 89, level:"Satisfactory",  time:"2026-04-21 20:30", status:"Resolved" },
  { id:6,  location:"Anna Nagar, Chennai",   pollutant:"O₃",    aqi:162, level:"Unhealthy",     time:"2026-04-21 19:55", status:"Active"   },
  { id:7,  location:"Banjara Hills, Hyd",    pollutant:"PM2.5", aqi:251, level:"Very Unhealthy", time:"2026-04-21 18:40", status:"Active"   },
  { id:8,  location:"Kothrud, Pune",         pollutant:"NO₂",   aqi: 72, level:"Satisfactory",  time:"2026-04-21 17:20", status:"Resolved" },
  { id:9,  location:"Vidya Giri, Dharwad",   pollutant:"PM10",  aqi:321, level:"Hazardous",     time:"2026-04-21 16:00", status:"Active"   },
  { id:10, location:"Powai, Mumbai",         pollutant:"CO",    aqi:134, level:"Moderate",      time:"2026-04-21 15:10", status:"Resolved" },
];

const LEVEL_COLORS = {
  "Good":          { bg:"rgba(34,197,94,0.12)",  text:"#22c55e" },
  "Satisfactory":  { bg:"rgba(132,204,22,0.12)", text:"#84cc16" },
  "Moderate":      { bg:"rgba(245,158,11,0.12)", text:"#f59e0b" },
  "Unhealthy":     { bg:"rgba(249,115,22,0.12)", text:"#f97316" },
  "Very Unhealthy":{ bg:"rgba(239,68,68,0.12)",  text:"#ef4444" },
  "Hazardous":     { bg:"rgba(168,85,247,0.15)", text:"#a855f7" },
};

const STATUS_COLORS = {
  "Active":   { bg:"rgba(239,68,68,0.12)", text:"#ef4444" },
  "Verified": { bg:"rgba(79,142,247,0.12)", text:"#4f8ef7" },
  "Resolved": { bg:"rgba(34,197,94,0.12)", text:"#22c55e" },
};

const SUMMARY = [
  { label:"Total Alerts",    value:10, color:"var(--blue)"   },
  { label:"Active",          value:6,  color:"var(--red)"    },
  { label:"Resolved",        value:4,  color:"var(--green)"  },
  { label:"Hazardous Level", value:1,  color:"var(--purple)" },
];

export default function Alerts() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [communityAlerts, setCommunityAlerts] = useState([]);
  const [anomalyAlerts, setAnomalyAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("All");
  const { location: userLocation } = useUserLocation();

  // Auto-select user's city when location is available
  useEffect(() => {
    if (userLocation?.city) {
      setCityFilter(userLocation.city);
    }
  }, [userLocation]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Fetch community reports
        const { data } = await axios.get("/api/reports/active");
        if (data.success) {
          const mapped = data.reports.map(r => ({
            id: `rep-${r.id}`,
            location: `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`,
            pollutant: r.incident_type,
            aqi: r.severity * 20, 
            level: r.severity >= 4 ? "Hazardous" : r.severity >= 3 ? "Unhealthy" : "Moderate",
            time: new Date(r.reported_at).toLocaleString(),
            status: r.verified ? "Verified" : "Active",
            trust: Math.round(r.trust_score * 100) + "%",
            upvotes: r.upvote_count,
            description: r.description
          }));
          setCommunityAlerts(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch community reports", err);
      }

      // Fetch anomalies
      try {
        const { data: anomData } = await axios.get("/api/anomalies?days=7");
        if (anomData.success && anomData.anomalies) {
          const mapped = anomData.anomalies.map(a => ({
            id: `anom-${a.id}`,
            location: a.city || "Unknown",
            pollutant: `PM2.5 (${a.observed_value} µg/m³)`,
            aqi: Math.round(a.observed_value),
            level: a.observed_value >= 250 ? "Hazardous" : a.observed_value >= 150 ? "Very Unhealthy" : "Unhealthy",
            time: new Date(a.detected_at).toLocaleString(),
            status: a.resolved_at ? "Resolved" : "Active",
            description: `Anomaly: ${a.cause_label?.replace(/_/g, " ") || "Unknown cause"} (expected ${a.expected_value} µg/m³, got ${a.observed_value} µg/m³)`
          }));
          setAnomalyAlerts(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch anomalies", err);
      }

      setLoading(false);
    };
    fetchAll();
  }, []);

  const allAlerts = [...SEED_ALERTS, ...communityAlerts, ...anomalyAlerts];

  // Derive unique city/location names for city filter
  const cityOptions = ["All", ...(userLocation?.city ? [userLocation.city] : []),
    ...new Set(allAlerts.map(a => a.location.split(",")[0].trim()))
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const visible = allAlerts.filter(a =>
    (filter === "All" || a.status === filter) &&
    (cityFilter === "All" || a.location.toLowerCase().includes(cityFilter.toLowerCase())) &&
    (a.location.toLowerCase().includes(search.toLowerCase()) ||
     a.pollutant.toLowerCase().includes(search.toLowerCase()) ||
     (a.description && a.description.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div className="admin-main">
        <PageHeader
          title="Alerts"
          subtitle="Monitor air quality threshold alerts across all stations"
        />

        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {SUMMARY.map(s => (
            <div key={s.label} className="glass animate-slide-up" style={{
              borderRadius: 16, padding: "18px 20px", textAlign: "center", animationDelay: "80ms",
            }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
          <input
            className="input-field"
            placeholder="Search by location or pollutant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: "1 1 220px", maxWidth: 320 }}
          />
          {/* City filter */}
          <select
            className="input-field"
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            style={{ width: 160, background: "var(--bg-card)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
          >
            {cityOptions.map(c => (
              <option key={c} value={c}>{c === "All" ? "All Locations" : c}</option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            {["All", "Active", "Verified", "Resolved"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                cursor: "pointer", transition: "all 0.2s",
                background: filter === f ? "rgba(79,142,247,0.2)" : "rgba(255,255,255,0.05)",
                color:      filter === f ? "var(--blue)"           : "var(--muted)",
                border:     filter === f ? "1px solid rgba(79,142,247,0.4)" : "1px solid var(--border)",
              }}>
                {f}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>
            {visible.length} result{visible.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Table */}
        <div className="glass animate-slide-up" style={{ borderRadius: 20, overflow: "hidden", animationDelay: "200ms" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Location</th>
                <th>Incident / Pollutant</th>
                <th>AQI / Severity</th>
                <th>Level</th>
                <th>Time</th>
                <th>Status / Trust</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--muted)" }}>
                    No alerts match your filter.
                  </td>
                </tr>
              ) : visible.map(a => {
                const lc = LEVEL_COLORS[a.level]  ?? LEVEL_COLORS["Moderate"];
                const sc = STATUS_COLORS[a.status] ?? STATUS_COLORS["Active"];
                return (
                  <tr key={a.id}>
                    <td style={{ color: "var(--muted)", width: 40 }}>{a.id}</td>
                    <td style={{ fontWeight: 500 }}>{a.location}</td>
                    <td><code style={{ fontSize: 12, color: "var(--cyan)" }}>{a.pollutant}</code></td>
                    <td><span style={{ fontWeight: 700, color: lc.text }}>{a.aqi}</span></td>
                    <td>
                      <span className="badge" style={{ background: lc.bg, color: lc.text }}>
                        {a.level}
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>{a.time}</td>
                    <td>
                      <div style={{ fontSize: 13, color: "var(--text)" }}>{a.status}</div>
                      {a.trust && <div style={{ fontSize: 10, color: "var(--muted)" }}>Trust: {a.trust}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .data-table th:nth-child(6), .data-table td:nth-child(6) { display: none; }
          }
        `}</style>
    </div>
  );
}
