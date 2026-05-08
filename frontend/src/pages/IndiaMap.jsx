import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, ZoomControl } from "react-leaflet";
import L from "leaflet";
import axios from "axios";
import { getAqiColor, AQI_COLORS } from "../utils/aqiColors";

// ── Leaflet Icon Fix ────────────────────────────────────────────────────────
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const createCustomIcon = (color, isSelected = false) => {
  return L.divIcon({
    className: "custom-div-icon",
    html: `
      <div style="background-color: ${color}; width: ${isSelected ? "18px" : "14px"}; height: ${isSelected ? "18px" : "14px"}; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 15px ${color}; transition: all 0.3s ease;"></div>
    `,
    iconSize: [isSelected ? 18 : 14, isSelected ? 18 : 14],
    iconAnchor: [isSelected ? 9 : 7, isSelected ? 9 : 7],
  });
};

// ── Cities List ──────────────────────────────────────────────────────────────
const CITIES = [
  { name: "Delhi",              lat: 28.6139, lon: 77.2090, state: "Delhi" },
  { name: "Mumbai",             lat: 19.0760, lon: 72.8777, state: "Maharashtra" },
  { name: "Bangalore",          lat: 12.9716, lon: 77.5946, state: "Karnataka" },
  { name: "Chennai",            lat: 13.0827, lon: 80.2707, state: "Tamil Nadu" },
  { name: "Kolkata",            lat: 22.5726, lon: 88.3639, state: "West Bengal" },
  { name: "Hyderabad",          lat: 17.3850, lon: 78.4867, state: "Telangana" },
  { name: "Pune",               lat: 18.5204, lon: 73.8567, state: "Maharashtra" },
  { name: "Ahmedabad",          lat: 23.0225, lon: 72.5714, state: "Gujarat" },
  { name: "Lucknow",            lat: 26.8467, lon: 80.9462, state: "Uttar Pradesh" },
  { name: "Jaipur",             lat: 26.9124, lon: 75.7873, state: "Rajasthan" },
  { name: "Dharwad",            lat: 15.4589, lon: 75.0078, state: "Karnataka" },
  { name: "Bhopal",             lat: 23.2599, lon: 77.4126, state: "Madhya Pradesh" },
  { name: "Patna",              lat: 25.5941, lon: 85.1376, state: "Bihar" },
  { name: "Srinagar",           lat: 34.0837, lon: 74.7973, state: "Jammu & Kashmir" },
  { name: "Guwahati",           lat: 26.1445, lon: 91.7362, state: "Assam" },
  { name: "Thiruvananthapuram", lat: 8.5241,  lon: 76.9366, state: "Kerala" },
  { name: "Bhubaneswar",        lat: 20.2961, lon: 85.8245, state: "Odisha" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Mini Components
// ─────────────────────────────────────────────────────────────────────────────

function MapEvents({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

function ChatAdvice({ messages, loading, city, data }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const color = data ? getAqiColor(data.aqi_category) : "var(--blue)";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", background: "rgba(0,0,0,0.1)" }}>
      {/* City Header */}
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>{city?.name || "Select a City"}</span>
          {data && <span style={{ fontSize: 18, fontWeight: 900, color }}>{data.aqi}</span>}
        </div>
        <div style={{ fontSize: 12, color: data ? color : "var(--muted)", fontWeight: 600 }}>{data?.aqi_category || "Click a marker to get advice"}</div>
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px", scrollbarWidth: "thin" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16, textAlign: m.role === "user" ? "right" : "left" }}>
            <div style={{
              display: "inline-block", padding: "10px 14px", borderRadius: 14, fontSize: 13, lineHeight: 1.5,
              background: m.role === "user" ? "var(--blue)20" : "var(--bg-glass)",
              border: "1px solid var(--border)", color: "var(--text)", maxWidth: "90%",
              textAlign: "left", whiteSpace: "pre-wrap"
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: "10px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: "pulse 1s infinite 0s" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: "pulse 1s infinite 0.2s" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted)", animation: "pulse 1s infinite 0.4s" }} />
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div style={{ padding: "12px 16px", background: "var(--bg-card)", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--muted)" }}>
        🤖 Bot automatically generates precautions based on live AQI.
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Map Component
// ─────────────────────────────────────────────────────────────────────────────
export default function IndiaMap() {
  const [aqiData, setAqiData] = useState({});
  const [selectedCity, setSelectedCity] = useState(null);
  const [loadingCity, setLoadingCity] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [tempMarker, setTempMarker] = useState(null);

  const askChatbot = async (city, data) => {
    setChatLoading(true);
    const prompt = `Give me 3 brief, bulleted health precautions and 1 action measure for ${city.name} where the AQI is currently ${data.aqi} (${data.aqi_category}). Keep it concise.`;
    
    // Add user-like pseudo-message if we want, or just show assistant answer
    try {
      const response = await axios.post("/api/chat", {
        message: prompt,
        city: city.name,
        aqi_data: data
      }, { timeout: 30000 });
      
      setChatMessages(prev => [
        ...prev, 
        { role: "assistant", content: response.data.answer }
      ]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "⚠️ Sorry, I couldn't generate advice for this location." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const fetchAQI = async (city) => {
    setLoadingCity(city.name);
    setSelectedCity(city);
    
    try {
      const { data } = await axios.get("/api/air-quality", {
        params: { lat: city.lat, lon: city.lon, city: city.name },
        timeout: 15000,
      });
      setAqiData(prev => ({ ...prev, [city.name]: data }));
      // Automatically ask chatbot when AQI is fetched
      askChatbot(city, data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCity(null);
    }
  };

  const handleMapClick = (latlng) => {
    const newCity = {
      name: "Current Spot",
      lat: latlng.lat,
      lon: latlng.lng,
      state: `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`
    };
    setTempMarker(newCity);
    fetchAQI(newCity);
  };

  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main" style={{ height: "calc(100vh - 80px)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 className="gradient-text" style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>Interactive AQI Map</h1>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Click any city or spot on the map to get AI-powered health advice based on live AQI.</p>
        </div>

        {/* Content Grid */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, minHeight: 0 }} className="map-grid">
          
          {/* Map Section */}
          <div className="glass" style={{ borderRadius: 24, overflow: "hidden", position: "relative" }}>
            <MapContainer center={[22.5937, 78.9629]} zoom={5} zoomControl={false} style={{ width: "100%", height: "100%" }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <ZoomControl position="bottomright" />
              <MapEvents onMapClick={handleMapClick} />

              {CITIES.map(city => {
                const data = aqiData[city.name];
                const color = data ? getAqiColor(data.aqi_category) : "var(--blue)";
                const isSelected = selectedCity?.name === city.name;
                return (
                  <Marker key={city.name} position={[city.lat, city.lon]} icon={createCustomIcon(color, isSelected)} eventHandlers={{ click: () => fetchAQI(city) }}>
                    <Popup className="premium-popup">
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{city.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>AQI: {data?.aqi || "..."}</div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {tempMarker && (
                <Marker position={[tempMarker.lat, tempMarker.lon]} icon={createCustomIcon("#00d4ff", true)}>
                   <Popup autoOpen className="premium-popup">
                      <div style={{ minWidth: 150 }}>
                        <div style={{ fontWeight: 800 }}>Custom Spot</div>
                        <div style={{ fontSize: 11 }}>{tempMarker.state}</div>
                      </div>
                   </Popup>
                </Marker>
              )}
            </MapContainer>

            {/* Legend */}
            <div className="glass" style={{ position: "absolute", bottom: 20, left: 20, zIndex: 1000, padding: "12px", borderRadius: 16 }}>
               {Object.entries(AQI_COLORS).map(([label, color]) => (
                 <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                   <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                   <span style={{ fontSize: 11 }}>{label}</span>
                 </div>
               ))}
            </div>
          </div>

          {/* AI Sidebar */}
          <div className="glass" style={{ borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid var(--border)" }}>
            <div style={{ padding: "16px 20px", background: "var(--blue)15", borderBottom: "1px solid var(--border)" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>🤖 AI Health Assistant</h3>
            </div>
            <ChatAdvice 
              messages={chatMessages} 
              loading={chatLoading || loadingCity} 
              city={selectedCity} 
              data={aqiData[selectedCity?.name]} 
            />
          </div>

        </div>
      </div>

      <style>{`
        .leaflet-container { background: #070c18 !important; }
        .premium-popup .leaflet-popup-content-wrapper { background: var(--bg-surface) !important; color: var(--text) !important; border: 1px solid var(--border) !important; border-radius: 12px !important; }
        .premium-popup .leaflet-popup-tip { background: var(--bg-surface) !important; }
        @media (max-width: 1000px) { .map-grid { grid-template-columns: 1fr !important; height: auto !important; } }
      `}</style>
    </div>
  );
}
