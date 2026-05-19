import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
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

const ACTIVITY_ICONS = {
  Gym: '💪', Office: '💼', Home: '🏠', Hospital: '🏥', College: '🎓',
  School: '🏫', Park: '🌳', 'Jogging Park': '🏃', Mall: '🛍️', Temple: '🛕', Restaurant: '🍽️',
};

const hazardIcon = (source) => new L.DivIcon({
  className: 'custom-div-icon',
  html: `<div style="background:${source === 'anomaly' ? '#f59e0b' : '#ef4444'};width:12px;height:12px;border-radius:50%;border:2px solid white;"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const MapAutoCenter = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo([coords.lat, coords.lon], 13);
  }, [coords, map]);
  return null;
};

const RouteCard = ({ route, isSelected, onClick }) => {
  const badgeStyle = { padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' };
  const riskColor = route.risk_level === 'Low' ? '#22c55e' : route.risk_level === 'Moderate' ? '#eab308' : '#ef4444';
  return (
    <div
      onClick={onClick}
      className={`glass route-card ${isSelected ? 'glass-active' : ''}`}
      style={{ padding: '16px', borderRadius: '16px', cursor: 'pointer', marginBottom: '12px', border: isSelected ? '2px solid rgba(34,197,94,0.5)' : '2px solid transparent' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {route.is_recommended && <span style={{ ...badgeStyle, background: '#22c55e', color: 'white' }}>⭐ Safest</span>}
          {!route.is_recommended && route.label && <span style={{ ...badgeStyle, background: route.color, color: 'white' }}>{route.label}</span>}
        </div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: riskColor, padding: '4px 10px', borderRadius: '8px', background: `${riskColor}20` }}>
          {route.risk_level} Risk
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Duration</div>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>{route.duration_min} min</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Distance</div>
          <div style={{ fontSize: '16px', fontWeight: '700' }}>{route.distance_km} km</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Exposure</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: riskColor }}>{route.exposure_score?.toFixed(2)}</div>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>⚠️ {route.hazard_count} hazards</div>
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
        style={{ padding: '10px 20px', borderRadius: '20px', whiteSpace: 'nowrap', fontSize: '13px', fontWeight: '600', cursor: 'pointer', flexShrink: 0 }}
      >
        {ACTIVITY_ICONS[loc.activity_name] || '📍'} {loc.activity_name}
      </button>
    ))}
  </div>
);

export default function RouteAQI() {
  const { profile } = useProfile();
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transportMode, setTransportMode] = useState('driving');

  const fetchLocations = useCallback(async () => {
    try {
      const res = await axios.get('/api/profile/saved-locations');
      const locs = res.data.locations || [];
      setSavedLocations(locs);
      if (locs.length > 0 && !selectedDest) setSelectedDest(locs[0]);
    } catch (err) {
      console.error('Failed to fetch locations', err);
    }
  }, [selectedDest]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const getGPS = () => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: true }
    );
  });

  const startNavigation = async () => {
    if (!selectedDest) return alert('Please select a destination');
    setLoading(true);
    try {
      const gps = await getGPS();
      setCurrentPos(gps);
      const res = await axios.post('/api/routes/safe-navigate', {
        source: gps,
        destination_id: selectedDest.id,
        transport_mode: transportMode,
      });
      const routeList = res.data.routes || [];
      setRoutes(routeList);
      setSelectedRoute(routeList.find(r => r.is_recommended) || routeList[0] || null);
    } catch (err) {
      console.error('Navigation failed', err);
      alert('Failed to start navigation. Please check GPS permissions.');
    } finally {
      setLoading(false);
    }
  };

  const hazards = selectedRoute?.hazards || [];

  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 68px)', gap: '20px' }}>

        <div className="animate-fade-in">
          <h2 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '4px' }} className="gradient-text">Safest Route Explorer</h2>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>Personalized navigation based on your health profile and real-time hazards.</p>
          <DestinationSelector locations={savedLocations} onSelect={setSelectedDest} selectedId={selectedDest?.id} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>

          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="glass" style={{ padding: '20px', borderRadius: '24px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['driving', 'walking', 'bicycling'].map(m => (
                  <button
                    key={m}
                    onClick={() => setTransportMode(m)}
                    className={`glass ${transportMode === m ? 'glass-active' : ''}`}
                    style={{ flex: 1, padding: '8px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize' }}
                  >
                    {m === 'bicycling' ? '🚲' : m === 'walking' ? '🚶' : '🚗'} {m}
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
                  key={r.route_index}
                  route={r}
                  isSelected={selectedRoute?.route_index === r.route_index}
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

          <div className="glass" style={{ borderRadius: '32px', overflow: 'hidden', position: 'relative' }}>
            <MapContainer
              center={currentPos ? [currentPos.lat, currentPos.lon] : [28.6139, 77.2090]}
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapAutoCenter coords={currentPos} />

              {routes.filter(r => r.route_index !== selectedRoute?.route_index).map(r => (
                <Polyline key={`alt-${r.route_index}`} positions={r.coordinates} pathOptions={{ color: '#94a3b8', weight: 4, opacity: 0.3 }} />
              ))}

              {selectedRoute && (
                <Polyline positions={selectedRoute.coordinates} pathOptions={{ color: selectedRoute.color || '#22c55e', weight: 7, opacity: 0.9 }} />
              )}

              {hazards.map((h, i) => (
                <Marker key={`h-${i}`} position={[h.lat, h.lon]} icon={hazardIcon(h.source)}>
                  <Popup>
                    <div style={{ padding: '4px', fontSize: '12px' }}>
                      <strong style={{ color: h.source === 'anomaly' ? '#f59e0b' : '#ef4444' }}>
                        {h.source === 'anomaly' ? '⚠️ Anomaly' : '🚨 Report'}: {h.type}
                      </strong>
                      <div style={{ marginTop: '4px', fontSize: '11px' }}>Severity: {h.severity}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {currentPos && <Marker position={[currentPos.lat, currentPos.lon]}><Popup>📍 Your Location</Popup></Marker>}
              {selectedDest && (
                <Marker position={[selectedDest.latitude, selectedDest.longitude]}>
                  <Popup>🎯 {selectedDest.activity_name}</Popup>
                </Marker>
              )}
            </MapContainer>

            <div className="glass" style={{ position: 'absolute', bottom: '24px', right: '24px', zIndex: 1000, padding: '12px', borderRadius: '16px', fontSize: '11px' }}>
              {[['#22c55e', 'Safe'], ['#eab308', 'Moderate'], ['#ef4444', 'Unsafe / Hazard']].map(([color, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }}></div> {label}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
