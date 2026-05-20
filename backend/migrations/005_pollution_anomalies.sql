-- migrations/005_pollution_anomalies.sql
-- Spatial pollution anomaly events used by safe-route scoring

CREATE TABLE IF NOT EXISTS pollution_anomalies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    latitude    REAL    NOT NULL,
    longitude   REAL    NOT NULL,
    severity    REAL    NOT NULL DEFAULT 1.0, -- 1.0 (Low) to 5.0 (Critical)
    type        TEXT    NOT NULL, -- 'FACTORY_SMOKE', 'CONSTRUCTION_DUST', 'TRAFFIC_CONGESTION', 'ANOMALY'
    description TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME,
    verified    BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pa_geo ON pollution_anomalies(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_pa_exp ON pollution_anomalies(expires_at);
