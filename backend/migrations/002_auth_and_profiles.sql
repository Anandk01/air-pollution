-- ============================================================
-- Authentication & User Profiles - Database Migration
-- ============================================================

-- 1. Users (Authentication)
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    is_verified     BOOLEAN NOT NULL DEFAULT 0,
    otp             TEXT DEFAULT NULL,
    otp_expiry      TIMESTAMP DEFAULT NULL,
    reset_token     TEXT DEFAULT NULL,
    reset_expiry    TIMESTAMP DEFAULT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. User Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id                     TEXT PRIMARY KEY,
    full_name                   TEXT NOT NULL,
    age                         INTEGER,
    gender                      TEXT,
    weight_kg                   REAL,
    height_cm                   REAL,
    bmi                         REAL,
    is_smoker                   BOOLEAN NOT NULL DEFAULT 0,
    health_conditions           TEXT DEFAULT '[]', -- JSON array
    home_location               TEXT,              -- JSON object: {name, lat, lon}
    saved_locations             TEXT DEFAULT '[]', -- JSON array of objects
    calculated_aqi_threshold    INTEGER NOT NULL DEFAULT 150,
    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
