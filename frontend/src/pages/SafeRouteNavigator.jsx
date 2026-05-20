import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import { useProfile } from '../context/ProfileContext';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapAutoCenter = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo([coords.lat, coords.lon], 13, { duration: 1.5 });
  }, [coords, map]);
  return null;
};

const PLACE_ICONS = {
  'Gym': '💪', 'Office': '💼', 'Home': '🏠', 'Hospital': '🏥',
  'College': '🎓', 'School': '🏫', 'Park': '🌳', 'Jogging Park': '🏃',
  'Mall': '🛍️', 'Temple': '🛕', 'Restaurant': '🍽️', 'Work': '💼',
};

// ── Nominatim search ─────────────────────────────────────────────────────────────────
const OSM_ICONS = {
  hospital: '🏥', school: '🏫', college: '🎓', university: '🎓',
  restaurant: '🍽️', cafe: '☕', fast_food: '🍔', pharmacy: '💊',
  bank: '🏦', fuel: '⛽', parking: '🅿️', place_of_worship: '🛕',
  gym: '💪', cinema: '🎬', library: '📚', police: '👮',
  bus_station: '🚌', railway_station: '🚉', shop: '🛍️',
};

function placeIcon(cat, type) {
  return OSM_ICONS[type] || OSM_ICONS[cat]
    || (cat === 'highway' ? '🛣️' : cat === 'railway' ? '🚉'
      : cat === 'shop' ? '🛍️' : cat === 'leisure' ? '🌳'
      : cat === 'tourism' ? '🏨' : '📍');
}

function DestinationSearch({ onSelect, selectedName }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const debounceRef  = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: query, format: 'json', addressdetails: 1, namedetails: 1,
                    extratags: 1, limit: 8 },
          headers: { 'Accept-Language': 'en' },
        });
        setResults(data.map(r => ({
          short: r.namedetails?.name || r.address?.road
            || r.address?.neighbourhood || r.address?.suburb
            || r.display_name.split(',')[0],
          display: r.display_name,
          category: r.class, type: r.type,
          lat: parseFloat(r.lat), lon: parseFloat(r.lon),
        })));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div ref={containerRef} style={{ position: 'relative', marginBottom: 12 }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none', opacity: 0.6 }}>🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={e => { e.target.style.borderColor = '#6366f1'; setOpen(true); }}
          onBlur={e  => { e.target.style.borderColor = 'var(--border)'; }}
          placeholder={selectedName ? `📍 ${selectedName}` : 'Search roads, areas, shops, hospitals…'}
          style={{
            width: '100%', padding: '11px 36px 11px 36px',
            borderRadius: 12, fontSize: 13, outline: 'none',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text)', transition: 'border-color 0.2s',
          }}
        />
        {loading && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted)' }}>⏳</span>}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
        )}
      </div>

      {open && (results.length > 0 || (query.length >= 2 && !loading)) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 14, zIndex: 9999, maxHeight: 300, overflowY: 'auto',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>No results for "{query}"</div>
          ) : results.map((r, i) => (
            <div key={i}
              onClick={() => { onSelect(r); setQuery(''); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', cursor: 'pointer',
                borderBottom: i < results.length - 1 ? '1px solid var(--border-subtle)' : 'none', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{placeIcon(r.category, r.type)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.short}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.display}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DestinationSelector = ({ locations, onSelect, selectedId }) => (
  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0 10px', scrollbarWidth: 'none' }}>
    {locations.map(loc => {
      const isSelected = selectedId === loc.id;
      const icon = PLACE_ICONS[loc.activity_name] || '📍';
      return (
        <button
          key={loc.id}
          onClick={() => onSelect(loc)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px', borderRadius: 12, whiteSpace: 'nowrap',
            fontSize: '13px', fontWeight: isSelected ? 700 : 500,
            cursor: 'pointer', flexShrink: 0,
            transition: 'all 0.15s ease',
            background: isSelected ? '#6366f1' : 'rgba(255,255,255,0.06)',
            color: isSelected ? '#fff' : 'var(--muted)',
            border: isSelected ? '2px solid #818cf8' : '2px solid transparent',
            boxShadow: isSelected ? '0 0 0 3px rgba(99,102,241,0.25), 0 4px 12px rgba(99,102,241,0.4)' : 'none',
            outline: 'none',
          }}
          onMouseDown={e  => { e.currentTarget.style.transform = 'scale(0.94)'; }}
          onMouseUp={e    => { e.currentTarget.style.transform = ''; }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
        >
          <span style={{ fontSize: 16 }}>{icon}</span>
          {loc.activity_name}
        </button>
      );
    })}
  </div>
);

const RouteComparisonCard = ({ route, isSelected, onClick }) => (
  <div
    onClick={onClick}
    className={`glass route-card ${isSelected ? 'glass-active' : ''}`}
    style={{
      padding: '18px', borderRadius: '20px', cursor: 'pointer', marginBottom: '14px',
      transition: 'all 0.3s ease',
      border: `2px solid ${isSelected ? route.color : route.has_critical ? 'rgba(239,68,68,0.4)' : 'transparent'}`
    }}
  >
    {/* Fire / critical hazard banner */}
    {route.has_critical && (
      <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', fontSize: 12, color: '#ef4444', fontWeight: 700 }}>
        🔥 ACTIVE HAZARD — {[...new Set((route.hazards || []).filter(h => h.critical).map(h => h.type))].join(', ') || 'FIRE/CHEMICAL'} on this route
      </div>
    )}

    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {route.is_recommended
          ? <span style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', background: '#22c55e', color: 'white' }}>⭐ SAFEST</span>
          : <span style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', background: route.color, color: 'white' }}>{(route.label || 'Route').toUpperCase()}</span>
        }
        {route.exceeds_threshold && (
          <span style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 'bold', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }}>⚠️ UNSAFE FOR YOU</span>
        )}
      </div>
      <div style={{ fontSize: '12px', fontWeight: 'bold', color: route.color, padding: '4px 10px', borderRadius: '8px', background: `${route.color}20` }}>
        {route.risk_level} Risk
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '12px' }}>
      <div><div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Duration</div><div style={{ fontSize: '18px', fontWeight: '700' }}>{route.duration_min} min</div></div>
      <div><div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Distance</div><div style={{ fontSize: '18px', fontWeight: '700' }}>{route.distance_km} km</div></div>
      <div><div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Exposure</div><div style={{ fontSize: '18px', fontWeight: '700', color: route.color }}>{route.exposure_score?.toFixed(2)}</div></div>
    </div>

    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--muted)', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <span>⚠️ {route.hazard_count} hazards</span>
      <span>🌫️ ~{route.est_pm25} µg/m³</span>
      <span style={{ color: route.exceeds_threshold ? '#ef4444' : '#22c55e' }}>
        {route.exceeds_threshold ? '🔴' : '🟢'} Limit: {route.personal_threshold}
      </span>
    </div>
  </div>
);

export default function SafeRouteNavigator() {
  const { profile } = useProfile();
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [homePos, setHomePos] = useState(null);
  const [useGPS, setUseGPS] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transportMode, setTransportMode] = useState('driving');
  const [gpsError, setGpsError] = useState(null);
  const [noLocations, setNoLocations] = useState(false);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await axios.get('/api/profile/saved-locations');
      const locs = res.data.locations || [];
      setSavedLocations(locs);
      setNoLocations(locs.length === 0);
      if (locs.length > 0 && !selectedDest) setSelectedDest(locs[0]);

      // also fetch home location
      const profRes = await axios.get('/api/profile/');
      const h = profRes.data?.locations?.home;
      if (h?.lat && h?.lon) setHomePos({ lat: h.lat, lon: h.lon, label: h.address || 'Home' });
    } catch (err) {
      console.error('Failed to fetch locations', err);
    }
  }, [selectedDest]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const getGPS = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const startNavigation = async () => {
    if (!selectedDest) {
      alert('Please select a destination');
      return;
    }
    setLoading(true);
    setGpsError(null);

    try {
      let source = null;

      if (useGPS) {
        const gps = await getGPS();
        source = gps;
        setCurrentPos(gps);
      } else if (homePos) {
        source = { lat: homePos.lat, lon: homePos.lon };
        setCurrentPos(source);
      }
      // if neither, backend will use saved home from DB

      const res = await axios.post('/api/routes/safe-navigate', {
        ...(source ? { source } : {}),
        destination_id: selectedDest.id,
        transport_mode: transportMode,
      });

      if (res.data.success && res.data.routes) {
        setRoutes(res.data.routes);
        // Always select the recommended (green/safe) route by default
        const recommended = res.data.routes.find(r => r.is_recommended)
          || res.data.routes.find(r => !r.has_critical)
          || res.data.routes[0];
        setSelectedRoute(recommended);
        if (res.data.all_routes_unsafe) {
          setGpsError('⚠️ All routes pass through an active hazard. Showing least-dangerous option. Consider delaying your trip.');
        }
      }
    } catch (err) {
      console.error('Navigation failed', err);
      setGpsError(err.response?.data?.error || err.message || 'Failed to calculate routes');
    } finally {
      setLoading(false);
    }
  };

  const hazards = selectedRoute?.hazards || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", gap: "20px", padding: "0", margin: "-28px -32px" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "20px", padding: "24px", minHeight: 0 }}>
        
        <div className="animate-fade-in">
          <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '6px' }} className="gradient-text">
            🛡️ Safe Route Navigator
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '18px' }}>
            AI-powered route planning based on real-time pollution, health profile, and community reports
          </p>
          
          {noLocations ? (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>
              ⚠️ No saved locations found. <a href="/profile" style={{ color: '#ef4444', fontWeight: 700 }}>Add locations in your profile</a> to use safe navigation.
            </div>
          ) : (
            <DestinationSelector 
              locations={savedLocations} 
              onSelect={setSelectedDest} 
              selectedId={selectedDest?.id} 
            />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
            
            <div className="glass" style={{ padding: '22px', borderRadius: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--muted)' }}>
                Start From
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[
                  { id: false, label: '🏠 Home' },
                  { id: true,  label: '📡 Live GPS' },
                ].map(({ id, label }) => {
                  const active = useGPS === id;
                  return (
                    <button
                      key={String(id)}
                      onClick={() => setUseGPS(id)}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 12, fontSize: 13,
                        cursor: 'pointer', fontWeight: active ? 700 : 500,
                        background: active ? '#6366f1' : 'rgba(255,255,255,0.06)',
                        color: active ? '#fff' : 'var(--muted)',
                        border: active ? '2px solid #818cf8' : '2px solid transparent',
                        boxShadow: active ? '0 0 0 3px rgba(99,102,241,0.25)' : 'none',
                        transition: 'all 0.15s', outline: 'none',
                      }}
                      onMouseDown={e  => { e.currentTarget.style.transform = 'scale(0.95)'; }}
                      onMouseUp={e    => { e.currentTarget.style.transform = ''; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {!homePos && !useGPS && (
                <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                  ⚠️ No home address saved. <a href="/profile" style={{ color: '#f59e0b', fontWeight: 700 }}>Set it in your profile</a> or use Live GPS.
                </div>
              )}
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--muted)' }}>
                Transport Mode
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                {[
                  { mode: 'driving',   icon: '🚗', label: 'Drive' },
                  { mode: 'walking',   icon: '🚶', label: 'Walk'  },
                  { mode: 'bicycling', icon: '🚲', label: 'Bike'  }
                ].map(({ mode, icon, label }) => {
                  const active = transportMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setTransportMode(mode)}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: 14,
                        fontSize: 13, cursor: 'pointer', fontWeight: active ? 700 : 500,
                        transition: 'all 0.15s', outline: 'none',
                        background: active ? '#6366f1' : 'rgba(255,255,255,0.06)',
                        color:      active ? '#fff'    : 'var(--muted)',
                        border:     active ? '2px solid #818cf8' : '2px solid transparent',
                        boxShadow:  active ? '0 0 0 3px rgba(99,102,241,0.25), 0 4px 12px rgba(99,102,241,0.4)' : 'none',
                      }}
                      onMouseDown={e  => { e.currentTarget.style.transform = 'scale(0.94)'; }}
                      onMouseUp={e    => { e.currentTarget.style.transform = ''; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
                    >
                      <div style={{ fontSize: 18 }}>{icon}</div>
                      <div style={{ fontSize: 11, marginTop: 4 }}>{label}</div>
                    </button>
                  );
                })}
              </div>

              <button 
                onClick={startNavigation}
                disabled={loading || !selectedDest}
                className="btn-primary" 
                style={{ 
                  width: '100%', 
                  padding: '16px', 
                  borderRadius: '16px', 
                  fontSize: '16px',
                  fontWeight: '700',
                  background: loading ? 'rgba(100,100,100,0.5)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? '📍 Analyzing Routes...' : '🚀 Start Safe Navigation'}
              </button>

              {gpsError && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '12px', 
                  borderRadius: '12px', 
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontSize: '12px',
                  color: '#ef4444'
                }}>
                  ⚠️ {gpsError}
                </div>
              )}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '6px' }}>
              {routes.map(r => (
                <RouteComparisonCard 
                  key={r.route_index} 
                  route={r} 
                  isSelected={selectedRoute?.route_index === r.route_index}
                  onClick={() => setSelectedRoute(r)}
                />
              ))}
              
              {routes.length === 0 && !loading && (
                <div className="glass" style={{ 
                  padding: '50px 20px', 
                  textAlign: 'center', 
                  borderRadius: '24px', 
                  color: 'var(--muted)' 
                }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗺️</div>
                  <p style={{ fontSize: '14px', lineHeight: '1.6' }}>
                    Select a destination and click<br/>
                    <strong>Start Safe Navigation</strong><br/>
                    to calculate pollution-aware routes
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="glass" style={{ borderRadius: '32px', overflow: 'hidden', position: 'relative' }}>
            <MapContainer 
              center={currentPos ? [currentPos.lat, currentPos.lon] : [28.6139, 77.2090]} 
              zoom={13} 
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer 
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              <MapAutoCenter coords={currentPos} />

              {/* All routes — each colored by their own score */}
              {routes.map(r => (
                <Polyline
                  key={`route-${r.route_index}`}
                  positions={r.coordinates}
                  pathOptions={{
                    color: r.color,
                    weight: selectedRoute?.route_index === r.route_index ? 7 : 4,
                    opacity: selectedRoute?.route_index === r.route_index ? 0.95 : 0.45,
                    dashArray: r.has_critical ? '10 6' : undefined,
                  }}
                />
              ))}

              {hazards.map((h, i) => (
                <CircleMarker 
                  key={`h-${i}`}
                  center={[h.lat, h.lon]}
                  radius={8}
                  pathOptions={{
                    fillColor: h.source === 'anomaly' ? '#f59e0b' : '#ef4444',
                    color: 'white',
                    weight: 2,
                    fillOpacity: 0.8
                  }}
                >
                  <Popup>
                    <div style={{ padding: '6px', fontSize: '12px' }}>
                      <strong style={{ color: h.source === 'anomaly' ? '#f59e0b' : '#ef4444' }}>
                        {h.source === 'anomaly' ? '⚠️ Anomaly' : '🚨 Report'}: {h.type}
                      </strong>
                      <div style={{ marginTop: '6px', fontSize: '11px' }}>
                        Severity: {h.severity}/10
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {currentPos && (
                <Marker position={[currentPos.lat, currentPos.lon]}>
                  <Popup>📍 {useGPS ? 'Your Current Location' : '🏠 Home'}</Popup>
                </Marker>
              )}
              
              {selectedDest && (
                <Marker position={[selectedDest.latitude, selectedDest.longitude]}>
                  <Popup>🎯 {selectedDest.activity_name}</Popup>
                </Marker>
              )}
            </MapContainer>

            <div className="glass" style={{ 
              position: 'absolute', 
              bottom: '24px', 
              right: '24px', 
              zIndex: 1000, 
              padding: '16px', 
              borderRadius: '18px', 
              fontSize: '12px',
              minWidth: '160px'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '13px' }}>Route Legend</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }}></div>
                <span>Safest Route</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#eab308' }}></div>
                <span>Moderate Risk</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
                <span>High Risk</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }}></div>
                  <span>Community Report</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }}></div>
                  <span>Pollution Anomaly</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
