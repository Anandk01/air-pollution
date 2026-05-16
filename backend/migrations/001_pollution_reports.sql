-- ============================================================
-- Community Pollution Reports - Database Migration
-- ============================================================

-- 1. Pollution Reports
CREATE TABLE IF NOT EXISTS pollution_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT NOT NULL DEFAULT 'anonymous',
    incident_type   TEXT NOT NULL CHECK (incident_type IN (
                        'FIRE', 'INDUSTRY', 'CRACKERS', 'CONSTRUCTION',
                        'VEHICLE_EXHAUST', 'WASTE_BURNING', 'DUST_STORM',
                        'CHEMICAL_SPILL', 'OTHER'
                    )),
    lat             REAL NOT NULL,
    lon             REAL NOT NULL,
    description     TEXT,
    severity        INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
    duration_type   TEXT NOT NULL DEFAULT 'TEMPORARY' CHECK (duration_type IN (
                        'TEMPORARY', 'PERMANENT', 'RECURRING'
                    )),
    duration_value  INTEGER DEFAULT NULL,         -- hours for TEMPORARY
    schedule_json   TEXT DEFAULT NULL,             -- JSON for RECURRING
    reported_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      TIMESTAMP DEFAULT NULL,       -- NULL = never expires
    trust_score     REAL NOT NULL DEFAULT 0.5,
    verified        BOOLEAN NOT NULL DEFAULT 0,
    upvote_count    INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT 1
);

-- 2. Report Upvotes (prevents duplicate upvotes)
CREATE TABLE IF NOT EXISTS report_upvotes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id   INTEGER NOT NULL REFERENCES pollution_reports(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_id, user_id)
);

-- 3. User Trust Scores
CREATE TABLE IF NOT EXISTS user_trust_scores (
    user_id         TEXT PRIMARY KEY,
    score           REAL NOT NULL DEFAULT 0.5,
    accuracy_rate   REAL NOT NULL DEFAULT 0.0,
    report_count    INTEGER NOT NULL DEFAULT 0,
    confirmed_count INTEGER NOT NULL DEFAULT 0,
    flagged_spam    BOOLEAN NOT NULL DEFAULT 0,
    first_report_at TIMESTAMP DEFAULT NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for spatial + temporal queries
CREATE INDEX IF NOT EXISTS idx_reports_active ON pollution_reports(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_reports_location ON pollution_reports(lat, lon);
CREATE INDEX IF NOT EXISTS idx_reports_user ON pollution_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_upvotes_report ON report_upvotes(report_id);
