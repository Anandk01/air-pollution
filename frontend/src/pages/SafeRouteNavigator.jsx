import React, { useState, useEffect, useCallback } from 'react';
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

const DestinationSelector = ({ locations, onSelect, selectedId }) => (
  <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '10px 0', scrollbarWidth: 'none' }}>
    {locations.map(loc => (
      <button
        key={loc.id}
        onClick={() => onSelect(loc)}
        className={`glass ${selectedId === loc.id ? 'glass-active' : ''}`}
        style={{ 
          padding: '12px 24px', borderRadius: '20px', whiteSpace: 'nowrap', 
          fontSize: '14px', fontWeight: '600', cursor: 'pointer', flexShrink: 0,
          transition: 'all 0.3s ease'
        }}
      >
        {loc.activity_name === 'Gym' && '💪 '}
        {loc.activity_name === 'Office' && '💼 '}
        {loc.activity_name === 'Home' && '🏠 '}
        {loc.activity_name === 'Hospital' && '🏥 '}
        {loc.activity_name === 'College' && '🎓 '}
        {loc.activity_name}
      </button>
    ))}
  </div>
);

const RouteComparisonCard = ({ route, isSelected, onClick }) => {
  const getRiskColor = (level) => {
    if (level === 'Low') return '#22c55e';
    if (level === 'Moderate') return '#eab308';
    return '#ef4444';
  };

  return (
    <div 
      onClick={onClick}
      className={`glass route-card ${isSelected ? 'glass-active' : ''}`}
      style={{ 
        padding: '18px', 
        borderRadius: '20px', 
        cursor: 'pointer', 
        marginBottom: '14px',
        transition: 'all 0.3s ease',
        border: isSelected ? '2px solid rgba(34, 197, 94, 0.5)' : '2px solid transparent'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {route.is_recommended && (
            <span style={{ 
              padding: '5px 12px', borderRadius: '8px', fontSize: '11px', 
              fontWeight: 'bold', background: '#22c55e', color: 'white' 
            }}>
              ⭐ SAFEST
            </span>
          )}
          {route.label && !route.is_recommended && (
            <span style={{ 
              padding: '5px 12px', borderRadius: '8px', fontSize: '11px', 
              fontWeight: 'bold', background: route.color, color: 'white' 
            }}>
              {route.label.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ 
          fontSize: '12px', 
          fontWeight: 'bold', 
          color: getRiskColor(route.risk_level),
          padding: '4px 10px',
          borderRadius: '8px',
          background: `${getRiskColor(route.risk_level)}20`
        }}>
          {route.risk_level} Risk
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Duration</div>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{route.duration_min} min</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Distance</div>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{route.distance_km} km</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Exposure</div>
          <div style={{ 
            fontSize: '18px', 
            fontWeight: '700', 
            color: getRiskColor(route.risk_level)
          }}>
            {route.exposure_score.toFixed(1)}
          </div>
        </div>
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '16px', 
        fontSize: '12px', 
        color: 'var(--muted)',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        <span>⚠️ {route.hazard_count} hazards</span>
        <span>🔴 {route.high_risk_segments} danger zones</span>
      </div>

      {route.breakdown && (
        <div style={{ 
          marginTop: '12px', 
          padding: '10px', 
          borderRadius: '10px', 
          background: 'rgba(0,0,0,0.2)',
          fontSize: '11px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>PM2.5: {(route.breakdown.pm25 * 100).toFixed(0)}%</div>
            <div>NO₂: {(route.breakdown.no2 * 100).toFixed(0)}%</div>
            <div>Reports: {(route.breakdown.reports * 100).toFixed(0)}%</div>
            <div>Anomalies: {(route.breakdown.anomaly * 100).toFixed(0)}%</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function SafeRouteNavigator() {
  const { profile } = useProfile();
  const [savedLocations, setSavedLocations] = useState([]);
  const [selectedDest, setSelectedDest] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transportMode, setTransportMode] = useState('driving');
  const [gpsError, setGpsError] = useState(null);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await axios.get('/api/profile/saved-locations');
      setSavedLocations(res.data.locations || []);
      if (res.data.locations?.length > 0 && !selectedDest) {
        setSelectedDest(res.data.locations[0]);
      }
    } catch (err) {
      console.error("Failed to fetch locations", err);
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
      alert("Please select a destination");
      return;
    }
    
    setLoading(true);
    setGpsError(null);
    
    try {
      const gps = await getGPS();
      setCurrentPos(gps);

      const res = await axios.post('/api/routes/safe-navigate', {
        source: gps,
        destination_id: selectedDest.id,
        transport_mode: transportMode
      });

      if (res.data.success && res.data.routes) {
        setRoutes(res.data.routes);
        const safest = res.data.routes.find(r => r.is_recommended) || res.data.routes[0];
        setSelectedRoute(safest);
      }
    } catch (err) {
      console.error("Navigation failed", err);
      setGpsError(err.response?.data?.error || err.message || "Failed to calculate routes");
      alert("Failed to start navigation. Please check GPS permissions and try again.");
    } finally {
      setLoading(false);
    }
  };

  const hazards = selectedRoute?.hazards || [];

  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 68px)', gap: '20px', padding: '24px' }}>
        
        <div className="animate-fade-in">
          <h2 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '6px' }} className="gradient-text">
            🛡️ Safe Route Navigator
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '18px' }}>
            AI-powered route planning based on real-time pollution, health profile, and community reports
          </p>
          
          <DestinationSelector 
            locations={savedLocations} 
            onSelect={setSelectedDest} 
            selectedId={selectedDest?.id} 
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', flex: 1, minHeight: 0 }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
            
            <div className="glass" style={{ padding: '22px', borderRadius: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--muted)' }}>
                Transport Mode
              </div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '18px' }}>
                {[
                  { mode: 'driving', icon: '🚗', label: 'Drive' },
                  { mode: 'walking', icon: '🚶', label: 'Walk' },
                  { mode: 'bicycling', icon: '🚲', label: 'Bike' }
                ].map(({ mode, icon, label }) => (
                  <button 
                    key={mode}
                    onClick={() => setTransportMode(mode)}
                    className={`glass ${transportMode === mode ? 'glass-active' : ''}`}
                    style={{ 
                      flex: 1, 
                      padding: '12px 8px', 
                      borderRadius: '14px', 
                      fontSize: '13px', 
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <div>{icon}</div>
                    <div style={{ fontSize: '11px', marginTop: '4px' }}>{label}</div>
                  </button>
                ))}
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

              {routes.filter(r => r.route_index !== selectedRoute?.route_index).map(r => (
                <Polyline 
                  key={`alt-${r.route_index}`}
                  positions={r.coordinates}
                  pathOptions={{
                    color: '#94a3b8',
                    weight: 5,
                    opacity: 0.4
                  }}
                />
              ))}

              {selectedRoute && (
                <Polyline 
                  positions={selectedRoute.coordinates}
                  pathOptions={{
                    color: selectedRoute.color,
                    weight: 7,
                    opacity: 0.9
                  }}
                />
              )}

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
                  <Popup>📍 Your Current Location</Popup>
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
