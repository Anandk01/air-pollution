import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const ProfileContext = createContext();

const defaultProfile = {
  name: "Rahul Kumar",
  memberSince: "Jan 2025",
  age: 34,
  gender: "Male",
  weight: 72,
  height: 175,
  smoker: false,
  healthConditions: ["Asthma", "Heart disease"],
  aqiThreshold: 85,
  locations: [
    { type: "Permanent home", name: "Rohini, Delhi", badge: "Morning report" },
    { type: "Work / office", name: "Connaught Place, Delhi", badge: "Commute alerts" },
    { type: "Current location", name: "Auto-detected (GPS)", badge: "Live alerts" },
    { type: "Outdoor schedule", name: "Morning walk 6–7am · Gym 7–8pm", badge: "Activity planner" }
  ]
};

export const ProfileProvider = ({ children }) => {
  const [profile, setProfile] = useState(defaultProfile);
  const [loading, setLoading] = useState(false);
  const { user, isAuthenticated } = useAuth();

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated || !user?.token) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/auth/profile', {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      setProfile(data);
    } catch (e) {
      console.error("Failed to fetch profile from server", e);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (updates) => {
    const newProfile = { ...profile, ...updates };
    setProfile(newProfile);
    
    if (isAuthenticated && user?.token) {
      try {
        await axios.post('/api/auth/profile', newProfile, {
          headers: { Authorization: `Bearer ${user.token}` }
        });
      } catch (e) {
        console.error("Failed to save profile to server", e);
      }
    } else {
      localStorage.setItem('user_profile', JSON.stringify(newProfile));
    }
  };

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, loading }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
