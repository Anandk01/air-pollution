import React, { useState, useRef } from 'react';
import axios from 'axios';
import SatelliteHeatmap from '../components/SatelliteHeatmap';
import RouteAQI from '../components/RouteAQI';

const SatelliteView = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(() => {
    try {
      const saved = sessionStorage.getItem('route_destination');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const debounceRef = useRef(null);

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (query.length < 2) { setSearchResults([]); return; }
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: query, format: 'json', limit: 8 }
        });
        setSearchResults(res.data.map(r => ({
          name: r.display_name,
          short: r.display_name.split(',')[0],
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          type: r.type
        })));
      } catch { setSearchResults([]); }
    }, 350);
  };

  const selectPlace = (place) => {
    setSelectedPlace(place);
    setSearchQuery(place.short || place.name);
    setSearchResults([]);
    sessionStorage.setItem('route_destination', JSON.stringify({
      lat: place.lat, lon: place.lon, label: place.short || place.name
    }));
  };

  return (
    <div className="page-shell mesh-bg">
      <div className="admin-main">
        <header style={{ marginBottom: '32px' }}>
          <h1 className="gradient-text" style={{ fontSize: '36px', fontWeight: 900, marginBottom: '8px' }}>
            Satellite Intelligence
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '16px', maxWidth: '800px' }}>
            Real-time satellite NO₂ monitoring and street-level air quality routing. 
            Navigate safely with hyperlocal pollution data powered by Google Earth Engine.
          </p>
        </header>

        {/* Search bar for any place */}
        <div className="glass" style={{ padding: '20px', borderRadius: '20px', marginBottom: '24px', position: 'relative', zIndex: 100 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--text)' }}>
            🔍 Search Any Place (malls, temples, restaurants, parks...)
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search for any place — e.g. Phoenix Mall, ISKCON Temple, Lalbagh..."
              style={{
                width: '100%', padding: '12px 16px', fontSize: '15px',
                background: 'var(--bg-glass)', border: '1px solid var(--border)',
                color: 'var(--text)', borderRadius: '12px', outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchResults.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                background: '#1a1a2e', border: '1px solid #333', borderRadius: '12px',
                maxHeight: '260px', overflowY: 'auto', marginTop: '6px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
              }}>
                {searchResults.map((s, i) => (
                  <div key={i}
                    onClick={() => selectPlace(s)}
                    style={{
                      padding: '12px 16px', cursor: 'pointer', fontSize: '13px',
                      color: '#e0e0e0', borderBottom: '1px solid #2a2a3a',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a3e'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>📍</span>
                    <span>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedPlace && (
            <div style={{
              marginTop: '14px', padding: '12px 16px', borderRadius: '12px',
              background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.3)',
              display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <span style={{ fontSize: '18px' }}>📍</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--blue)' }}>
                  Destination: {selectedPlace.short || selectedPlace.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Lat: {selectedPlace.lat.toFixed(5)}, Lon: {selectedPlace.lon.toFixed(5)} — Saved for Route AQI navigation
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          <RouteAQI key={selectedPlace ? `${selectedPlace.lat}-${selectedPlace.lon}` : 'default'} />
          <SatelliteHeatmap />
          
          <div className="glass" style={{ padding: '24px', borderRadius: '24px' }}>
            <h3 style={{ marginTop: 0 }}>Understanding Satellite NO₂ Data</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
              Nitrogen Dioxide (NO₂) is a primary air pollutant resulting from vehicle emissions and industrial activities. 
              The <strong>Sentinel-5 Precursor (S5P)</strong> satellite provides Near Real-Time (NRTI) measurements of 
              NO₂ vertical column density.
            </p>
            <ul style={{ fontSize: '14px', lineHeight: 2, color: 'var(--text-muted)' }}>
              <li><strong>Scale:</strong> Measurements are in mol/m². Typical urban values range from 5e-5 to 5e-4.</li>
              <li><strong>Temporal Lag:</strong> Satellite data usually has a lag of 3-6 hours for processing.</li>
              <li><strong>Cloud Cover:</strong> Heavy clouds may obstruct sensors; in such cases, the system falls back to ground-station features.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SatelliteView;
