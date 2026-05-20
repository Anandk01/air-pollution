import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';

const createIcon = (emoji, color, opacity = 1, isPulsing = false) => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:32px;height:32px;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;opacity:${opacity};position:relative;">
    ${emoji}
    ${isPulsing ? `<div style="position:absolute;width:100%;height:100%;border-radius:50%;background:${color};animation:pulse-hazard 1.5s infinite;opacity:0.4;top:0;left:0;z-index:-1"></div>` : ''}
  </div>`,
  iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -18],
});

const GPS_ICON = new L.DivIcon({
  className: '',
  html: `<div style="background:#6366f1;width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;">📍</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -20],
});

const TYPE_CONFIG = {
  FIRE:            { emoji: '🔥', color: '#ef4444', label: 'Fire' },
  INDUSTRY:        { emoji: '🏭', color: '#f97316', label: 'Industry Emission' },
  CRACKERS:        { emoji: '🎆', color: '#eab308', label: 'Firecrackers' },
  CONSTRUCTION:    { emoji: '🏗️', color: '#84cc16', label: 'Construction Dust' },
  VEHICLE_EXHAUST: { emoji: '🚗', color: '#64748b', label: 'Vehicle Exhaust' },
  WASTE_BURNING:   { emoji: '🗑️', color: '#a855f7', label: 'Waste Burning' },
  OTHER:           { emoji: '⚠️', color: '#f43f5e', label: 'Other' },
};

const timeAgo = (d) => {
  const h = (new Date() - new Date(d)) / 3600000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const expiresIn = (d) => {
  if (!d) return 'Never';
  const h = (new Date(d) - new Date()) / 3600000;
  if (h < 0) return 'Expired';
  if (h < 1) return '< 1h';
  return `${Math.floor(h)}h`;
};

function LocationPicker({ onLocationSelect }) {
  useMapEvents({ click: (e) => onLocationSelect(e.latlng) });
  return null;
}

export default function CommunityReportsPage() {
  const [reports,       setReports]       = useState([]);
  const [draftLocation, setDraftLocation] = useState(null);
  const [gpsLoading,    setGpsLoading]    = useState(false);
  const [gpsError,      setGpsError]      = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [isAdmin,       setIsAdmin]       = useState(false);
  const [mapCenter,     setMapCenter]     = useState([20.5937, 78.9629]); // India center
  const [formData, setFormData] = useState({
    incident_type: 'FIRE', severity: 3, description: '',
    duration_type: 'TEMPORARY', duration_value: 4,
  });

  const fetchReports = async () => {
    try {
      const res = await axios.get('/api/reports/active');
      if (res.data.success) setReports(res.data.reports);
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchReports();
    const t = setInterval(fetchReports, 60000);
    return () => clearInterval(t);
  }, []);

  const detectLocation = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported by your browser.'); return; }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDraftLocation(loc);
        setMapCenter([loc.lat, loc.lng]);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.code === 1 ? 'Location permission denied.' : 'Could not get location. Try again.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!draftLocation) return;
    setSubmitting(true);
    try {
      await axios.post('/api/reports', {
        ...formData,
        lat: draftLocation.lat,
        lon: draftLocation.lng,
        user_id: 'user_' + Math.floor(Math.random() * 10000),
      });
      setDraftLocation(null);
      setFormData({ ...formData, description: '' });
      fetchReports();
    } catch (err) {
      alert(err.response?.data?.error || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpvote = async (id) => {
    try {
      await axios.post(`/api/reports/${id}/upvote`, { user_id: 'user_123' });
      fetchReports();
    } catch (err) {
      if (err.response?.data?.error === 'Already upvoted') alert('You already upvoted this!');
    }
  };

  const handleVerify = async (id) => {
    try { await axios.patch(`/api/reports/${id}/verify`); fetchReports(); } catch { /* silent */ }
  };

  const field = (label, children) => (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );

  const selectStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', margin: '-28px -32px' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 24px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>👥 Community Pollution Reports</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Crowdsourced incidents · trust-scored · fused with satellite data · {reports.length} active
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>
          <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} style={{ accentColor: 'var(--blue)' }} />
          Admin Verification Mode
        </label>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: 300, background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

          {/* Report form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Report an Incident</div>

            {/* GPS detect button */}
            <button
              onClick={detectLocation}
              disabled={gpsLoading}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                background: gpsLoading ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.4)', color: '#818cf8',
                fontSize: 13, fontWeight: 700, cursor: gpsLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {gpsLoading ? (
                <><span style={{ width: 14, height: 14, border: '2px solid #818cf8', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Detecting…</>
              ) : (
                <><span>📡</span> Use My Current Location</>
              )}
            </button>

            {gpsError && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12, marginBottom: 10 }}>
                {gpsError}
              </div>
            )}

            {/* Map click hint / selected location */}
            {!draftLocation ? (
              <div style={{ padding: '12px 14px', background: 'rgba(59,130,246,0.08)', border: '1px dashed rgba(59,130,246,0.4)', borderRadius: 10, textAlign: 'center', fontSize: 13, color: '#60a5fa', fontWeight: 600, marginBottom: 14 }}>
                📍 Or click anywhere on the map
              </div>
            ) : (
              <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, fontSize: 12, color: '#22c55e', fontWeight: 600, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>✓ {draftLocation.lat.toFixed(4)}, {draftLocation.lng.toFixed(4)}</span>
                <button onClick={() => setDraftLocation(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}

            {draftLocation && (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {field('Incident Type',
                  <select value={formData.incident_type} onChange={e => setFormData({ ...formData, incident_type: e.target.value })} style={selectStyle}>
                    {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                )}

                {field(`Severity — ${formData.severity}/5`,
                  <input type="range" min="1" max="5" value={formData.severity}
                    onChange={e => setFormData({ ...formData, severity: +e.target.value })}
                    style={{ width: '100%', accentColor: 'var(--blue)' }} />
                )}

                {field('Description',
                  <textarea rows={3} value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g. Thick black smoke from waste burning…"
                    style={{ ...selectStyle, resize: 'none', fontFamily: 'inherit' }} />
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {field('Duration',
                      <select value={formData.duration_type} onChange={e => setFormData({ ...formData, duration_type: e.target.value })} style={selectStyle}>
                        <option value="TEMPORARY">Temporary</option>
                        <option value="PERMANENT">Permanent</option>
                      </select>
                    )}
                  </div>
                  {formData.duration_type === 'TEMPORARY' && (
                    <div style={{ width: 72 }}>
                      {field('Hours',
                        <input type="number" min="1" max="72" value={formData.duration_value}
                          onChange={e => setFormData({ ...formData, duration_value: +e.target.value })}
                          style={{ ...selectStyle, padding: '9px 8px' }} />
                      )}
                    </div>
                  )}
                </div>

                <button type="submit" disabled={submitting} className="btn-primary" style={{ width: '100%', padding: '11px', marginTop: 4 }}>
                  {submitting ? 'Submitting…' : '🚨 Submit Report'}
                </button>
              </form>
            )}
          </div>

          {/* Active reports list */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px 6px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Reports ({reports.length})
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 220, padding: '0 12px 12px' }}>
            {reports.length === 0 && (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No active reports</div>
            )}
            {reports.map(r => {
              const conf = TYPE_CONFIG[r.incident_type] || TYPE_CONFIG.OTHER;
              return (
                <div key={r.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{conf.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: conf.color }}>{conf.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{timeAgo(r.reported_at)} · Trust {Math.round(r.trust_score * 100)}%</div>
                    {r.description && <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
                  </div>
                  <button onClick={() => handleUpvote(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>👍 {r.upvote_count}</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer center={mapCenter} zoom={5} style={{ height: '100%', width: '100%' }} key={mapCenter.join(',')}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap &copy; CARTO" />
            <LocationPicker onLocationSelect={(loc) => { setDraftLocation(loc); setGpsError(''); }} />

            {draftLocation && <Marker position={draftLocation} icon={GPS_ICON}><Popup>📍 Selected location<br />{draftLocation.lat.toFixed(5)}, {draftLocation.lng.toFixed(5)}</Popup></Marker>}

            {reports.map(r => {
              const conf = TYPE_CONFIG[r.incident_type] || TYPE_CONFIG.OTHER;
              const opacity = 0.4 + r.trust_score * 0.6;
              return (
                <Marker key={r.id} position={[r.lat, r.lon]} icon={createIcon(conf.emoji, conf.color, opacity, r.duration_type === 'PERMANENT')}>
                  <Popup>
                    <div style={{ minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #ddd' }}>
                        <span style={{ fontSize: 20 }}>{conf.emoji}</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>{conf.label}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>Severity: {r.severity}/5</div>
                        </div>
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#333' }}>{r.description || <i>No description.</i>}</p>
                      <div style={{ fontSize: 11, color: '#666', background: '#f5f5f5', padding: 8, borderRadius: 6, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Reported:</span><strong>{timeAgo(r.reported_at)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span>Expires:</span><strong>{expiresIn(r.expires_at)}</strong></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Trust:</span><strong>{Math.round(r.trust_score * 100)}%</strong></div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleUpvote(r.id)} style={{ flex: 1, padding: '6px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          👍 Upvote ({r.upvote_count})
                        </button>
                        {isAdmin && !r.verified && (
                          <button onClick={() => handleVerify(r.id)} style={{ flex: 1, padding: '6px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            ✅ Verify
                          </button>
                        )}
                      </div>
                      {r.verified && <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✓ Verified by Admin</div>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Map legend */}
          <div className="glass" style={{ position: 'absolute', bottom: 20, right: 20, zIndex: 1000, padding: '12px 16px', borderRadius: 12, fontSize: 12, minWidth: 160 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>Incident Types</div>
            {Object.values(TYPE_CONFIG).map(v => (
              <div key={v.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 14 }}>{v.emoji}</span>
                <span style={{ color: 'var(--muted)' }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
