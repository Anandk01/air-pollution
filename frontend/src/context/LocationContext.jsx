import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const LocationContext = createContext();

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null); // { lat, lon, city, name }
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('user_location');
    if (saved) {
      setLocation(jsonSafeParse(saved));
    } else {
      setAsking(true);
    }
  }, []);

  const jsonSafeParse = (str) => {
    try { return JSON.parse(str); } catch { return null; }
  };

  const updateLocation = (loc) => {
    setLocation(loc);
    localStorage.setItem('user_location', JSON.stringify(loc));
    setAsking(false);
  };

  const requestBrowserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        // Reverse geocode to get city name
        const { data } = await axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: { lat: latitude, lon: longitude, format: 'json' }
        });
        const cityName = data.address.city || data.address.town || data.address.village || "Unknown Location";
        updateLocation({ lat: latitude, lon: longitude, city: cityName, name: data.display_name });
      } catch (err) {
        updateLocation({ lat: latitude, lon: longitude, city: "Current Location", name: "Current Location" });
      }
    }, (err) => {
      console.error(err);
      alert("Please enable location access or select a city manually.");
    });
  };

  return (
    <LocationContext.Provider value={{ location, updateLocation, requestBrowserLocation, asking, setAsking }}>
      {children}
      {asking && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s ease'
        }}>
          <div className="glass animate-slide-up" style={{
            maxWidth: '340px', width: '90%', padding: '28px 24px', borderRadius: '24px',
            textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
            background: 'linear-gradient(180deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.95) 100%)'
          }}>
            <div style={{ 
              width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(79,142,247,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
              border: '1px solid rgba(79,142,247,0.3)', boxShadow: '0 0 20px rgba(79,142,247,0.2)'
            }}>
              <span style={{ fontSize: '28px' }}>📍</span>
            </div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>Enable Hyperlocal Data</h2>
            <p style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: 1.6, marginBottom: '24px', padding: '0 10px' }}>
              We need your location to show accurate air quality alerts and community reports near you.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={requestBrowserLocation}
                style={{
                  padding: '12px', borderRadius: '12px', 
                  background: 'linear-gradient(135deg, #4f8ef7, #3b82f6)',
                  color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.3)', fontSize: '14px',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                Use Current Location
              </button>
              <button 
                onClick={() => setAsking(false)}
                style={{
                  padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)',
                  color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}
    </LocationContext.Provider>
  );
};

export const useLocation = () => useContext(LocationContext);
