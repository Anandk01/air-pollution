# Safe Route Navigation System - Complete Documentation

## Overview

The **Safe Route Navigation System** is a production-grade, personalized pollution-aware routing engine that calculates the safest path between a user's current GPS location and their saved destinations. It prioritizes **lowest pollution exposure** over shortest distance.

---

## Architecture

### Backend Components

#### 1. **Route Scoring Service** (`services/route_scorer.py`)
- Segments routes into 100m waypoints
- Calculates pollution exposure for each segment
- Applies health-profile-based weighting
- Aggregates hazards within 200m radius

**Key Functions:**
- `create_route_segments()` - Splits route into analysis segments
- `get_nearby_hazards()` - Finds pollution sources near each segment
- `calculate_segment_score()` - Computes weighted exposure score
- `score_route()` - Aggregates segment scores into route-level metrics

#### 2. **Hazard Aggregation Service** (`services/hazard_aggregator.py`)
- Fetches verified community pollution reports
- Retrieves active pollution anomalies
- Combines multiple hazard sources

**Data Sources:**
- `pollution_reports` table (verified community reports)
- `pollution_anomalies` table (system-detected hazards)

#### 3. **Safe Route API** (`safe_route_service.py`)
- Flask Blueprint: `/api/routes/safe-navigate`
- Integrates OSRM for alternative route generation
- Applies personalized health weighting
- Returns ranked routes with exposure metrics

---

## Database Schema

### `pollution_anomalies`
```sql
CREATE TABLE pollution_anomalies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    severity REAL NOT NULL,
    type TEXT NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    CHECK (severity >= 0 AND severity <= 10),
    CHECK (type IN ('garbage_burning', 'industrial_smoke', 'construction_dust', 'traffic_congestion', 'other'))
);
```

### `pollution_reports` (existing)
- Community-submitted pollution incidents
- Verified/unverified status
- Severity ratings (0-10)
- Geographic coordinates

### `user_saved_locations` (existing)
- User's frequently visited destinations
- Preferred transport modes
- Activity names (Gym, Office, Home, etc.)

---

## API Specification

### POST `/api/routes/safe-navigate`

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

**Response:**
```json
{
  "success": true,
  "destination": {
    "id": 5,
    "name": "Office",
    "address": "MG Road, Bangalore",
    "lat": 12.9716,
    "lon": 77.5946
  },
  "transport_mode": "driving",
  "weights_used": {
    "pm25": 0.50,
    "no2": 0.15,
    "report": 0.20,
    "anomaly": 0.15
  },
  "routes": [
    {
      "route_index": 0,
      "label": "Safest Route",
      "is_recommended": true,
      "coordinates": [[12.9141, 77.6101], ...],
      "distance_km": 8.4,
      "duration_min": 22.5,
      "exposure_score": 0.18,
      "risk_level": "Low",
      "hazard_count": 3,
      "high_risk_segments": 0,
      "color": "#22c55e",
      "breakdown": {
        "pm25": 0.12,
        "no2": 0.08,
        "reports": 0.05,
        "anomaly": 0.02
      },
      "hazards": [
        {
          "lat": 12.9200,
          "lon": 77.6050,
          "type": "garbage_burning",
          "severity": 6,
          "source": "anomaly"
        }
      ]
    },
    {
      "route_index": 1,
      "label": "Fastest Route",
      "is_recommended": false,
      "exposure_score": 0.42,
      "risk_level": "Moderate",
      ...
    }
  ]
}
```

---

## Route Scoring Algorithm

### Formula
```
route_score = (pm25 * w_pm25) + (no2 * w_no2) + (report_density * w_report) + (anomaly_score * w_anomaly)
```

### Health-Based Weights

| Condition | PM2.5 | NO₂ | Reports | Anomalies |
|-----------|-------|-----|---------|-----------|
| **Asthma** | 0.50 | 0.15 | 0.20 | 0.15 |
| **COPD** | 0.50 | 0.15 | 0.20 | 0.15 |
| **Heart Disease** | 0.25 | 0.40 | 0.20 | 0.15 |
| **Diabetes** | 0.30 | 0.25 | 0.25 | 0.20 |
| **Healthy** | 0.35 | 0.20 | 0.25 | 0.20 |

### Risk Levels
- **Low**: score < 0.15 (Green)
- **Moderate**: 0.15 ≤ score < 0.35 (Yellow)
- **High**: score ≥ 0.35 (Red)

---

## Frontend Implementation

### Component: `SafeRouteNavigator.jsx`

**Features:**
- Live GPS location detection
- Destination selector (horizontal scrollable buttons)
- Transport mode toggle (Drive/Walk/Bike)
- Route comparison cards with glassmorphism design
- Interactive Leaflet map with:
  - Color-coded route polylines
  - Hazard markers (reports & anomalies)
  - Start/end location pins
  - Legend overlay

**UI Design:**
- Glassmorphism cards with backdrop blur
- Smooth transitions and animations
- Responsive grid layout (380px sidebar + map)
- Color-coded risk indicators
- Real-time exposure metrics

---

## Integration Flow

```
1. User opens /safe-routes page
   ↓
2. Frontend fetches saved locations from /api/profile/saved-locations
   ↓
3. User selects destination (e.g., "Office")
   ↓
4. User clicks "Start Safe Navigation"
   ↓
5. Browser requests GPS coordinates (navigator.geolocation)
   ↓
6. Frontend sends POST to /api/routes/safe-navigate with:
   - Current GPS location
   - Destination ID
   - Transport mode
   ↓
7. Backend:
   a. Fetches destination from database
   b. Calls OSRM with alternatives=true
   c. Gets 2-3 alternative routes
   d. Segments each route into 100m waypoints
   e. For each waypoint:
      - Fetches live PM2.5/NO2 from Open-Meteo
      - Queries nearby pollution reports (250m radius)
      - Queries nearby anomalies (250m radius)
      - Calculates weighted exposure score
   f. Aggregates segment scores into route-level metrics
   g. Ranks routes by exposure score (lowest = safest)
   ↓
8. Frontend displays:
   - Route comparison cards (sorted by safety)
   - Map with color-coded routes
   - Hazard markers
   - Exposure breakdown
```

---

## OSRM Integration

**Endpoint:** `http://router.project-osrm.org/route/v1/{mode}/{lon1},{lat1};{lon2},{lat2}`

**Parameters:**
- `mode`: driving / foot / bicycle
- `alternatives=true`: Returns 2-3 alternative routes
- `overview=full`: Full route geometry
- `geometries=geojson`: Returns coordinates as GeoJSON

**Response:**
```json
{
  "code": "Ok",
  "routes": [
    {
      "geometry": {
        "coordinates": [[lon, lat], ...]
      },
      "distance": 8400,
      "duration": 1350
    }
  ]
}
```

---

## Pollution Data Sources

### 1. **Live Air Quality** (Open-Meteo API)
- PM2.5 (µg/m³)
- NO₂ (µg/m³)
- Real-time data for any coordinate
- Free, no API key required

### 2. **Community Reports** (Database)
- User-submitted pollution incidents
- Verified by trust engine
- Types: garbage burning, industrial smoke, traffic, etc.
- Severity: 0-10 scale

### 3. **System Anomalies** (Database)
- ML-detected pollution spikes
- Automatically expires after 24-48 hours
- Types: construction dust, traffic congestion, etc.

---

## Performance Optimizations

### 1. **Segment Sampling**
- Routes segmented every 100m
- Only 12 evenly-spaced waypoints sampled for API calls
- Reduces API latency from 30s to ~5s

### 2. **Spatial Indexing**
```sql
CREATE INDEX idx_anomalies_location ON pollution_anomalies(latitude, longitude);
CREATE INDEX idx_reports_location ON pollution_reports(lat, lon);
```

### 3. **Caching Strategy**
- Open-Meteo responses cached for 15 minutes
- OSRM routes cached by source/destination hash
- Database queries use bounding box pre-filtering

### 4. **Concurrent Processing**
- Segment analysis parallelized (future enhancement)
- Multiple route scoring in parallel

---

## Error Handling

### GPS Errors
```javascript
try {
  const gps = await getGPS();
} catch (err) {
  if (err.code === 1) alert("GPS permission denied");
  if (err.code === 2) alert("GPS unavailable");
  if (err.code === 3) alert("GPS timeout");
}
```

### API Failures
- OSRM timeout: Fallback to single route
- Open-Meteo failure: Use historical averages
- Database errors: Return partial results with warning

---

## Security Considerations

### 1. **User Authentication**
- Routes require valid user session
- Destination access validated (user_id match)

### 2. **Rate Limiting**
- Max 10 route calculations per minute per user
- GPS requests throttled to prevent abuse

### 3. **Data Privacy**
- GPS coordinates never stored
- Route history optional (user consent required)

---

## Testing

### Unit Tests
```python
# test_route_scorer.py
def test_segment_creation():
    coords = [(12.91, 77.61), (12.92, 77.62)]
    segments = RouteScorer.create_route_segments(coords, 100)
    assert len(segments) > 0
    assert all('lat' in s and 'lon' in s for s in segments)

def test_hazard_detection():
    segment = {'lat': 12.91, 'lon': 77.61}
    hazards = [{'latitude': 12.91, 'longitude': 77.61, 'severity': 5}]
    nearby = RouteScorer.get_nearby_hazards(segment, hazards, 200)
    assert len(nearby) == 1
```

### Integration Tests
```bash
curl -X POST http://localhost:5000/api/routes/safe-navigate \
  -H "Content-Type: application/json" \
  -d '{
    "source": {"lat": 12.9141, "lon": 77.6101},
    "destination_id": 5,
    "transport_mode": "driving"
  }'
```

---

## Future Enhancements

### 1. **Real-Time Traffic Integration**
- Google Maps Traffic API
- Adjust route scores based on congestion

### 2. **Weather Conditions**
- Rain/wind affects pollution dispersion
- Adjust weights dynamically

### 3. **Historical Patterns**
- Time-of-day pollution trends
- Weekday vs weekend patterns

### 4. **Multi-Modal Routing**
- Combine walking + metro + auto
- Optimize for total exposure

### 5. **Route Caching**
- Store frequently used routes
- Update only when hazards change

### 6. **Offline Mode**
- Download routes for offline use
- Sync hazards when online

---

## Deployment Checklist

- [ ] Database migrations applied
- [ ] OSRM service accessible
- [ ] Open-Meteo API reachable
- [ ] GPS permissions configured in browser
- [ ] HTTPS enabled (required for geolocation)
- [ ] Rate limiting configured
- [ ] Error monitoring (Sentry/Rollbar)
- [ ] Performance monitoring (New Relic)
- [ ] Backup strategy for route history

---

## Troubleshooting

### Issue: "No routes found"
**Cause:** OSRM cannot find path between coordinates
**Solution:** Check if coordinates are on road network, try different transport mode

### Issue: "GPS permission denied"
**Cause:** User blocked location access
**Solution:** Show instructions to enable in browser settings

### Issue: "High exposure scores for all routes"
**Cause:** Destination in heavily polluted area
**Solution:** Suggest alternative destinations or different time

### Issue: "Slow route calculation"
**Cause:** Too many segments being analyzed
**Solution:** Reduce sampling frequency or implement caching

---

## Contact & Support

For issues or feature requests:
- GitHub: [air-project/issues](https://github.com/your-org/air-project/issues)
- Email: support@airguard.com
- Docs: https://docs.airguard.com/safe-routes

---

**Last Updated:** 2024
**Version:** 1.0.0
**License:** MIT
