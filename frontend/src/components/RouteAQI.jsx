import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import { useProfile } from '../context/ProfileContext';

// ── Icons & Assets ──────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const hazardIcon = (type) => new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div class="pulse-marker" style="background: ${type === 'ANOMALY' ? '#f59e0b' : '#ef4444'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

// ── Components ──────────────────────────────────────────────────────────────

const MapAutoCenter = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo([coords.lat, coords.lon], 13);
  }, [coords, map]);
  return null;
};

const RouteCard = ({ route, isSelected, onClick }) => {
  const badgeStyle = {
    padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase'
  };

  return (
    <div 
      onClick={onClick}
      className={`glass route-card ${isSelected ? 'glass-active' : ''}`}
      style={{ padding: '16px', borderRadius: '16px', cursor: 'pointer', marginBottom: '12px' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {route.is_safest && <span style={{ ...badgeStyle, background: '#22c55e', color: 'white' }}>Safest</span>}
          {route.is_fastest && <span style={{ ...badgeStyle, background: '#3b82f6', color: 'white' }}>Fastest</span>}
          {route.is_balanced && <span style={{ ...badgeStyle, background: '#8b5cf6', color: 'white' }}>Balanced</span>}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--muted)' }}>#{route.id}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Duration</div>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>{route.duration_min} min</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Exposure</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: route.rating === 'Safe' ? '#22c55e' : '#f59e0b' }}>
            {route.exposure_index}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--muted)' }}>
        <span>📏 {route.distance_km} km</span>
        <span>⚠️ {route.hazards_avoided} hazards</span>
      </div>
    </div>
  );
};

const DestinationSelector = ({ locations, onSelect, selectedId }) => (
  <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '10px 0', scrollbarWidth: 'none' }}>
    {locations.map(loc => (
      <button
        key={loc.id}
        onClick={() => onSelect(loc)}
        className={`glass ${selectedId === loc.id ? 'glass-active' : ''}`}
        style={{ 
          padding: '10px 20px', borderRadius: '20px', whiteSpace: 'nowrap', 
          fontSize: '13px', fontWeight: '600', cursor: 'pointer', flexShrink: 0
        }}
      >
        {loc.activity_name === 'Gym' && '💪 '}
        {loc.activity_name === 'Office' && '💼 '}
        {loc.activity_name === 'Home' && '🏠 '}
        {loc.activity_name === 'Hospital' && '🏥 '}
        {loc.activity_name}
      </button>
    ))}
  </div>
);

// ── Main Page ───────────────────────────────────────────────────────────────

export default function RouteAQI() {
  const { profile } = useProfile();
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transportMode, setTransportMode] = useState('driving');

  // Fetch saved locations
  const fetchLocations = useCallback(async () => {
    try {
      const res = await axios.get('/api/profile/saved-locations');
      setSavedLocations(res.data.locations);
      if (res.data.locations.length > 0 && !selectedDest) {
        setSelectedDest(res.data.locations[0]);
      }
    } catch (err) {
      console.error("Failed to fetch locations", err);
    }
  }, [selectedDest]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Geolocation
  const getGPS = () => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true }
      );
    });
  };

  const startNavigation = async () => {
    if (!selectedDest) return alert("Please select a destination");
    setLoading(true);
    try {
      // 1. Get Live GPS
      const gps = await getGPS();
      setCurrentPos(gps);

      // 2. Analyze Routes
      const res = await axios.post('/api/routes/analyze', {
        source: gps,
        destination_id: selectedDest.id,
        mode: transportMode
      });

      setRoutes(res.data.routes);
      if (res.data.routes.length > 0) {
        setSelectedRoute(res.data.routes[0]); // Select safest by default
      }
    } catch (err) {
      console.error("Navigation failed", err);
      alert("Failed to start navigation. Please check GPS permissions.");
    } finally {
      setLoading(false);
    }
  };

  // Collect all unique hazards from the selected route for mapping
  const hazards = selectedRoute ? selectedRoute.segments.reduce((acc, seg) => {
    seg.hazards.reports.forEach(r => acc.push({ ...r, lat: seg.lat, lon: seg.lon, category: 'REPORT' }));
    seg.hazards.anomalies.forEach(a => acc.push({ ...a, lat: seg.lat, lon: seg.lon, category: 'ANOMALY' }));
    return acc;
  }, []) : [];

  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 68px)', gap: '20px' }}>
        
        {/* Top Destination Bar */}
        <div className="animate-fade-in">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '4px' }} className="gradient-text">Safest Route Explorer</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>Personalized navigation based on your health profile and real-time hazards.</p>
          
          <DestinationSelector 
            locations={savedLocations} 
            onSelect={setSelectedDest} 
            selectedId={selectedDest?.id} 
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
          
          {/* Left Panel: Controls & Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="glass" style={{ padding: '20px', borderRadius: '24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['driving', 'walking', 'bike'].map(m => (
                  <button 
                    key={m}
                    onClick={() => setTransportMode(m)}
                    className={`glass ${transportMode === m ? 'glass-active' : ''}`}
                    style={{ flex: 1, padding: '8px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize' }}
                  >
                    {m === 'bike' ? '🚲' : m === 'walking' ? '🚶' : '🚗'} {m}
                  </button>
                ))}
              </div>

              <button 
                onClick={startNavigation}
                disabled={loading}
                className="btn-primary" 
                style={{ width: '100%', padding: '14px', borderRadius: '16px', fontSize: '16px' }}
              >
                {loading ? '📍 Detecting GPS...' : '🚀 Start Safe Navigation'}
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              {routes.map(r => (
                <RouteCard 
                  key={r.id} 
                  route={r} 
                  isSelected={selectedRoute?.id === r.id}
                  onClick={() => setSelectedRoute(r)}
                />
              ))}
              
              {routes.length === 0 && !loading && (
                <div className="glass" style={{ padding: '40px 20px', textAlign: 'center', borderRadius: '24px', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛰️</div>
                  <p>Select a destination and click start to calculate the safest paths.</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Map */}
          <div className="glass" style={{ borderRadius: '32px', overflow: 'hidden', position: 'relative' }}>
            <MapContainer 
              center={currentPos ? [currentPos.lat, currentPos.lon] : [28.6139, 77.2090]} 
              zoom={12} 
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapAutoCenter coords={currentPos} />

              {/* All Alternative Routes */}
              {routes.filter(r => r.id !== selectedRoute?.id).map(r => (
                <Polyline 
                  key={`alt-${r.id}`}
                  positions={polyline.decode(r.polyline)}
                  color="var(--muted)"
                  weight={4}
                  opacity={0.3}
                />
              ))}

              {/* Selected Route with Color Segments */}
              {selectedRoute && (
                <>
                   <Polyline 
                    positions={polyline.decode(selectedRoute.polyline)}
                    color="white"
                    weight={8}
                    opacity={0.2}
                  />
                  {selectedRoute.segments.map((seg, i) => (
                    <CircleMarker 
                      key={`seg-${i}`}
                      center={[seg.lat, seg.lon]}
                      radius={4}
                      pathOptions={{ 
                        fillColor: seg.aqi > 100 ? '#ef4444' : seg.aqi > 50 ? '#f59e0b' : '#22c55e',
                        color: 'white',
                        weight: 1,
                        fillOpacity: 1
                      }}
                    />
                  ))}
                </>
              )}

              {/* Hazard Markers */}
              {hazards.map((h, i) => (
                <Marker key={`h-${i}`} position={[h.lat, h.lon]} icon={hazardIcon(h.category)}>
                  <Popup>
                    <div style={{ padding: '4px' }}>
                      <strong style={{ color: h.category === 'ANOMALY' ? '#f59e0b' : '#ef4444' }}>
                        {h.category}: {h.type}
                      </strong>
                      <div style={{ fontSize: '11px', marginTop: '4px' }}>
                        Severity: {h.severity}/5<br/>
                        Distance to route: {Math.round(h.distance_m)}m
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {/* Start & End */}
              {currentPos && <Marker position={[currentPos.lat, currentPos.lon]}><Popup>Your Location</Popup></Marker>}
              {selectedDest && (
                <Marker position={[selectedDest.latitude, selectedDest.longitude]}>
                  <Popup>{selectedDest.activity_name}</Popup>
                </Marker>
              )}
            </MapContainer>

            {/* Legend Overlay */}
            <div className="glass" style={{ position: 'absolute', bottom: '24px', right: '24px', zIndex: 1000, padding: '12px', borderRadius: '16px', fontSize: '11px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }}></div> Safe
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></div> Moderate
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></div> Unsafe / Hazard
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
