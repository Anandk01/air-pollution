import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import PageHeader from "../components/PageHeader";
import { AQI_COLORS, getAqiColor } from "../utils/aqiColors";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CITY = { name: "Dharwad", lat: 15.4589, lon: 75.0078 };

const SUGGESTIONS = [
  "Is it safe to go outside today?",
  "What health precautions should I take?",
  "Which pollutant is most harmful right now?",
  "How does PM2.5 affect my lungs?",
  "What are symptoms of air pollution exposure?",
];

// ─────────────────────────────────────────────────────────────────────────────
// SearchableCitySelector (Reused from Dashboard for consistency)
// ─────────────────────────────────────────────────────────────────────────────
function SearchableCitySelector({ selectedCity, onSelect, cities }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
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
    if (q.length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
        params: { q, format: "json", addressdetails: 1, limit: 5, countrycodes: "in" },
      });
      setResults(data.map(item => ({
        name: item.display_name.split(",")[0],
        fullName: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        state: item.address.state || item.address.county || "",
      })));
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (query) searchCities(query); }, 600);
    return () => clearTimeout(timer);
  }, [query, searchCities]);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "240px" }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          placeholder={selectedCity.name}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          style={{
            width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "7px 12px 7px 30px", color: "var(--text)", fontSize: 13, outline: "none"
          }}
        />
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔍</span>
      </div>
      {isOpen && (
        <div className="dropdown-menu" style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8, borderRadius: 16, zIndex: 1000,
          maxHeight: 250, overflowY: "auto", padding: "8px"
        }}>
          {results.map((city, i) => (
            <div key={i} onClick={() => { onSelect(city); setIsOpen(false); setQuery(""); }} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "var(--text)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>{city.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{city.fullName}</div>
            </div>
          ))}
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", padding: "8px 8px 4px", textTransform: "uppercase" }}>Quick Select</div>
          {cities.slice(0, 5).map((city, i) => (
            <div key={`q-${i}`} onClick={() => { onSelect(city); setIsOpen(false); setQuery(""); }} style={{ padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: "var(--text)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg-card)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {city.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(79,142,247,0.2)", borderTopColor: "#4f8ef7", animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>Thinking…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AqiContextBanner({ aqiData, loading, error }) {
  if (loading) return <div style={{ padding: "12px 18px", background: "rgba(79,142,247,0.06)", borderRadius: 12, marginBottom: 16, fontSize: 13, color: "var(--muted)" }}>Fetching live AQI data…</div>;
  if (error) return <div style={{ padding: "12px 18px", background: "rgba(239,68,68,0.06)", borderRadius: 12, marginBottom: 16, fontSize: 13, color: "#ef4444" }}>⚠️ {error}</div>;
  if (!aqiData) return null;

  const color = getAqiColor(aqiData.aqi_category);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "14px 18px", background: `${color}18`, border: `1px solid ${color}40`, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}><span style={{ fontSize: 16 }}>📍</span><span style={{ fontSize: 14, fontWeight: 700 }}>{aqiData.city}</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>AQI</span><span style={{ fontSize: 22, fontWeight: 900, color }}>{aqiData.aqi}</span></div>
      <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, background: `${color}25`, color, border: `1px solid ${color}60` }}>{aqiData.aqi_category}</span>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, background: isUser ? "linear-gradient(135deg,#4f8ef7,#a855f7)" : "linear-gradient(135deg,#00d4ff,#4f8ef7)" }}>{isUser ? "👤" : "🤖"}</div>
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ padding: "12px 16px", borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px", background: isUser ? "linear-gradient(135deg,rgba(79,142,247,0.25),rgba(168,85,247,0.20))" : "var(--bg-card)", border: isUser ? "1px solid rgba(79,142,247,0.3)" : "1px solid var(--border)", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg.content}</div>
        {msg.sources?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingLeft: 4 }}>
            {msg.sources.map((src, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "rgba(79,142,247,0.10)", border: "1px solid rgba(79,142,247,0.25)", color: "#4f8ef7" }}>📄 {src}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Chatbot Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Chatbot() {
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState("");
  const [sending,      setSending]      = useState(false);
  const [selectedCity, setSelectedCity] = useState(DEFAULT_CITY);
  const [aqiData,      setAqiData]      = useState(null);
  const [aqiLoading,   setAqiLoading]   = useState(false);
  const [aqiError,     setAqiError]     = useState(null);
  const [cities,       setCities]       = useState([]);

  const scrollRef = useRef(null);
  const inputRef  = useRef(null);

  // Fix: Improved scrolling that targets the specific container only
  useEffect(() => {
    if (scrollRef.current) {
      const { scrollHeight, clientHeight } = scrollRef.current;
      scrollRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior: "smooth"
      });
    }
  }, [messages, sending]);

  useEffect(() => {
    axios.get("/api/cities").then(({ data }) => setCities(data)).catch(() => {});
  }, []);

  const fetchAqi = useCallback(async (city) => {
    setAqiLoading(true); setAqiError(null); setAqiData(null);
    try {
      const { data } = await axios.get("/api/air-quality", { params: { lat: city.lat, lon: city.lon, city: city.name }, timeout: 10000 });
      setAqiData(data);
    } catch { setAqiError("Failed to fetch AQI."); } finally { setAqiLoading(false); }
  }, []);

  useEffect(() => { fetchAqi(selectedCity); }, [selectedCity, fetchAqi]);

  useEffect(() => {
    setMessages([{ role: "assistant", content: "Hello! I'm your Air Quality Health Advisor 🌿\n\nAsk me anything about air pollution or precautions for your city.", sources: [], time: new Date().toLocaleTimeString() }]);
  }, []);

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim();
    if (!trimmed || sending) return;
    setMessages(prev => [...prev, { role: "user", content: trimmed }]);
    setInput(""); setSending(true);
    try {
      const { data } = await axios.post("/api/chat", { message: trimmed, city: selectedCity.name, aqi_data: aqiData ?? {} }, { timeout: 30000 });
      setMessages(prev => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠️ Backend unreachable. Please try again.", sources: [] }]);
    } finally { setSending(false); inputRef.current?.focus(); }
  }

  return (
    <div className="page-shell" style={{ background: "var(--bg-base)" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px 16px", maxWidth: 1200, margin: "0 auto", width: "100%", height: "calc(100vh - 68px - 24px - 16px)", minHeight: 0 }}>
        
        <PageHeader title="🤖 AirSight AI Chatbot" subtitle="Real-time health advisory and RAG-powered pollution insights">
          <SearchableCitySelector selectedCity={selectedCity} onSelect={setSelectedCity} cities={cities} />
          <button onClick={() => fetchAqi(selectedCity)} className="btn-secondary" style={{ padding: "8px 12px" }}>🔄</button>
        </PageHeader>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <AqiContextBanner aqiData={aqiData} loading={aqiLoading} error={aqiError} />
          
          <div className="glass" style={{ flex: 1, display: "flex", flexDirection: "column", borderRadius: 20, overflow: "hidden", border: "1px solid rgba(79,142,247,0.15)", minHeight: 0 }}>
            {/* Scrollable message container */}
            <div 
              ref={scrollRef}
              style={{ flex: 1, overflowY: "auto", padding: "20px", scrollbarWidth: "thin" }}
            >
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {sending && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#00d4ff,#4f8ef7)" }}>🤖</div>
                  <div style={{ background: "var(--bg-card)", borderRadius: "4px 18px 18px 18px", border: "1px solid var(--border)" }}><Spinner /></div>
                </div>
              )}
            </div>

            {/* Input area */}
            <div style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-end", background: "rgba(7,12,24,0.5)" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about air quality, health effects, precautions…"
                disabled={sending}
                rows={1}
                style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 14, resize: "none", outline: "none" }}
              />
              <button onClick={() => sendMessage()} disabled={sending || !input.trim()} style={{ width: 42, height: 42, borderRadius: 12, background: sending || !input.trim() ? "rgba(79,142,247,0.2)" : "linear-gradient(135deg,#4f8ef7,#a855f7)", border: "none", color: "var(--text)", cursor: "pointer" }}>➤</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
