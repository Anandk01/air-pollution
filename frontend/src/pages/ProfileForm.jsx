import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import ActivityLocations from '../components/ActivityLocations';

const ProfileForm = () => {
    const { user } = useAuth();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('personal'); // 'personal', 'conditions', 'locations', 'activities', 'places'

    // Form states
    const [profile, setProfile] = useState({
        full_name: '', age: '', gender: 'Male', weight_kg: '', height_cm: '', is_smoker: false, bmi: 0
    });
    const [conditions, setConditions] = useState([]); // List of ALL available conditions
    const [userConditions, setUserConditions] = useState([]); // IDs of user's conditions
    const [locations, setLocations] = useState({
        home: { address: '', lat: 0, lon: 0, city: '' },
        work: { address: '', lat: 0, lon: 0, city: '' },
        current: { lat: 0, lon: 0, city: '' }
    });
    const [activities, setActivities] = useState([]);
    const [threshold, setThreshold] = useState(150);

    const API = "/api/profile";
    const headers = { Authorization: `Bearer ${user?.token}` };

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch static conditions (mock or from a separate endpoint if we had one, 
                // but let's assume we know them or fetch from a helper)
                const available = [
                    { id: 1, name: 'Asthma', icon: 'lungs' },
                    { id: 2, name: 'Heart disease', icon: 'heart' },
                    { id: 3, name: 'COPD', icon: 'stethoscope' },
                    { id: 4, name: 'Diabetes', icon: 'droplet' },
                    { id: 5, name: 'Pregnant', icon: 'baby-carriage' },
                    { id: 6, name: 'Allergies', icon: 'brain' }
                ];
                setConditions(available);

                const res = await axios.get(API, { headers });
                const d = res.data;
                setProfile(d.profile);
                setUserConditions(d.health_conditions.map(c => c.id));
                setLocations(d.locations);
                setActivities(d.activities);
                setThreshold(d.personal_aqi_threshold);
            } catch (err) {
                console.error("Fetch error", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user?.token]);

    const saveProfile = async () => {
        try {
            await axios.put(API, profile, { headers });
            addToast("Personal info saved", "success");
        } catch (err) { addToast("Save failed", "error"); }
    };

    const toggleCondition = async (id, name) => {
        const isAdding = !userConditions.includes(id);
        try {
            const res = await axios.post(`${API}/conditions`, {
                condition_id: id,
                action: isAdding ? 'add' : 'remove'
            }, { headers });
            
            setUserConditions(prev => isAdding ? [...prev, id] : prev.filter(c => c !== id));
            setThreshold(res.data.new_threshold);
            addToast(res.data.message, "success");
        } catch (err) { addToast("Update failed", "error"); }
    };

    const saveLocation = async (type) => {
        try {
            await axios.put(`${API}/locations`, { type, ...locations[type] }, { headers });
            addToast(`${type.charAt(0).toUpperCase() + type.slice(1)} location updated`, "success");
        } catch (err) { addToast("Location save failed", "error"); }
    };

    const addActivity = async (e) => {
        e.preventDefault();
        const name = e.target.name.value;
        const start = e.target.start.value;
        const end = e.target.end.value;
        try {
            const res = await axios.post(`${API}/activities`, { name, start_time: start, end_time: end }, { headers });
            setActivities(prev => [...prev, { id: res.data.activity_id, name, start_time: start, end_time: end, days: [1,2,3,4,5,6,7] }]);
            addToast("Activity added", "success");
            e.target.reset();
        } catch (err) { addToast("Activity failed", "error"); }
    };

    if (loading) return <div className="page-shell">Loading your profile...</div>;

    return (
        <div className="page-shell mesh-bg">
            <div className="admin-main">
                <PageHeader 
                    title="User Health Profile" 
                    subtitle={`Personalized Threshold: ${threshold} AQI`} 
                />

                <div className="glass" style={{ borderRadius: '24px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
                        {['personal', 'conditions', 'locations', 'activities', 'places'].map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    flex: 1, padding: '16px', border: 'none', background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
                                    color: activeTab === tab ? 'var(--blue)' : 'var(--text)', fontWeight: 700, cursor: 'pointer',
                                    textTransform: 'capitalize', whiteSpace: 'nowrap',
                                    borderBottom: activeTab === tab ? '2px solid var(--blue)' : '2px solid transparent',
                                    transition: '0.2s'
                                }}
                            >
                                {tab === 'personal' && '👤 '}
                                {tab === 'conditions' && '🩺 '}
                                {tab === 'locations' && '🏠 '}
                                {tab === 'activities' && '⏰ '}
                                {tab === 'places' && '📍 '}
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div style={{ padding: '32px' }}>
                        {activeTab === 'personal' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div className="input-group">
                                    <label>Full Name</label>
                                    <input type="text" value={profile.full_name} onChange={e => setProfile({...profile, full_name: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label>Age</label>
                                    <input type="number" value={profile.age} onChange={e => setProfile({...profile, age: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label>Weight (kg)</label>
                                    <input type="number" value={profile.weight_kg} onChange={e => setProfile({...profile, weight_kg: e.target.value})} />
                                </div>
                                <div className="input-group">
                                    <label>Height (cm)</label>
                                    <input type="number" value={profile.height_cm} onChange={e => setProfile({...profile, height_cm: e.target.value})} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <input type="checkbox" checked={profile.is_smoker} onChange={e => setProfile({...profile, is_smoker: e.target.checked})} />
                                    <label>I am a smoker</label>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <button className="btn-primary" onClick={saveProfile}>Save Personal Info</button>
                                    <span style={{ marginLeft: '20px', color: 'var(--muted)' }}>BMI: {profile.bmi}</span>
                                </div>
                            </div>
                        )}

                        {activeTab === 'conditions' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                {conditions.map(c => (
                                    <div 
                                        key={c.id} 
                                        onClick={() => toggleCondition(c.id, c.name)}
                                        className="glass" 
                                        style={{ 
                                            padding: '20px', borderRadius: '16px', cursor: 'pointer', textAlign: 'center',
                                            border: userConditions.includes(c.id) ? '2px solid var(--blue)' : '1px solid var(--border)',
                                            transition: '0.2s'
                                        }}
                                    >
                                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>
                                            {c.icon === 'lungs' && '🌫️'}
                                            {c.icon === 'heart' && '❤️'}
                                            {c.icon === 'stethoscope' && '🩺'}
                                            {c.icon === 'droplet' && '💧'}
                                            {c.icon === 'baby-carriage' && '👶'}
                                            {c.icon === 'brain' && '🧠'}
                                        </div>
                                        <div style={{ fontWeight: 700 }}>{c.name}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'locations' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                {['home', 'work'].map(type => (
                                    <div key={type} className="glass" style={{ padding: '24px', borderRadius: '16px' }}>
                                        <h4 style={{ margin: '0 0 16px 0', textTransform: 'capitalize' }}>{type} Address</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px' }}>
                                            <input placeholder="Address" value={locations[type].address} onChange={e => setLocations({...locations, [type]: {...locations[type], address: e.target.value}})} />
                                            <input placeholder="City" value={locations[type].city} onChange={e => setLocations({...locations, [type]: {...locations[type], city: e.target.value}})} />
                                            <input placeholder="Lat" type="number" value={locations[type].lat} onChange={e => setLocations({...locations, [type]: {...locations[type], lat: e.target.value}})} />
                                            <input placeholder="Lon" type="number" value={locations[type].lon} onChange={e => setLocations({...locations, [type]: {...locations[type], lon: e.target.value}})} />
                                        </div>
                                        <button className="btn-secondary" style={{ marginTop: '16px' }} onClick={() => saveLocation(type)}>Update {type}</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === 'activities' && (
                            <div>
                                <form onSubmit={addActivity} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '12px', marginBottom: '32px' }}>
                                    <input name="name" placeholder="Activity (e.g. Gym)" required />
                                    <input name="start" type="time" required />
                                    <input name="end" type="time" required />
                                    <button className="btn-primary" type="submit">Add</button>
                                </form>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {activities.map(a => (
                                        <div key={a.id} className="glass" style={{ padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                            <div style={{ fontWeight: 700 }}>{a.name}</div>
                                            <div style={{ color: 'var(--muted)' }}>{a.start_time} - {a.end_time}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'places' && <ActivityLocations />}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfileForm;
