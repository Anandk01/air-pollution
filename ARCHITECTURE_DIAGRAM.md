# Safe Route Navigation - System Architecture Diagram

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER DEVICE                                   │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    BROWSER (Chrome/Firefox)                       │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │              React Frontend (Vite)                          │ │ │
│  │  │                                                             │ │ │
│  │  │  ┌──────────────────────────────────────────────────────┐  │ │ │
│  │  │  │      SafeRouteNavigator.jsx                          │  │ │ │
│  │  │  │  - Destination Selector                              │  │ │ │
│  │  │  │  - Transport Mode Toggle                             │  │ │ │
│  │  │  │  - Route Comparison Cards                            │  │ │ │
│  │  │  │  - Leaflet Map Visualization                         │  │ │ │
│  │  │  └──────────────────────────────────────────────────────┘  │ │ │
│  │  │                          ↓                                  │ │ │
│  │  │  ┌──────────────────────────────────────────────────────┐  │ │ │
│  │  │  │      Geolocation API                                 │  │ │ │
│  │  │  │  navigator.geolocation.getCurrentPosition()          │  │ │ │
│  │  │  └──────────────────────────────────────────────────────┘  │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                          HTTP POST Request
                    /api/routes/safe-navigate
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVER                                  │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    Flask Application                              │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │         safe_route_service.py                               │ │ │
│  │  │  POST /api/routes/safe-navigate                             │ │ │
│  │  │                                                             │ │ │
│  │  │  1. Validate request                                        │ │ │
│  │  │  2. Fetch destination from database                         │ │ │
│  │  │  3. Get user health profile                                 │ │ │
│  │  │  4. Calculate personalized weights                          │ │ │
│  │  │  5. Call OSRM for alternative routes                        │ │ │
│  │  │  6. Segment and score each route                            │ │ │
│  │  │  7. Rank routes by exposure                                 │ │ │
│  │  │  8. Return JSON response                                    │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     ROUTING SERVICE             │   │     POLLUTION DATA              │
│  ┌───────────────────────────┐  │   │  ┌───────────────────────────┐ │
│  │  OSRM (OpenStreetMap)     │  │   │  │  Open-Meteo API           │ │
│  │  router.project-osrm.org  │  │   │  │  air-quality-api          │ │
│  │                           │  │   │  │  .open-meteo.com          │ │
│  │  - Alternative routes     │  │   │  │                           │ │
│  │  - Distance calculation   │  │   │  │  - Live PM2.5             │ │
│  │  - Duration estimation    │  │   │  │  - Live NO₂               │ │
│  │  - GeoJSON coordinates    │  │   │  │  - Hourly forecasts       │ │
│  └───────────────────────────┘  │   │  └───────────────────────────┘ │
└─────────────────────────────────┘   └─────────────────────────────────┘
                    ↓                               ↓
                    └───────────────┬───────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE LAYER                                  │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                    SQLite Database                                │ │
│  │                    data/reports.db                                │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │  pollution_reports                                          │ │ │
│  │  │  - Community-submitted incidents                            │ │ │
│  │  │  - Verified/unverified status                               │ │ │
│  │  │  - Severity ratings (0-10)                                  │ │ │
│  │  │  - Geographic coordinates                                   │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │  pollution_anomalies                                        │ │ │
│  │  │  - System-detected pollution spikes                         │ │ │
│  │  │  - Type (garbage_burning, industrial_smoke, etc.)           │ │ │
│  │  │  - Severity (0-10)                                          │ │ │
│  │  │  - Expiration timestamps                                    │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │  user_saved_locations                                       │ │ │
│  │  │  - Activity names (Gym, Office, Home)                       │ │ │
│  │  │  - Coordinates (lat, lon)                                   │ │ │
│  │  │  - Preferred transport modes                                │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  │                                                                   │ │
│  │  ┌─────────────────────────────────────────────────────────────┐ │ │
│  │  │  user_health_conditions                                     │ │ │
│  │  │  - Asthma, COPD, Heart Disease, etc.                        │ │ │
│  │  │  - Used for personalized weight calculation                 │ │ │
│  │  └─────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌──────────────┐
│   User       │
│  Clicks      │
│  "Start      │
│  Navigation" │
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 1: Get Current GPS Location                            │
│  navigator.geolocation.getCurrentPosition()                  │
│  → Returns: { lat: 12.9141, lon: 77.6101 }                   │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 2: Send Request to Backend                             │
│  POST /api/routes/safe-navigate                              │
│  Body: {                                                      │
│    source: { lat: 12.9141, lon: 77.6101 },                   │
│    destination_id: 5,                                         │
│    transport_mode: "driving"                                  │
│  }                                                            │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 3: Backend Fetches Destination                         │
│  SELECT * FROM user_saved_locations WHERE id = 5             │
│  → Returns: { name: "Office", lat: 12.9716, lon: 77.5946 }   │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 4: Get User Health Profile                             │
│  SELECT condition_name FROM user_health_conditions           │
│  WHERE user_id = current_user                                │
│  → Returns: ["Asthma"]                                        │
│  → Calculates weights: { pm25: 0.50, no2: 0.15, ... }        │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 5: Call OSRM for Alternative Routes                    │
│  GET http://router.project-osrm.org/route/v1/driving/        │
│      77.6101,12.9141;77.5946,12.9716?alternatives=true       │
│  → Returns: 3 alternative routes with coordinates            │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 6: Segment Each Route                                  │
│  For each route:                                              │
│    - Split into 100m segments                                 │
│    - Sample 12 evenly-spaced waypoints                        │
│  → Route A: 84 segments → 12 sampled                          │
│  → Route B: 92 segments → 12 sampled                          │
│  → Route C: 78 segments → 12 sampled                          │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 7: Score Each Segment                                  │
│  For each sampled waypoint:                                   │
│                                                               │
│  7a. Fetch Live Pollution                                     │
│      GET open-meteo.com/v1/air-quality?lat=X&lon=Y           │
│      → PM2.5: 45 µg/m³, NO₂: 32 µg/m³                         │
│                                                               │
│  7b. Find Nearby Reports (250m radius)                        │
│      SELECT * FROM pollution_reports                          │
│      WHERE distance(lat, lon, X, Y) < 250                     │
│      → Found: 2 reports (severity: 6, 4)                      │
│                                                               │
│  7c. Find Nearby Anomalies (250m radius)                      │
│      SELECT * FROM pollution_anomalies                        │
│      WHERE distance(lat, lon, X, Y) < 250                     │
│      → Found: 1 anomaly (severity: 7)                         │
│                                                               │
│  7d. Calculate Weighted Score                                 │
│      score = (pm25_norm * 0.50) +                             │
│              (no2_norm * 0.15) +                              │
│              (report_score * 0.20) +                          │
│              (anomaly_score * 0.15)                           │
│      → Segment score: 0.32                                    │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 8: Aggregate Route Scores                              │
│  Route A: avg(segment_scores) = 0.18 → Low Risk              │
│  Route B: avg(segment_scores) = 0.42 → Moderate Risk         │
│  Route C: avg(segment_scores) = 0.28 → Moderate Risk         │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 9: Rank Routes                                         │
│  Sort by exposure_score (ascending):                          │
│  1. Route A (0.18) → "Safest Route" (Green)                  │
│  2. Route C (0.28) → "Balanced Route" (Yellow)               │
│  3. Route B (0.42) → "Fastest Route" (Red)                   │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 10: Return JSON Response                               │
│  {                                                            │
│    success: true,                                             │
│    routes: [                                                  │
│      {                                                        │
│        route_index: 0,                                        │
│        label: "Safest Route",                                 │
│        is_recommended: true,                                  │
│        exposure_score: 0.18,                                  │
│        risk_level: "Low",                                     │
│        distance_km: 8.4,                                      │
│        duration_min: 22.5,                                    │
│        hazard_count: 3,                                       │
│        coordinates: [[12.9141, 77.6101], ...],                │
│        color: "#22c55e"                                       │
│      },                                                       │
│      ...                                                      │
│    ]                                                          │
│  }                                                            │
└──────┬───────────────────────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────────────────────────────┐
│  STEP 11: Frontend Renders Results                           │
│  - Display route comparison cards                             │
│  - Draw color-coded polylines on map                          │
│  - Show hazard markers                                        │
│  - Highlight safest route                                     │
└───────────────────────────────────────────────────────────────┘
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SafeRouteNavigator.jsx                           │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  State Management                                             │ │
│  │  - savedLocations: []                                         │ │
│  │  - selectedDest: null                                         │ │
│  │  - currentPos: { lat, lon }                                   │ │
│  │  - routes: []                                                 │ │
│  │  - selectedRoute: null                                        │ │
│  │  - loading: false                                             │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Child Components                                             │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  DestinationSelector                                    │ │ │
│  │  │  - Displays saved locations as buttons                  │ │ │
│  │  │  - Emits onSelect(location) event                       │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  RouteComparisonCard (x3)                               │ │ │
│  │  │  - Shows route metrics                                  │ │ │
│  │  │  - Color-coded by risk level                            │ │ │
│  │  │  - Emits onClick() event                                │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  MapContainer (Leaflet)                                 │ │ │
│  │  │  ├─ TileLayer (OpenStreetMap)                           │ │ │
│  │  │  ├─ Polyline (x3 routes)                                │ │ │
│  │  │  ├─ CircleMarker (hazards)                              │ │ │
│  │  │  ├─ Marker (start location)                             │ │ │
│  │  │  └─ Marker (destination)                                │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Event Handlers                                               │ │
│  │  - fetchLocations() → GET /api/profile/saved-locations       │ │
│  │  - getGPS() → navigator.geolocation.getCurrentPosition()     │ │
│  │  - startNavigation() → POST /api/routes/safe-navigate        │ │
│  └───────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Scoring Algorithm Flowchart

```
START
  │
  ↓
┌─────────────────────────────┐
│ Get User Health Profile     │
│ - Asthma → pm25: 0.50       │
│ - Heart Disease → no2: 0.40 │
│ - Healthy → balanced        │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ For Each Route Segment      │
│ (100m waypoints)            │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Fetch Live Pollution        │
│ - PM2.5 from Open-Meteo     │
│ - NO₂ from Open-Meteo       │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Query Nearby Hazards        │
│ - Reports (250m radius)     │
│ - Anomalies (250m radius)   │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Normalize Values (0-1)      │
│ - pm25_norm = pm25 / 300    │
│ - no2_norm = no2 / 200      │
│ - report_norm = count / 10  │
│ - anomaly_norm = sev / 10   │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Calculate Weighted Score    │
│ score = Σ(value * weight)   │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Aggregate Segment Scores    │
│ route_score = avg(segments) │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Classify Risk Level         │
│ - score < 0.15 → Low        │
│ - 0.15-0.35 → Moderate      │
│ - score > 0.35 → High       │
└──────────┬──────────────────┘
           │
           ↓
┌─────────────────────────────┐
│ Rank Routes by Score        │
│ (ascending order)           │
└──────────┬──────────────────┘
           │
           ↓
         END
```

---

## Database Entity Relationship Diagram

```
┌─────────────────────────────┐
│  users                      │
│  ─────────────────────────  │
│  id (PK)                    │
│  email                      │
│  password_hash              │
└──────────┬──────────────────┘
           │
           │ 1:N
           │
           ↓
┌─────────────────────────────┐
│  user_saved_locations       │
│  ─────────────────────────  │
│  id (PK)                    │
│  user_id (FK)               │
│  activity_name              │
│  latitude                   │
│  longitude                  │
│  address                    │
│  preferred_transport_mode   │
└─────────────────────────────┘

┌─────────────────────────────┐
│  users                      │
└──────────┬──────────────────┘
           │
           │ 1:N
           │
           ↓
┌─────────────────────────────┐
│  user_health_conditions     │
│  ─────────────────────────  │
│  id (PK)                    │
│  user_id (FK)               │
│  condition_id (FK)          │
└──────────┬──────────────────┘
           │
           │ N:1
           │
           ↓
┌─────────────────────────────┐
│  health_conditions          │
│  ─────────────────────────  │
│  id (PK)                    │
│  condition_name             │
│  description                │
└─────────────────────────────┘

┌─────────────────────────────┐
│  pollution_reports          │
│  ─────────────────────────  │
│  id (PK)                    │
│  lat                        │
│  lon                        │
│  incident_type              │
│  severity                   │
│  verified                   │
│  is_active                  │
│  created_at                 │
│  expires_at                 │
└─────────────────────────────┘

┌─────────────────────────────┐
│  pollution_anomalies        │
│  ─────────────────────────  │
│  id (PK)                    │
│  latitude                   │
│  longitude                  │
│  type                       │
│  severity                   │
│  detected_at                │
│  expires_at                 │
└─────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    Load Balancer                          │ │
│  │                    (Nginx/HAProxy)                        │ │
│  └──────────────────────┬────────────────────────────────────┘ │
│                         │                                       │
│         ┌───────────────┴───────────────┐                       │
│         ↓                               ↓                       │
│  ┌──────────────┐               ┌──────────────┐               │
│  │  Frontend    │               │  Frontend    │               │
│  │  Server 1    │               │  Server 2    │               │
│  │  (Nginx)     │               │  (Nginx)     │               │
│  │  Port 80/443 │               │  Port 80/443 │               │
│  └──────┬───────┘               └──────┬───────┘               │
│         │                               │                       │
│         └───────────────┬───────────────┘                       │
│                         ↓                                       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    API Gateway                            │ │
│  │                    (Flask Backend)                        │ │
│  └──────────────────────┬────────────────────────────────────┘ │
│                         │                                       │
│         ┌───────────────┼───────────────┐                       │
│         ↓               ↓               ↓                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                   │
│  │ OSRM     │   │ Open-    │   │ SQLite   │                   │
│  │ Service  │   │ Meteo    │   │ Database │                   │
│  │ (Docker) │   │ API      │   │ (Local)  │                   │
│  └──────────┘   └──────────┘   └──────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

This architecture ensures:
- ✅ **Scalability** - Multiple frontend servers
- ✅ **Reliability** - Load balancing and failover
- ✅ **Performance** - Caching and optimization
- ✅ **Maintainability** - Clean separation of concerns
- ✅ **Security** - HTTPS, authentication, rate limiting
