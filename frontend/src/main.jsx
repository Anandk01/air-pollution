import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import 'leaflet/dist/leaflet.css';
import "./index.css";
import App from "./App.jsx";

// In production VITE_API_URL points to the Render backend.
// In development the Vite proxy handles /api → localhost:5000, so baseURL stays ''.
if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}


createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
