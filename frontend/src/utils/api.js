import axios from 'axios';

// In production (Render), VITE_API_URL is set to the backend service URL.
// In development, Vite proxy forwards /api → localhost:5000, so we use ''.
const baseURL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

export default api;
