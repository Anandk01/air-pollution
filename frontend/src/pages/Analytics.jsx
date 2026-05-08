import { useEffect, useState } from "react";
import axios from "axios";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import StatCard   from "../components/StatCard";
import PageHeader from "../components/PageHeader";
import { Link }   from "react-router-dom";

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(13,21,38,0.96)", border: "1px solid rgba(79,142,247,0.3)",
      borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
    }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ fontSize: 14, fontWeight: 700, color: p.color }}>
          PM2.5: <span style={{ color: "var(--text)" }}>{p.value} µg/m³</span>
        </div>
      ))}
    </div>
  );
};

// ── Spinner ───────────────────────────────────────────────────────────────────
function PageSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 18 }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        border: "4px solid rgba(79,142,247,0.2)",
        borderTopColor: "var(--blue)",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14, color: "var(--muted)" }}>Loading analytics…</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Empty / Error state ───────────────────────────────────────────────────────
function EmptyState({ message, isError }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 56 }}>{isError ? "⚠️" : "📂"}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {isError ? "Analytics Failed" : "No Dataset Found"}
      </div>
      <div style={{ fontSize: 14, color: "var(--muted)", maxWidth: 420, lineHeight: 1.7 }}>
        {message}
      </div>
      {!isError && (
        <Link to="/upload">
          <button className="btn-primary" style={{ marginTop: 8, padding: "12px 28px" }}>
            ⬆ Upload Dataset
          </button>
        </Link>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children }) {
  return (
    <div className="glass animate-slide-up" style={{ borderRadius: 20 }}>
      <div style={{
        padding: "20px 24px 0",
        borderBottom: "1px solid var(--border)",
        paddingBottom: 16, marginBottom: 0,
      }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{subtitle}</div>}
      </div>
      <div style={{ padding: "20px 12px 20px" }}>{children}</div>
    </div>
  );
}

// ── AQI Health Legend ─────────────────────────────────────────────────────────
const AQI_BANDS = [
  { label: "Good",           range: "0–50",    color: "#22c55e" },
  { label: "Moderate",       range: "51–100",  color: "#f59e0b" },
  { label: "Unhealthy",      range: "101–150", color: "#f97316" },
  { label: "Very Unhealthy", range: "151–200", color: "#ef4444" },
  { label: "Hazardous",      range: "200+",    color: "#a855f7" },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function Analytics() {
  const [state,   setState]   = useState("loading"); // loading | error | success
  const [message, setMessage] = useState("");
  const [data,    setData]    = useState(null);

  const fetchAnalytics = async () => {
    setState("loading");
    try {
      const res = await axios.get("/api/analytics", { timeout: 20_000 });
      if (res.data.success) {
        setData(res.data);
        setState("success");
      } else {
        setMessage(res.data.message || "Unknown error.");
        setState("error");
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ??
        (err.response?.status === 404
          ? "No dataset uploaded yet. Upload a CSV to see analytics."
          : "Could not connect to the Flask API. Make sure it is running.");
      setMessage(msg);
      setState("error");
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  if (state === "loading") return <div className="page-shell"><div className="admin-main"><PageSpinner /></div></div>;
  if (state === "error")   return <div className="page-shell"><div className="admin-main">
    <PageHeader title="Analytics" subtitle="Explore historical trends based on your uploaded dataset" />
    <EmptyState message={message} isError={message.toLowerCase().includes("connect") || message.toLowerCase().includes("server")} />
  </div></div>;

  const { summary, trend, monthly_avg, filename, total_rows } = data;

  // PM2.5 color based on value
  const pm25Color = summary.avg_pm25 > 150 ? "#a855f7"
    : summary.avg_pm25 > 100 ? "#ef4444"
    : summary.avg_pm25 > 50  ? "#f59e0b"
    : "#22c55e";

  return (
    <div className="page-shell" style={{ background: "var(--bg-base)" }}>
      <div className="admin-main">
        <PageHeader
          title="Analytics"
          subtitle={`Dataset: ${filename} · ${total_rows?.toLocaleString()} rows`}
        >
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={fetchAnalytics}>
            🔄 Refresh
          </button>
          <button
            className="btn-secondary"
            style={{ fontSize: 13 }}
            onClick={() => {
              const csv = ["date,pm25", ...trend.map(r => `${r.date},${r.pm25}`)].join("\n");
              const a   = Object.assign(document.createElement("a"), {
                href:     URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
                download: "analytics_trend.csv",
              });
              a.click();
            }}
          >
            ⬇ Export Trend CSV
          </button>
        </PageHeader>

        {/* ── Stat Cards ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))",
          gap: 18, marginBottom: 28,
        }}>
          <StatCard
            id="a-avg"  icon="📊"
            label="Average PM2.5"
            value={`${summary.avg_pm25} µg/m³`}
            sub="Overall dataset mean"
            color={pm25Color}
            delay={0}
          />
          <StatCard
            id="a-max"  icon="🔴"
            label="Maximum PM2.5"
            value={`${summary.max_pm25} µg/m³`}
            sub="Worst recorded reading"
            color="#ef4444"
            delay={80}
          />
          <StatCard
            id="a-min"  icon="🟢"
            label="Minimum PM2.5"
            value={`${summary.min_pm25} µg/m³`}
            sub="Best recorded reading"
            color="#22c55e"
            delay={160}
          />
          <StatCard
            id="a-days" icon="📅"
            label="Data Points"
            value={trend.length}
            sub={`${monthly_avg.length} month${monthly_avg.length !== 1 ? "s" : ""} of data`}
            color="#4f8ef7"
            delay={240}
          />
        </div>

        {/* ── Charts ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Line chart — Daily trend */}
          <ChartCard
            title="📈 Daily PM2.5 Trend"
            subtitle="Average PM2.5 concentration per day (µg/m³)"
          >
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"   stopColor="#4f8ef7" stopOpacity={0.3} />
                    <stop offset="95%"  stopColor="#4f8ef7" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  interval={Math.max(0, Math.floor(trend.length / 8) - 1)}
                />
                <YAxis
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => `${v}`}
                  width={42}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={() => "PM2.5 (µg/m³)"}
                  wrapperStyle={{ color: "var(--muted)", fontSize: 12 }}
                />
                <Line
                  type="monotone" dataKey="pm25"
                  stroke="#4f8ef7" strokeWidth={2.5}
                  dot={false} activeDot={{ r: 5, fill: "#4f8ef7", stroke: "var(--bg-base)", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Bar chart + AQI legend row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 20 }}
               className="chart-row">

            {/* Bar chart — Monthly avg */}
            <ChartCard
              title="📊 Monthly Average PM2.5"
              subtitle="Mean PM2.5 per calendar month (µg/m³)"
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly_avg} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#00d4ff" />
                      <stop offset="100%" stopColor="#4f8ef7" />
                    </linearGradient>
                    <linearGradient id="barGradHigh" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"  stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  />
                  <YAxis
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickLine={false} axisLine={false} width={42}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="pm25"
                    fill="url(#barGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* AQI Reference */}
            <div className="glass animate-slide-up" style={{ borderRadius: 20, padding: "22px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>🎯 AQI Reference</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18, lineHeight: 1.5 }}>
                Your avg: <span style={{ color: pm25Color, fontWeight: 700 }}>{summary.avg_pm25} µg/m³</span>
              </div>
              {AQI_BANDS.map(b => (
                <div key={b.label} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{b.label}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{b.range}</span>
                </div>
              ))}

              <div style={{
                marginTop: 20, padding: "12px 14px", borderRadius: 12,
                background: `${pm25Color}14`, border: `1px solid ${pm25Color}30`,
              }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Your dataset quality</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: pm25Color }}>
                  {summary.avg_pm25 > 150 ? "⚠ Very Unhealthy"
                   : summary.avg_pm25 > 100 ? "⚠ Unhealthy"
                   : summary.avg_pm25 > 50  ? "⚡ Moderate"
                   : "✅ Good"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 860px) {
            .chart-row { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
