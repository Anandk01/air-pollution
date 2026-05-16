import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';

// ── Icons ────────────────────────────────────────────────────────────────────
const createIcon = (emoji, color, opacity = 1, isPulsing = false) => {
  const pulseHtml = isPulsing 
    ? `<div style="position:absolute;width:100%;height:100%;border-radius:50%;background:${color};animation:pulse 1.5s infinite;opacity:0.5;top:0;left:0;z-index:-1"></div>`
    : '';

  return new L.DivIcon({
    className: '',
    html: `
      <div style="
        background: ${color}; 
        width: 32px; height: 32px; 
        border-radius: 50%; 
        border: 2px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        font-size: 16px;
        opacity: ${opacity};
        position: relative;
      ">
        ${emoji}
        ${pulseHtml}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const TYPE_CONFIG = {
  FIRE: { emoji: '🔥', color: '#ef4444', label: 'Fire' },
  INDUSTRY: { emoji: '🏭', color: '#f97316', label: 'Industry Emission' },
  CRACKERS: { emoji: '🎆', color: '#eab308', label: 'Firecrackers' },
  CONSTRUCTION: { emoji: '🏗️', color: '#84cc16', label: 'Construction Dust' },
  VEHICLE_EXHAUST: { emoji: '🚗', color: '#64748b', label: 'Vehicle Exhaust' },
  WASTE_BURNING: { emoji: '🗑️', color: '#a855f7', label: 'Waste Burning' },
  OTHER: { emoji: '⚠️', color: '#f43f5e', label: 'Other' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const timeAgo = (dateStr) => {
  const diff = (new Date() - new Date(dateStr)) / 1000 / 60 / 60;
  if (diff < 1) return 'just now';
  if (diff < 24) return `${Math.floor(diff)}h ago`;
  return `${Math.floor(diff/24)}d ago`;
};

const expiresIn = (dateStr) => {
  if (!dateStr) return 'Never';
  const diff = (new Date(dateStr) - new Date()) / 1000 / 60 / 60;
  if (diff < 0) return 'Expired';
  if (diff < 1) return '< 1h';
  return `${Math.floor(diff)}h`;
};

// ── Click handler for dropping pins ──────────────────────────────────────────
const LocationPicker = ({ onLocationSelect }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return null;
};

// ── Main Component ───────────────────────────────────────────────────────────
const CommunityReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false); // Toggle for demo purposes

  // Form State
  const [draftLocation, setDraftLocation] = useState(null);
  const [formData, setFormData] = useState({
    incident_type: 'FIRE',
    severity: 3,
    description: '',
    duration_type: 'TEMPORARY',
    duration_value: 4
  });

  const fetchReports = async () => {
    try {
      const res = await axios.get('/api/reports/active');
      if (res.data.success) {
        setReports(res.data.reports);
      }
    } catch (err) {
      console.error('Failed to fetch reports', err);
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!draftLocation) return alert("Please click on the map to select a location first!");

    setLoading(true);
    try {
      await axios.post('/api/reports', {
        ...formData,
        lat: draftLocation.lat,
        lon: draftLocation.lng,
        user_id: 'user_' + Math.floor(Math.random() * 10000) // Dummy ID for demo
      });
      setDraftLocation(null);
      setFormData({ ...formData, description: '' });
      fetchReports();
    } catch (err) {
      alert(err.response?.data?.error || "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUpvote = async (id) => {
    try {
      await axios.post(`/api/reports/${id}/upvote`, { user_id: 'user_123' });
      fetchReports();
    } catch (err) {
      if (err.response?.data?.error === 'Already upvoted') {
        alert("You already upvoted this!");
      }
    }
  };

  const handleVerify = async (id) => {
    try {
      await axios.patch(`/api/reports/${id}/verify`);
      fetchReports();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="glass" style={{ borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '700px' }}>
      
      {/* Header & Toggle */}
      <div style={{ padding: '20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>👥 Community Pollution Reports</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--muted)' }}>
            Crowdsourced, trust-scored, and fused with satellite data.
          </p>
        </div>
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            Enable Admin Verification Mode
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Sidebar Form */}
        <div style={{ width: '320px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', padding: '20px', overflowY: 'auto' }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Report an Incident</h4>
          
          {!draftLocation ? (
            <div style={{ padding: '16px', background: '#3b82f620', color: '#3b82f6', borderRadius: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 600, border: '1px dashed #3b82f6' }}>
              📍 Click anywhere on the map to set the location
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 600 }}>
                ✓ Location Selected: {draftLocation.lat.toFixed(4)}, {draftLocation.lng.toFixed(4)}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Type</label>
                <select 
                  value={formData.incident_type} 
                  onChange={e => setFormData({...formData, incident_type: e.target.value})}
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'white' }}
                >
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.emoji} {v.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Severity (1-5)</label>
                <input 
                  type="range" min="1" max="5" 
                  value={formData.severity} 
                  onChange={e => setFormData({...formData, severity: parseInt(e.target.value)})}
                  style={{ width: '100%' }}
                />
                <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--muted)' }}>{formData.severity}/5</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Description</label>
                <textarea 
                  rows={3} 
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="e.g. Thick black smoke from waste burning..."
                  style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'white', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Duration</label>
                  <select 
                    value={formData.duration_type} 
                    onChange={e => setFormData({...formData, duration_type: e.target.value})}
                    style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'white' }}
                  >
                    <option value="TEMPORARY">Temporary</option>
                    <option value="PERMANENT">Permanent</option>
                  </select>
                </div>
                {formData.duration_type === 'TEMPORARY' && (
                  <div style={{ width: '80px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Hours</label>
                    <input 
                      type="number" min="1" max="72"
                      value={formData.duration_value}
                      onChange={e => setFormData({...formData, duration_value: parseInt(e.target.value)})}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', background: 'var(--bg-glass)', border: '1px solid var(--border)', color: 'white' }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--blue)', color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer' }}>
                  {loading ? 'Submitting...' : 'Submit Report'}
                </button>
                <button type="button" onClick={() => setDraftLocation(null)} style={{ padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'white', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Map Area */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={[15.4589, 75.0078]} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <LocationPicker onLocationSelect={setDraftLocation} />

            {/* Draft Marker */}
            {draftLocation && (
              <Marker position={draftLocation} icon={createIcon('📍', '#3b82f6', 1, true)} />
            )}

            {/* Active Reports */}
            {reports.map(r => {
              const conf = TYPE_CONFIG[r.incident_type] || TYPE_CONFIG.OTHER;
              const isPermanent = r.duration_type === 'PERMANENT';
              const minOpacity = 0.4;
              const opacity = minOpacity + (r.trust_score * (1 - minOpacity)); // Scale opacity 0.4 to 1.0 based on trust

              return (
                <Marker 
                  key={r.id} 
                  position={[r.lat, r.lon]} 
                  icon={createIcon(conf.emoji, conf.color, opacity, isPermanent)}
                >
                  <Popup>
                    <div style={{ minWidth: '200px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', borderBottom: '1px solid #ddd', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '20px' }}>{conf.emoji}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '14px', color: '#111' }}>{conf.label}</div>
                          <div style={{ fontSize: '11px', color: '#666' }}>Severity: {r.severity}/5</div>
                        </div>
                      </div>
                      
                      <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#333' }}>
                        {r.description || <i>No description provided.</i>}
                      </p>

                      <div style={{ fontSize: '11px', color: '#666', background: '#f5f5f5', padding: '8px', borderRadius: '6px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Reported:</span> <strong>{timeAgo(r.reported_at)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span>Expires:</span> <strong>{expiresIn(r.expires_at)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Trust Score:</span> <strong>{Math.round(r.trust_score * 100)}%</strong>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleUpvote(r.id)}
                          style={{ flex: 1, padding: '6px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                        >
                          👍 Upvote ({r.upvote_count})
                        </button>
                        
                        {isAdmin && !r.verified && (
                          <button 
                            onClick={() => handleVerify(r.id)}
                            style={{ flex: 1, padding: '6px', background: '#22c55e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                          >
                            ✅ Verify
                          </button>
                        )}
                      </div>
                      
                      {r.verified && (
                        <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: '#22c55e', fontWeight: 700 }}>
                          ✓ Verified by Admin
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
};

export default CommunityReports;
