import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { getAqiColor } from "../utils/aqiColors";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CITIES = [
  { name: "Dharwad",        lat: 15.4589, lon: 75.0078 },
  { name: "Delhi",         lat: 28.6139, lon: 77.2090 },
  { name: "Mumbai",        lat: 19.0760, lon: 72.8777 },
  { name: "Bangalore",     lat: 12.9716, lon: 77.5946 },
  { name: "Chennai",       lat: 13.0827, lon: 80.2707 },
  { name: "Kolkata",       lat: 22.5726, lon: 88.3639 },
  { name: "Hyderabad",     lat: 17.3850, lon: 78.4867 },
  { name: "Pune",          lat: 18.5204, lon: 73.8567 },
];

const SUGGESTIONS = [
  "Is it safe to go outside in Dharwad today?",
  "What health precautions should I take for PM2.5?",
  "How does air pollution affect my long-term health?",
  "What are the best plants for indoor air purification?",
];

const FEATURES = [
  { icon: "📊", title: "Live Dashboard", desc: "Real-time pollutant readings and hourly trend charts.", to: "/dashboard", color: "#4f8ef7" },
  { icon: "🗺️", title: "India Map", desc: "Interactive map to fetch AQI for any location.", to: "/map", color: "#22c55e" },
  { icon: "🔮", title: "ML Prediction", desc: "Forecast PM2.5 levels using advanced ML models.", to: "/predict", color: "#a855f7" },
  { icon: "🔔", title: "AQI Alerts", desc: "Custom notifications for air quality thresholds.", to: "/alerts", color: "#f59e0b" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Reusable Searchable Selector
// ─────────────────────────────────────────────────────────────────────────────
function CompactCitySelector({ selectedCity, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchCities = useCallback(async (q) => {
    if (q.length < 3) return;
    try {
      const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: { q, format: "json", addressdetails: 1, limit: 4, countrycodes: "in" },
      });
      setResults(data.map(item => ({
        name: item.display_name.split(",")[0],
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (query) searchCities(query); }, 600);
    return () => clearTimeout(timer);
  }, [query, searchCities]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        type="text"
        placeholder={selectedCity.name}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
        onFocus={() => setIsOpen(true)}
        style={{
          background: "var(--bg-glass)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "6px 12px", color: "var(--text)", fontSize: 13, width: 140, outline: "none"
        }}
      />
      {isOpen && (
        <div className="dropdown-menu" style={{
          position: "absolute", top: "100%", right: 0, marginTop: 8, borderRadius: 12,
          width: 200, zIndex: 1000, padding: "8px", maxHeight: 200, overflowY: "auto"
        }}>
          {results.map((c, i) => (
            <div key={i} onClick={() => { onSelect(c); setIsOpen(false); setQuery(""); }} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "var(--text)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {c.name}
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", padding: "8px 8px 4px", textTransform: "uppercase" }}>Common</div>
          {CITIES.map((c, i) => (
            <div key={`q-${i}`} onClick={() => { onSelect(c); setIsOpen(false); setQuery(""); }} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "var(--text)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chatbot Card Component
// ─────────────────────────────────────────────────────────────────────────────
function ChatbotHero() {
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [selectedCity, setSelectedCity] = useState(CITIES[0]);
  const [aqiData,      setAqiData]      = useState(null);
  const [aqiLoading,   setAqiLoading]   = useState(false);

  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, sending]);

  const fetchAqi = useCallback(async (city) => {
    setAqiLoading(true); setAqiData(null);
    try {
      const { data } = await axios.get("/api/air-quality", { params: { lat: city.lat, lon: city.lon, city: city.name }, timeout: 15000 });
      setAqiData(data);
    } catch {} finally { setAqiLoading(false); }
  }, []);

  useEffect(() => { fetchAqi(selectedCity); }, [selectedCity, fetchAqi]);

  useEffect(() => {
    setMessages([{ role: "assistant", content: "Hello! I'm AirSight AI. Ask me anything about air quality, health effects, or precautions. I use live data and research papers to provide accurate advice.", sources: [] }]);
  }, []);

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;
    setMessages(prev => [...prev, { role: "user", content: trimmed }]);
    setInput(""); setSending(true);
    try {
      const { data } = await axios.post("/api/chat", { message: trimmed, city: selectedCity.name, aqi_data: aqiData ?? {} }, { timeout: 60000 });
      setMessages(prev => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Error connecting to AI. Please try again.", sources: [] }]);
    } finally { setSending(false); inputRef.current?.focus(); }
  }

  const aqiColor = aqiData ? getAqiColor(aqiData.aqi_category) : null;

  return (
    <div className="glass animate-slide-up" style={{ 
      width: "100%", maxWidth: 1000, margin: "0 auto", borderRadius: 32, 
      display: "flex", flexDirection: "column", height: 600, 
      border: "1px solid var(--border)", boxShadow: "var(--shadow)",
      background: "var(--bg-surface)", overflow: "hidden" 
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#00d4ff,#4f8ef7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>AirSight AI Advisor</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Powered by RAG & Live AQI Data</div>
        </div>
        
        <CompactCitySelector selectedCity={selectedCity} onSelect={setSelectedCity} />

        {aqiData && !aqiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", borderRadius: 999, background: `${aqiColor}18`, border: `1px solid ${aqiColor}40` }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: aqiColor, boxShadow: `0 0 10px ${aqiColor}` }} />
            <span style={{ fontSize: 15, fontWeight: 900, color: aqiColor }}>{aqiData.aqi}</span>
            <span style={{ fontSize: 12, color: aqiColor, fontWeight: 700 }} className="hidden-mobile">{aqiData.aqi_category}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 32px", scrollbarWidth: "thin" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: msg.role === "user" ? "linear-gradient(135deg,#4f8ef7,#a855f7)" : "linear-gradient(135deg,#00d4ff,#4f8ef7)" }}>{msg.role === "user" ? "👤" : "🤖"}</div>
            <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ padding: "14px 18px", borderRadius: msg.role === "user" ? "20px 4px 20px 20px" : "4px 20px 20px 20px", background: msg.role === "user" ? "var(--blue)20" : "var(--bg-card)", border: "1px solid var(--border)", fontSize: 15, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap" }}>{msg.content}</div>
              {msg.sources?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {msg.sources.map((src, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "var(--blue)10", border: "1px solid var(--blue)30", color: "var(--blue)" }}>📄 {src}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#00d4ff,#4f8ef7)", display: "flex", alignItems: "center", justifyContent: "center" }}>🤖</div>
            <div style={{ background: "var(--bg-card)", borderRadius: "4px 20px 20px 20px", border: "1px solid var(--border)", padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: "pulse 1s infinite 0s" }} />
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: "pulse 1s infinite 0.2s" }} />
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: "pulse 1s infinite 0.4s" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {messages.length === 1 && !sending && (
        <div style={{ padding: "0 32px 16px", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 14px", fontSize: 12, color: "var(--blue)", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={e => e.currentTarget.style.background = "var(--blue)10"} onMouseLeave={e => e.currentTarget.style.background = "var(--bg-card)"}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ padding: "20px 32px 32px", borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", background: "var(--bg-surface)", padding: "8px", borderRadius: 16, border: "1px solid var(--border)" }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Ask about air quality, health precautions, or specific city data..." disabled={sending} rows={1} style={{ flex: 1, background: "transparent", border: "none", padding: "10px 12px", color: "var(--text)", fontSize: 15, resize: "none", outline: "none", maxHeight: 120 }} />
          <button onClick={() => sendMessage()} disabled={sending || !input.trim()} style={{ width: 44, height: 44, borderRadius: 12, background: sending || !input.trim() ? "var(--muted)40" : "linear-gradient(135deg,#4f8ef7,#a855f7)", border: "none", color: "#fff", cursor: "pointer", fontSize: 18 }}>➤</button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Home Page
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="page-shell mesh-bg">
      {/* Hero Section */}
      <section style={{ padding: "100px 24px 60px", textAlign: "center", maxWidth: 1200, margin: "0 auto" }}>
        <div className="animate-fade-in" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 20px", borderRadius: 999, background: "var(--blue)15", border: "1px solid var(--blue)30", marginBottom: 32 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 10px var(--green)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cyan)", textTransform: "uppercase", letterSpacing: "0.05em" }}>AI-Powered Air Quality Guardian</span>
        </div>

        <h1 className="animate-slide-up" style={{ fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 24, letterSpacing: "-0.02em" }}>
          <span className="gradient-text">Breath Smarter</span> with<br />
          <span style={{ color: "var(--text)" }}>Real-Time Insights</span>
        </h1>

        <p className="animate-slide-up" style={{ fontSize: 18, color: "var(--muted)", lineHeight: 1.8, maxWidth: 700, margin: "0 auto 48px", animationDelay: "100ms" }}>
          Monitor live AQI across India, predict pollution trends with AI, and get personalized health advice from our research-backed chatbot.
        </p>

        {/* The Main Feature: Chatbot */}
        <ChatbotHero />
      </section>

      {/* Quick Links Section */}
      <section style={{ padding: "80px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {FEATURES.map((f, i) => (
            <Link key={i} to={f.to} style={{ textDecoration: "none" }}>
              <div className="glass" style={{ borderRadius: 24, padding: "32px", height: "100%", transition: "all 0.3s ease", border: "1px solid var(--border)" }} onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-8px)"; e.currentTarget.style.borderColor = f.color + "60"; }} onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "var(--border)"; }}>
                <div style={{ fontSize: 32, width: 60, height: 60, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", background: f.color + "15", marginBottom: 20 }}>{f.icon}</div>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12, color: "var(--text)" }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer-ish Banner */}
      <section style={{ padding: "40px 24px 100px", maxWidth: 1200, margin: "0 auto" }}>
        <div className="glass" style={{ borderRadius: 32, padding: "60px 40px", textAlign: "center", background: "linear-gradient(135deg, var(--blue)10, var(--purple)10)", border: "1px solid var(--blue)20" }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 16 }}>Ready to take control of your environment?</h2>
          <p style={{ color: "var(--muted)", marginBottom: 32, maxWidth: 500, margin: "0 auto 32px" }}>Explore historical data, set alerts, and join a community dedicated to cleaner air for everyone.</p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <Link to="/dashboard"><button className="btn-primary" style={{ padding: "14px 32px" }}>Open Dashboard</button></Link>
            <Link to="/map"><button className="btn-secondary" style={{ padding: "14px 32px" }}>View India Map</button></Link>
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          section { padding-top: 60px !important; }
        }
      `}</style>
    </div>
  );
}
