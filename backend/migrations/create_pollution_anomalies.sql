-- Pollution Anomalies Table
CREATE TABLE IF NOT EXISTS pollution_anomalies (
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

CREATE INDEX IF NOT EXISTS idx_anomalies_location ON pollution_anomalies(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_anomalies_expires ON pollution_anomalies(expires_at);
