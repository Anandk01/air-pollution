# Safe Route Navigation - Quick Setup Guide

## What's Already Built

Your AirGuard project **already has** a fully functional Safe Route Navigation system! Here's what exists:

### ✅ Backend (Complete)
- `safe_route_service.py` - Main routing API
- `route_pollution_service.py` - Alternative implementation
- Database tables for pollution reports and anomalies
- OSRM integration for route generation
- Health-profile-based scoring

### ✅ Frontend (Enhanced)
- `SafeRouteNavigator.jsx` - New polished UI component
- `RouteAQI.jsx` - Existing implementation
- Leaflet map integration
- GPS geolocation support

---

## What I Added

### 1. **Enhanced Frontend Component**
**File:** `frontend/src/pages/SafeRouteNavigator.jsx`

**Features:**
- Modern glassmorphism UI
- Better route comparison cards
- Improved destination selector
- Enhanced map visualization
- Better error handling

### 2. **Route Integration**
**File:** `frontend/src/App.jsx`
- Added `/safe-routes` route

### 3. **Navigation Link**
**File:** `frontend/src/components/Navbar.jsx`
- Added "Safe Routes" link with 🛡️ icon

### 4. **Documentation**
**File:** `SAFE_ROUTE_NAVIGATION_DOCS.md`
- Complete system documentation
- API specifications
- Architecture details

---

## How to Use

### 1. **Start Backend**
```bash
cd backend
python app.py
```

### 2. **Start Frontend**
```bash
cd frontend
npm run dev
```

### 3. **Access the Feature**
Navigate to: `http://localhost:5173/safe-routes`

### 4. **Test the Flow**

1. **Create User Profile** (if not done):
   - Go to `/profile`
   - Add health conditions (e.g., Asthma)
   - Save profile

2. **Add Saved Locations**:
   - Go to `/profile`
   - Add destinations (Gym, Office, Home, etc.)
   - Set preferred transport modes

3. **Use Safe Navigation**:
   - Go to `/safe-routes`
   - Select a destination from the top bar
   - Choose transport mode (Drive/Walk/Bike)
   - Click "Start Safe Navigation"
   - Allow GPS permission when prompted
   - View ranked routes on the map

---

## API Endpoints

### Primary Endpoint (Recommended)
```
POST /api/routes/safe-navigate
```

**Request:**
```json
{
  "source": {
    "lat": 12.9141,
    "lon": 77.6101
  },
  "destination_id": 5,
  "transport_mode": "driving"
}
```

### Alternative Endpoint
```
POST /api/routes/analyze
```
(Uses polyline encoding, slightly different response format)

---

## Key Features

### 🎯 **Personalized Scoring**
Routes are scored based on your health profile:
- **Asthma**: PM2.5 weighted 50%
- **Heart Disease**: NO₂ weighted 40%
- **Healthy**: Balanced weights

### 🗺️ **Multiple Route Options**
- **Safest Route** (Green) - Lowest pollution exposure
- **Fastest Route** (Blue) - Shortest duration
- **Balanced Route** (Purple) - Good compromise

### ⚠️ **Hazard Detection**
- Community pollution reports
- System-detected anomalies
- Real-time air quality data

### 📊 **Exposure Metrics**
- PM2.5 levels
- NO₂ levels
- Hazard count
- Risk level (Low/Moderate/High)

---

## Database Setup

The system uses existing tables, but if you need to recreate:

```sql
-- Already exists in your database
CREATE TABLE pollution_anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    severity REAL NOT NULL,
    type TEXT NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
);

CREATE TABLE pollution_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    incident_type TEXT,
    severity INTEGER,
    verified INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    expires_at DATETIME
);

CREATE TABLE user_saved_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    address TEXT,
    preferred_transport_mode TEXT
);
```

---

## Configuration

### Environment Variables (`.env`)
```bash
# Already configured in your project
PORT=5000
DEBUG=true
```

### Frontend Config (`vite.config.js`)
```javascript
export default {
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
}
```

---

## Troubleshooting

### Issue: GPS Not Working
**Solution:**
- Ensure HTTPS is enabled (required for geolocation)
- Check browser permissions
- Try in Chrome/Firefox (better GPS support)

### Issue: No Routes Found
**Solution:**
- Verify OSRM is accessible: `http://router.project-osrm.org`
- Check if coordinates are valid
- Try different transport mode

### Issue: No Saved Locations
**Solution:**
- Go to `/profile`
- Add at least one saved location
- Refresh `/safe-routes` page

### Issue: Backend Error
**Solution:**
- Check Flask logs
- Verify database exists: `backend/data/reports.db`
- Ensure all dependencies installed: `pip install -r requirements.txt`

---

## Testing

### Manual Test
```bash
# Test backend endpoint
curl -X POST http://localhost:5000/api/routes/safe-navigate \
  -H "Content-Type: application/json" \
  -d '{
    "source": {"lat": 28.6139, "lon": 77.2090},
    "destination_id": 1,
    "transport_mode": "driving"
  }'
```

### Expected Response
```json
{
  "success": true,
  "routes": [
    {
      "route_index": 0,
      "label": "Safest Route",
      "is_recommended": true,
      "exposure_score": 0.18,
      "risk_level": "Low",
      ...
    }
  ]
}
```

---

## Performance Tips

### 1. **Reduce API Calls**
- Routes are sampled at 12 waypoints (not all segments)
- Caching implemented for Open-Meteo responses

### 2. **Database Optimization**
```sql
CREATE INDEX idx_anomalies_location ON pollution_anomalies(latitude, longitude);
CREATE INDEX idx_reports_location ON pollution_reports(lat, lon);
```

### 3. **Frontend Optimization**
- Debounce destination selection
- Lazy load map tiles
- Memoize route calculations

---

## Next Steps

### Immediate
1. Test the feature at `/safe-routes`
2. Add some saved locations
3. Try different transport modes
4. Check route comparison cards

### Short-term
1. Add more pollution reports for testing
2. Create anomalies via admin panel
3. Test with different health profiles

### Long-term
1. Integrate real-time traffic data
2. Add route history/favorites
3. Implement offline mode
4. Add voice navigation

---

## Architecture Summary

```
User GPS Location
       ↓
Frontend (SafeRouteNavigator.jsx)
       ↓
POST /api/routes/safe-navigate
       ↓
Backend (safe_route_service.py)
       ↓
┌──────────────────────────────┐
│ 1. Fetch destination from DB │
│ 2. Call OSRM (alternatives)  │
│ 3. Segment routes (100m)     │
│ 4. Score each segment:       │
│    - Live PM2.5/NO2          │
│    - Nearby reports          │
│    - Nearby anomalies        │
│ 5. Aggregate scores          │
│ 6. Rank routes               │
└──────────────────────────────┘
       ↓
JSON Response
       ↓
Frontend renders:
- Route comparison cards
- Color-coded map
- Hazard markers
- Exposure metrics
```

---

## Support

If you encounter issues:

1. **Check Logs**
   - Backend: Flask console output
   - Frontend: Browser console (F12)

2. **Verify Services**
   - Backend: `http://localhost:5000/api/health`
   - OSRM: `http://router.project-osrm.org`

3. **Database**
   - Location: `backend/data/reports.db`
   - Tool: DB Browser for SQLite

---

## Summary

✅ **Backend is fully functional** - Uses existing `safe_route_service.py`
✅ **Frontend enhanced** - New `SafeRouteNavigator.jsx` with better UI
✅ **Navigation added** - Link in navbar
✅ **Documentation complete** - Full system docs provided

**You're ready to use the Safe Route Navigation system!**

Just start both servers and navigate to `/safe-routes`.

---

**Quick Start Command:**
```bash
# Terminal 1 - Backend
cd backend && python app.py

# Terminal 2 - Frontend
cd frontend && npm run dev

# Browser
# Open http://localhost:5173/safe-routes
```
