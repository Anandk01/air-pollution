import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Rectangle, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';

// Helper to get color based on NO2 value
const getNO2Color = (val) => {
  return val > 0.0002  ? '#ef4444' :
         val > 0.00015 ? '#f97316' :
         val > 0.0001  ? '#eab308' :
         val > 0.00005 ? '#84cc16' :
                         '#22c55e';
};

const HeatmapLayer = ({ data }) => {
  if (!data || !data.features || data.features.length === 0) return null;

  const lons = [...new Set(data.features.map(f => f.geometry.coordinates[0]))].sort((a, b) => a - b);
  const lats = [...new Set(data.features.map(f => f.geometry.coordinates[1]))].sort((a, b) => a - b);
  const dLon = lons.length > 1 ? Math.abs(lons[1] - lons[0]) : 0.02;
  const dLat = lats.length > 1 ? Math.abs(lats[1] - lats[0]) : 0.02;

  return (
    <>
      {data.features.map((feature, idx) => {
        const [lon, lat] = feature.geometry.coordinates;
        const no2 = feature.properties.no2;
        const color = getNO2Color(no2);
        const bounds = [
          [lat - dLat / 2, lon - dLon / 2],
          [lat + dLat / 2, lon + dLon / 2]
        ];
        return (
          <Rectangle
            key={idx}
            bounds={bounds}
            pathOptions={{ fillColor: color, color: color, weight: 0, fillOpacity: 0.3 }}
          >
            <Popup>
              <div style={{ fontWeight: 600, color: '#111' }}>
                NO₂: {no2.toFixed(6)} mol/m²<br/>
                Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
              </div>
            </Popup>
          </Rectangle>
        );
      })}
    </>
  );
};

const Legend = () => {
  return (
    <div className="glass" style={{
      position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000,
      padding: '12px', borderRadius: '12px', fontSize: '12px', color: 'var(--text)'
    }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>NO₂ Density (mol/m²)</h4>
      {[
        { color: '#ef4444', label: '> 0.0002' },
        { color: '#f97316', label: '0.00015 - 0.0002' },
        { color: '#eab308', label: '0.0001 - 0.00015' },
        { color: '#84cc16', label: '0.00005 - 0.0001' },
        { color: '#22c55e', label: '< 0.00005' }
      ].map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: item.color, borderRadius: '2px' }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const MapUpdater = ({ center }) => {
  const map = useMap();
  const prevCenter = useRef(null);
  useEffect(() => {
    if (!center) return;
    const [lat, lon] = center;
    if (prevCenter.current && prevCenter.current[0] === lat && prevCenter.current[1] === lon) return;
    prevCenter.current = center;
    map.setView(center, 12);
  }, [center, map]);
  return null;
};

const SatelliteHeatmap = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCity, setSelectedCity] = useState({ name: 'Dharwad', lat: 15.4589, lon: 75.0078 });
  const [cityQuery, setCityQuery] = useState('Dharwad');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const debounceRef = useRef(null);
  const mapCenter = useMemo(() => [selectedCity.lat, selectedCity.lon], [selectedCity.lat, selectedCity.lon]);

  // Geocode city/place name via Nominatim
  const handleCitySearch = (query) => {
    setCityQuery(query);
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

  const selectCity = (city) => {
    setSelectedCity(city);
    setCityQuery(city.short || city.name);
    setCitySuggestions([]);
  };

  const fetchData = async (date, city) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post('/api/satellite-aqi', {
        city: city.name,
        lat: city.lat,
        lon: city.lon,
        date: date
      });
      if (response.data.success) {
        setData(response.data.heatmap_geojson);
        setPrediction(response.data);
      } else {
        setError('Failed to fetch satellite data.');
      }
    } catch (err) {
      setError('Satellite service unavailable (Check GEE credentials).');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedDate, selectedCity);
  }, [selectedDate, selectedCity.lat, selectedCity.lon]);

  return (
    <div className="glass" style={{ borderRadius: '24px', overflow: 'hidden', height: '600px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Controls */}
      <div style={{ padding: '20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', zIndex: 1001 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Hyperlocal Satellite NO₂ Heatmap</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
              Sentinel-5P NRTI Data for {cityQuery}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
            {/* Searchable City Input */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Location</label>
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => handleCitySearch(e.target.value)}
                placeholder="Search any city or place..."
                style={{
                  display: 'block', width: '220px',
                  background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'var(--text)',
                  padding: '8px 12px', borderRadius: '8px', fontSize: '14px', outline: 'none'
                }}
              />
              {citySuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, width: '320px', zIndex: 9999,
                  background: '#1a1a2e', border: '1px solid #333', borderRadius: '10px',
                  maxHeight: '220px', overflowY: 'auto', marginTop: '4px',
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

            {/* Date picker */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  display: 'block',
                  background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'var(--text)',
                  padding: '8px 12px', borderRadius: '8px', outline: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {prediction && (
          <div style={{ marginTop: '16px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div className="glass" style={{ padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>Interpolated NO₂</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{prediction.no2_satellite.toFixed(6)} <span style={{ fontSize: '12px', fontWeight: 400 }}>mol/m²</span></div>
            </div>
            <div className="glass" style={{ padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase' }}>AQI Prediction</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--blue)' }}>{prediction.aqi_prediction} <span style={{ fontSize: '12px', fontWeight: 400 }}>({prediction.aqi_status})</span></div>
            </div>
            {!prediction.satellite_available && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ padding: '4px 10px', background: '#ef444420', color: '#ef4444', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                  ⚠️ Satellite Unavailable (Fallback Mode)
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(4px)'
          }}>
            <div style={{ color: 'white', fontWeight: 700, animation: 'pulse 1.5s infinite' }}>Fetching GEE Data...</div>
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            background: 'var(--bg-card)', padding: '20px', borderRadius: '16px', border: '1px solid #ef4444',
            zIndex: 2000, textAlign: 'center'
          }}>
            <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: '8px' }}>Error</div>
            <div style={{ fontSize: '14px' }}>{error}</div>
            <button
              onClick={() => fetchData(selectedDate, selectedCity)}
              style={{ marginTop: '12px', background: 'var(--blue)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '8px', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}

        <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <MapUpdater center={mapCenter} />
          <HeatmapLayer data={data} />
          <Legend />
        </MapContainer>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
};

export default SatelliteHeatmap;
