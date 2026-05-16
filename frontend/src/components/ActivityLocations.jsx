import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// ─── Icon maps ────────────────────────────────────────────────────────────────
const ACTIVITY_ICONS = {
  Gym:           '🏋️',
  Office:        '🏢',
  Home:          '🏠',
  School:        '🏫',
  College:       '🎓',
  Hospital:      '🏥',
  Park:          '🌳',
  'Jogging Park':'🏃',
  Mall:          '🛍️',
  Temple:        '🛕',
  Restaurant:    '🍽️',
  Other:         '📍',
};

const SUGGESTIONS = Object.keys(ACTIVITY_ICONS);

const TRANSPORT_ICONS = { driving: '🚗', walking: '🚶', bicycling: '🚲', transit: '🚌' };

// ─── Utility: debounce ────────────────────────────────────────────────────────
function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Nominatim geocoder (with in-memory cache) ────────────────────────────────
const geocodeCache = {};
async function nominatimSearch(query) {
  if (!query || query.length < 3) return [];
  if (geocodeCache[query]) return geocodeCache[query];
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  const results = data.map(r => ({
    display_name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  }));
  geocodeCache[query] = results;
  return results;
}

// ─── Tiny map preview ─────────────────────────────────────────────────────────
function MapPreview({ lat, lon }) {
  if (!lat || !lon) return null;
  return (
    <div style={{ height: 180, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 12 }}>
      <MapContainer center={[lat, lon]} zoom={14} style={{ height: '100%' }} zoomControl={false} dragging={false} scrollWheelZoom={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lon]}><Popup>Selected location</Popup></Marker>
      </MapContainer>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ActivityLocations() {
  const [locations, setLocations]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editTarget, setEditTarget]     = useState(null);    // location object being edited
  const [saving, setSaving]             = useState(false);
  const [deleteId, setDeleteId]         = useState(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [activityName, setActivityName]   = useState('');
  const [customName, setCustomName]       = useState('');
  const [useCustom, setUseCustom]         = useState(false);
  const [addressQuery, setAddressQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedGeo, setSelectedGeo]     = useState(null);  // { lat, lon, display_name }
  const [mode, setMode]                   = useState('driving');
  const [time, setTime]                   = useState('');
  const [error, setError]                 = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  const debouncedQuery = useDebounce(addressQuery, 450);

  const API = '/api/profile/saved-locations';

  // ── Load existing locations ──────────────────────────────────────────────────
  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(API);
      setLocations(res.data.locations || []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  // ── Nominatim search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedQuery) { setSearchResults([]); return; }
    setSearchLoading(true);
    nominatimSearch(debouncedQuery)
      .then(r => setSearchResults(r))
      .finally(() => setSearchLoading(false));
  }, [debouncedQuery]);

  // ── GPS auto-detect ─────────────────────────────────────────────────────────
  const detectGPS = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      setSelectedGeo({ lat, lon, display_name: 'Current Location (GPS)' });
      setAddressQuery('Current Location (GPS)');
      setSearchResults([]);
    });
  };

  // ── Reset form ────────────────────────────────────────────────────────────────
  const resetForm = () => {
    setActivityName(''); setCustomName(''); setUseCustom(false);
    setAddressQuery(''); setSearchResults([]); setSelectedGeo(null);
    setMode('driving'); setTime(''); setError(''); setEditTarget(null);
  };

  const openAdd = () => { resetForm(); setShowForm(true); };

  const openEdit = (loc) => {
    resetForm();
    setEditTarget(loc);
    setActivityName(SUGGESTIONS.includes(loc.activity_name) ? loc.activity_name : 'Other');
    setCustomName(SUGGESTIONS.includes(loc.activity_name) ? '' : loc.activity_name);
    setUseCustom(!SUGGESTIONS.includes(loc.activity_name));
    setAddressQuery(loc.address);
    setSelectedGeo({ lat: loc.latitude, lon: loc.longitude, display_name: loc.address });
    setMode(loc.preferred_transport_mode || 'driving');
    setTime(loc.preferred_time || '');
    setShowForm(true);
  };

  // ── Save (create or update) ───────────────────────────────────────────────────
  const handleSave = async () => {
    setError('');
    const finalName = useCustom ? customName.trim() : activityName;
    if (!finalName)         return setError('Please choose an activity name.');
    if (!selectedGeo)       return setError('Please search and select a location on the map.');

    const payload = {
      activity_name:            finalName,
      latitude:                 selectedGeo.lat,
      longitude:                selectedGeo.lon,
      address:                  selectedGeo.display_name,
      preferred_transport_mode: mode,
      preferred_time:           time || null,
    };

    setSaving(true);
    try {
      if (editTarget) {
        await axios.put(`${API}/${editTarget.id}`, payload);
      } else {
        await axios.post(API, payload);
      }
      await fetchLocations();
      setShowForm(false);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed. Please try again.');
    } finally { setSaving(false); }
  };

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/${id}`);
      setLocations(prev => prev.filter(l => l.id !== id));
    } catch { /* toast elsewhere */ } finally { setDeleteId(null); }
  };

  // ── Quick-use in Route Planner ────────────────────────────────────────────────
  const useForRoute = (loc) => {
    // Store in sessionStorage so RouteAQI.jsx can pick it up on next render
    sessionStorage.setItem('route_destination', JSON.stringify({
      lat: loc.latitude, lon: loc.longitude, label: loc.activity_name
    }));
    window.location.href = '/satellite'; // navigate to route planner
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0 }}>Saved Activity Locations</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Your frequent destinations. Used for safe routing & AQI alerts.
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd} style={{ padding: '10px 20px' }}>
          + Add Location
        </button>
      </div>

      {/* ── Add / Edit Form ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="glass" style={{ borderRadius: 20, padding: 28, marginBottom: 24, border: '1px solid var(--blue)' }}>
          <h4 style={{ margin: '0 0 20px' }}>{editTarget ? '✏️ Edit Location' : '➕ Add New Location'}</h4>

          {/* Activity name selector */}
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Activity Type</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => { setActivityName(s); setUseCustom(false); }}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)',
                  background: activityName === s && !useCustom ? 'var(--blue)' : 'transparent',
                  color: activityName === s && !useCustom ? '#fff' : 'var(--text)',
                  cursor: 'pointer', fontSize: 13, transition: '0.2s'
                }}
              >
                {ACTIVITY_ICONS[s]} {s}
              </button>
            ))}
            <button
              onClick={() => { setUseCustom(true); setActivityName(''); }}
              style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid var(--border)',
                background: useCustom ? 'var(--blue)' : 'transparent',
                color: useCustom ? '#fff' : 'var(--text)',
                cursor: 'pointer', fontSize: 13
              }}
            >
              ✏️ Custom
            </button>
          </div>

          {useCustom && (
            <input
              type="text" placeholder="e.g. Mother's House, Training Ground"
              value={customName} onChange={e => setCustomName(e.target.value)}
              style={{ width: '100%', marginBottom: 16, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}
            />
          )}

          {/* Location search */}
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Search Location</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <input
              type="text"
              placeholder="Type an address or place name..."
              value={addressQuery}
              onChange={e => { setAddressQuery(e.target.value); setSelectedGeo(null); }}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}
            />
            <button
              onClick={detectGPS}
              style={{
                padding: '10px 14px', borderRadius: 8, border: '1px solid var(--blue)',
                background: 'rgba(59,130,246,0.1)', color: 'var(--blue)', cursor: 'pointer'
              }}
              title="Use current GPS location"
            >📍 GPS</button>
          </div>

          {/* Search results dropdown */}
          {searchLoading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Searching...</p>}
          {searchResults.length > 0 && !selectedGeo && (
            <div className="glass" style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 8, border: '1px solid var(--border)' }}>
              {searchResults.map((r, i) => (
                <div
                  key={i}
                  onClick={() => { setSelectedGeo(r); setAddressQuery(r.display_name); setSearchResults([]); }}
                  style={{
                    padding: '10px 16px', cursor: 'pointer', fontSize: 13,
                    borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: '0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  📍 {r.display_name}
                </div>
              ))}
            </div>
          )}

          {/* Map preview */}
          {selectedGeo && <MapPreview lat={selectedGeo.lat} lon={selectedGeo.lon} />}

          {/* Transport mode & time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Transport Mode</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.entries(TRANSPORT_ICONS).map(([m, icon]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, border: '1px solid var(--border)',
                      background: mode === m ? 'var(--blue)' : 'transparent',
                      color: mode === m ? '#fff' : 'var(--text)',
                      cursor: 'pointer', fontSize: 18, transition: '0.2s'
                    }}
                    title={m}
                  >{icon}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Usual Departure Time (optional)</label>
              <input
                type="time" value={time} onChange={e => setTime(e.target.value)}
                style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', width: '100%' }}
              />
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : (editTarget ? 'Update Location' : 'Save Location')}
            </button>
            <button
              onClick={() => { setShowForm(false); resetForm(); }}
              style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* ── Saved Location Cards ──────────────────────────────────────────── */}
      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading saved locations...</p>
      ) : locations.length === 0 ? (
        <div className="glass" style={{ padding: 32, borderRadius: 16, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
          <p>No saved locations yet. Add your gym, office, or school to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {locations.map(loc => (
            <div
              key={loc.id}
              className="glass"
              style={{ borderRadius: 16, padding: 20, border: '1px solid var(--border)', transition: '0.2s' }}
            >
              {/* Delete confirm */}
              {deleteId === loc.id ? (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 600, marginBottom: 12 }}>Delete "{loc.activity_name}"?</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleDelete(loc.id)} style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Yes, Delete</button>
                    <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 28 }}>{ACTIVITY_ICONS[loc.activity_name] || '📍'}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>{loc.activity_name}</div>
                        {loc.preferred_time && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>⏰ {loc.preferred_time}</div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 20 }}>{TRANSPORT_ICONS[loc.preferred_transport_mode] || '🚗'}</span>
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.4 }}>
                    📌 {loc.address}
                  </p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => useForRoute(loc)}
                      className="btn-primary"
                      style={{ flex: 1, padding: '8px 4px', fontSize: 12 }}
                    >🗺️ Plan Route</button>
                    <button
                      onClick={() => openEdit(loc)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}
                    >✏️</button>
                    <button
                      onClick={() => setDeleteId(loc.id)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
                    >🗑️</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
