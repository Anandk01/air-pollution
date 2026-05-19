import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ACTIVITY_TYPES = ['Gym', 'Office', 'School', 'College', 'Hospital', 'Park', 'Jogging Park', 'Mall', 'Temple', 'Restaurant', 'Other'];
const ACTIVITY_ICONS = { Gym: '💪', Office: '💼', School: '🏫', College: '🎓', Hospital: '🏥', Park: '🌳', 'Jogging Park': '🏃', Mall: '🛍️', Temple: '🛕', Restaurant: '🍽️', Other: '📍' };
const TRANSPORT_ICONS = { driving: '🚗', walking: '🚶', bicycling: '🚲', transit: '🚌' };

const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', boxSizing: 'border-box' };
const btnStyle = (active) => ({ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: active ? 'var(--blue)' : 'rgba(255,255,255,0.05)', color: active ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: '0.2s' });

// ── Nominatim helpers ─────────────────────────────────────────────────────────
const _cache = {};
async function searchAddress(q) {
  if (!q || q.length < 3) return [];
  if (_cache[q]) return _cache[q];
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  const results = data.map(r => ({ label: r.display_name, lat: parseFloat(r.lat), lon: parseFloat(r.lon) }));
  _cache[q] = results;
  return results;
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// ── Map click handler ─────────────────────────────────────────────────────────
function MapClickHandler({ onPick }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MapFlyTo({ lat, lon }) {
  const map = useMap();
  useEffect(() => { if (lat && lon) map.flyTo([lat, lon], 15, { duration: 1 }); }, [lat, lon]);
  return null;
}

// ── Location picker: search + GPS + map ──────────────────────────────────────
function LocationPicker({ value, onConfirm }) {
  const [query, setQuery]           = useState(value.address || '');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [pin, setPin]               = useState(value.lat ? { lat: Number(value.lat), lon: Number(value.lon) } : null);
  const [label, setLabel]           = useState(value.address || '');
  const [showMap, setShowMap]       = useState(false);
  const [confirmed, setConfirmed]   = useState(!!value.lat);  // true = skip search dropdown

  // sync when parent loads saved value (e.g. after fetch)
  useEffect(() => {
    if (value.lat && value.lon && !pin) {
      setPin({ lat: Number(value.lat), lon: Number(value.lon) });
      setLabel(value.address || '');
      setQuery(value.address || '');
    }
  }, [value.lat, value.lon]);

  const confirm = (lat, lon, address) => {
    const flat = parseFloat(lat.toFixed ? lat.toFixed(7) : lat);
    const flon = parseFloat(lon.toFixed ? lon.toFixed(7) : lon);
    setPin({ lat: flat, lon: flon });
    setLabel(address);
    setQuery(address);
    setResults([]);
    setConfirmed(true);  // block dropdown until user manually edits
    onConfirm({ address, lat: flat, lon: flon });
  };

  // debounced search — skip if location already confirmed
  useEffect(() => {
    if (confirmed) return;
    const t = setTimeout(async () => {
      if (!query || query.length < 3) { setResults([]); return; }
      setSearching(true);
      const r = await searchAddress(query).catch(() => []);
      setResults(r);
      setSearching(false);
    }, 450);
    return () => clearTimeout(t);
  }, [query, confirmed]);

  const selectResult = (r) => {
    setResults([]);
    setShowMap(true);
    confirm(r.lat, r.lon, r.label);
  };

  const handleMapPick = async (lat, lon) => {
    const addr = await reverseGeocode(lat, lon);
    confirm(lat, lon, addr);
  };

  const handleGPS = () => {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const addr = await reverseGeocode(lat, lon);
        setShowMap(true);
        confirm(lat, lon, addr);
        setGpsLoading(false);
      },
      () => { alert('Could not get GPS location'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div>
      {/* Search row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPin(null); setConfirmed(false); }}
            placeholder="Search address..."
            style={inputStyle}
          />
          {searching && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Searching...</div>}
          {results.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 1000, width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} onClick={() => selectResult(r)}
                  style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >📍 {r.label}</div>
              ))}
            </div>
          )}
        </div>

        {/* GPS button */}
        <button onClick={handleGPS} disabled={gpsLoading} title="Use current GPS location"
          style={{ ...btnStyle(false), padding: '10px 14px', whiteSpace: 'nowrap', borderColor: 'var(--blue)', color: 'var(--blue)' }}>
          {gpsLoading ? '⏳' : '📡 GPS'}
        </button>

        {/* Toggle map */}
        <button onClick={() => setShowMap(v => !v)} title="Pin on map"
          style={{ ...btnStyle(showMap), padding: '10px 14px', whiteSpace: 'nowrap' }}>
          🗺️ Map
        </button>
      </div>

      {/* Confirmed label */}
      {pin && (
        <div style={{ fontSize: 12, color: '#22c55e', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          ✅ {label} &nbsp;<span style={{ color: 'var(--muted)' }}>({pin.lat.toFixed(5)}, {pin.lon.toFixed(5)})</span>
        </div>
      )}

      {/* Map */}
      {showMap && (
        <div style={{ marginTop: 12, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', height: 260 }}>
          <div style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.3)', fontSize: 12, color: 'var(--muted)' }}>
            🖱️ Click anywhere on the map to pin the exact location
          </div>
          <MapContainer
            center={pin ? [pin.lat, pin.lon] : [20.5937, 78.9629]}
            zoom={pin ? 15 : 5}
            style={{ height: 210 }}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapClickHandler onPick={handleMapPick} />
            {pin && (
              <>
                <MapFlyTo lat={pin.lat} lon={pin.lon} />
                <Marker position={[pin.lat, pin.lon]} />
              </>
            )}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
const ProfileForm = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('personal');

  const [profile, setProfile]           = useState({ full_name: '', age: '', gender: 'Male', weight_kg: '', height_cm: '', is_smoker: false, bmi: 0 });
  const [conditions, setConditions]     = useState([]);
  const [userConditions, setUserConditions] = useState([]);
  const [threshold, setThreshold]       = useState(150);

  const [home, setHome]         = useState({ address: '', lat: '', lon: '', city: '' });
  const [homeSaving, setHomeSaving] = useState(false);

  const [places, setPlaces]     = useState([]);
  const [newPlace, setNewPlace] = useState({ activity_name: 'Gym', address: '', lat: '', lon: '', start_time: '', end_time: '', preferred_transport_mode: 'driving' });
  const [placeSaving, setPlaceSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const API     = '/api/profile';
  const headers = { Authorization: `Bearer ${user?.token}` };

  useEffect(() => {
    const load = async () => {
      try {
        setConditions([
          { id: 1, name: 'Asthma', icon: '🌫️' }, { id: 2, name: 'Heart disease', icon: '❤️' },
          { id: 3, name: 'COPD',   icon: '🩺' },  { id: 4, name: 'Diabetes',     icon: '💧' },
          { id: 5, name: 'Pregnant', icon: '👶' }, { id: 6, name: 'Allergies',   icon: '🧠' },
        ]);
        const [profRes, placesRes] = await Promise.all([
          axios.get(API + '/', { headers }),
          axios.get(API + '/saved-locations', { headers }),
        ]);
        const d = profRes.data;
        setProfile(d.profile || {});
        setUserConditions((d.health_conditions || []).map(c => c.id));
        setThreshold(d.personal_aqi_threshold || 150);
        const h = d.locations?.home;
        if (h) setHome({ address: h.address || '', lat: h.lat || '', lon: h.lon || '', city: h.city || '' });
        setPlaces(placesRes.data.locations || []);
      } catch (err) { console.error('Fetch error', err); }
      finally { setLoading(false); }
    };
    load();
  }, [user?.token]);

  const saveProfile = async () => {
    try { await axios.put(API + '/', profile, { headers }); addToast('Personal info saved', 'success'); }
    catch { addToast('Save failed', 'error'); }
  };

  const toggleCondition = async (id) => {
    const adding = !userConditions.includes(id);
    try {
      const res = await axios.post(`${API}/conditions`, { condition_id: id, action: adding ? 'add' : 'remove' }, { headers });
      setUserConditions(prev => adding ? [...prev, id] : prev.filter(c => c !== id));
      setThreshold(res.data.new_threshold);
      addToast(res.data.message, 'success');
    } catch { addToast('Update failed', 'error'); }
  };

  const saveHome = async () => {
    if (!home.lat || !home.lon) return addToast('Pick a location using search, GPS, or map pin', 'warning');
    setHomeSaving(true);
    try {
      await axios.put(`${API}/locations`, { type: 'home', address: home.address, latitude: parseFloat(home.lat), longitude: parseFloat(home.lon), city: home.city }, { headers });
      addToast('Home address saved ✅', 'success');
    } catch { addToast('Failed to save home address', 'error'); }
    finally { setHomeSaving(false); }
  };

  const savePlace = async () => {
    if (!newPlace.lat || !newPlace.lon) return addToast('Pick a location using search, GPS, or map pin', 'warning');
    if (!newPlace.start_time || !newPlace.end_time) return addToast('Set start and end time', 'warning');
    setPlaceSaving(true);
    try {
      const res = await axios.post(`${API}/saved-locations`, {
        activity_name: newPlace.activity_name,
        latitude: parseFloat(newPlace.lat),
        longitude: parseFloat(newPlace.lon),
        address: newPlace.address,
        preferred_transport_mode: newPlace.preferred_transport_mode,
        preferred_time: newPlace.start_time,
        end_time: newPlace.end_time,
      }, { headers });
      setPlaces(prev => [...prev, { ...newPlace, id: res.data.id, latitude: parseFloat(newPlace.lat), longitude: parseFloat(newPlace.lon) }]);
      setNewPlace({ activity_name: 'Gym', address: '', lat: '', lon: '', start_time: '', end_time: '', preferred_transport_mode: 'driving' });
      addToast('Place saved ✅', 'success');
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save place', 'error');
    } finally { setPlaceSaving(false); }
  };

  const deletePlace = async (id) => {
    try {
      await axios.delete(`${API}/saved-locations/${id}`, { headers });
      setPlaces(prev => prev.filter(p => p.id !== id));
      addToast('Place deleted', 'success');
    } catch { addToast('Delete failed', 'error'); }
    finally { setDeleteId(null); }
  };

  if (loading) return <div className="admin-main" style={{ padding: 40 }}>Loading your profile...</div>;

  return (
    <div className="admin-main">
      <PageHeader title="User Health Profile" subtitle={`Personal AQI Threshold: ${threshold}`} />

      <div className="glass" style={{ borderRadius: 24, overflow: 'hidden' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {[['personal', '👤', 'Personal'], ['conditions', '🩺', 'Conditions'], ['locations', '🏠', 'Locations']].map(([tab, icon, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '16px', border: 'none', background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
              color: activeTab === tab ? 'var(--blue)' : 'var(--text)', fontWeight: 700, cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--blue)' : '2px solid transparent', transition: '0.2s', whiteSpace: 'nowrap',
            }}>{icon} {label}</button>
          ))}
        </div>

        <div style={{ padding: 32 }}>

          {/* ── Personal ── */}
          {activeTab === 'personal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {[['Full Name', 'text', 'full_name'], ['Age', 'number', 'age'], ['Weight (kg)', 'number', 'weight_kg'], ['Height (cm)', 'number', 'height_cm']].map(([label, type, key]) => (
                <div key={key}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>{label}</label>
                  <input type={type} value={profile[key] || ''} onChange={e => setProfile({ ...profile, [key]: e.target.value })} style={inputStyle} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="checkbox" checked={!!profile.is_smoker} onChange={e => setProfile({ ...profile, is_smoker: e.target.checked })} />
                <label>I am a smoker</label>
              </div>
              <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 20 }}>
                <button className="btn-primary" onClick={saveProfile}>Save Personal Info</button>
                {profile.bmi > 0 && <span style={{ color: 'var(--muted)' }}>BMI: {profile.bmi}</span>}
              </div>
            </div>
          )}

          {/* ── Conditions ── */}
          {activeTab === 'conditions' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              {conditions.map(c => (
                <div key={c.id} onClick={() => toggleCondition(c.id)} className="glass"
                  style={{ padding: 20, borderRadius: 16, cursor: 'pointer', textAlign: 'center',
                    border: userConditions.includes(c.id) ? '2px solid var(--blue)' : '1px solid var(--border)', transition: '0.2s' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  {userConditions.includes(c.id) && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 4 }}>✓ Active</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── Locations ── */}
          {activeTab === 'locations' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

              {/* ── Home address ── */}
              <div className="glass" style={{ padding: 24, borderRadius: 16, border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>🏠 Home Address</h4>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>Starting point for safe route navigation.</p>

                <LocationPicker
                  value={{ address: home.address, lat: home.lat, lon: home.lon }}
                  onConfirm={r => setHome({ address: r.address, lat: r.lat, lon: r.lon, city: r.address.split(',').slice(-2, -1)[0]?.trim() || '' })}
                />

                <button className="btn-primary" onClick={saveHome} disabled={homeSaving} style={{ marginTop: 16 }}>
                  {homeSaving ? 'Saving...' : 'Save Home Address'}
                </button>
              </div>

              {/* ── Activity places ── */}
              <div className="glass" style={{ padding: 24, borderRadius: 16, border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>📍 Activity Places</h4>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>Places you visit regularly — used for safe routing and AQI alerts.</p>

                {/* Add form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, borderRadius: 12, background: 'rgba(0,0,0,0.15)', marginBottom: 24 }}>
                  <div style={{ fontWeight: 700 }}>➕ Add New Place</div>

                  {/* Activity type */}
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Activity Type</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {ACTIVITY_TYPES.map(t => (
                        <button key={t} onClick={() => setNewPlace(p => ({ ...p, activity_name: t }))}
                          style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer', border: '1px solid var(--border)',
                            background: newPlace.activity_name === t ? 'var(--blue)' : 'transparent',
                            color: newPlace.activity_name === t ? '#fff' : 'var(--text)', transition: '0.2s' }}>
                          {ACTIVITY_ICONS[t]} {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Location picker */}
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Location</label>
                    <LocationPicker
                      value={{ address: newPlace.address, lat: newPlace.lat, lon: newPlace.lon }}
                      onConfirm={r => setNewPlace(p => ({ ...p, address: r.address, lat: r.lat, lon: r.lon }))}
                    />
                  </div>

                  {/* Times */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>Start Time</label>
                      <input type="time" value={newPlace.start_time} onChange={e => setNewPlace(p => ({ ...p, start_time: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>End Time</label>
                      <input type="time" value={newPlace.end_time} onChange={e => setNewPlace(p => ({ ...p, end_time: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>

                  {/* Transport */}
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 8 }}>How do you get there?</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {Object.entries(TRANSPORT_ICONS).map(([m, icon]) => (
                        <button key={m} onClick={() => setNewPlace(p => ({ ...p, preferred_transport_mode: m }))}
                          style={{ flex: 1, padding: '10px 4px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 20,
                            background: newPlace.preferred_transport_mode === m ? 'var(--blue)' : 'transparent',
                            color: newPlace.preferred_transport_mode === m ? '#fff' : 'var(--text)', transition: '0.2s' }}
                          title={m}>{icon}</button>
                      ))}
                    </div>
                  </div>

                  <button className="btn-primary" onClick={savePlace} disabled={placeSaving} style={{ alignSelf: 'flex-start', padding: '10px 28px' }}>
                    {placeSaving ? 'Saving...' : `Save ${newPlace.activity_name}`}
                  </button>
                </div>

                {/* Saved list */}
                {places.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No places saved yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {places.map(p => (
                      <div key={p.id} className="glass" style={{ padding: '16px 20px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{ fontSize: 28 }}>{ACTIVITY_ICONS[p.activity_name] || '📍'}</span>
                          <div>
                            <div style={{ fontWeight: 700 }}>{p.activity_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📌 {p.address}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                              ⏰ {p.preferred_time || '—'}{p.end_time ? ` → ${p.end_time}` : ''}
                              &nbsp;·&nbsp;{TRANSPORT_ICONS[p.preferred_transport_mode] || '🚗'} {p.preferred_transport_mode}
                            </div>
                          </div>
                        </div>
                        {deleteId === p.id ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => deletePlace(p.id)} style={{ padding: '6px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12 }}>Delete</button>
                            <button onClick={() => setDeleteId(null)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(p.id)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>🗑️ Remove</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ProfileForm;
