-- ============================================================
-- 004_activity_locations.sql
-- Flexible saved activity locations per user.
-- e.g. Gym, Office, School, Jogging Park, Hospital
-- Designed for future integration with:
--   - Pollution-aware route planning (OSRM segments)
--   - Hazard avoidance (community reports within 500m)
--   - AQI alerts around frequent destinations
-- ============================================================

CREATE TABLE IF NOT EXISTS user_saved_locations (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                 TEXT NOT NULL,
    activity_name           TEXT NOT NULL,                  -- "Gym", "Office", "Jogging Park"
    latitude                REAL NOT NULL,
    longitude               REAL NOT NULL,
    address                 TEXT NOT NULL,
    city                    TEXT,
    preferred_transport_mode TEXT DEFAULT 'driving'
        CHECK (preferred_transport_mode IN ('driving','walking','bicycling','transit')),
    preferred_time          TEXT,                           -- "08:30" — when user usually travels there
    -- Future: aqi_alert_enabled BOOLEAN DEFAULT 1
    -- Future: geofence_radius_m INTEGER DEFAULT 500
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Prevent same (user, activity_name) duplicates
    UNIQUE (user_id, activity_name)
);

-- Fast lookup by user (most common query)
CREATE INDEX IF NOT EXISTS idx_usl_user ON user_saved_locations(user_id);

-- Spatial queries: find locations near a lat/lon bounding box
CREATE INDEX IF NOT EXISTS idx_usl_geo ON user_saved_locations(latitude, longitude);
