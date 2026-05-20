-- migrations/003_standardized_profiles.sql

-- Table 1: User profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,  
    full_name TEXT NOT NULL,
    age INTEGER NOT NULL,
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
    weight_kg REAL,
    height_cm REAL,
    bmi REAL,
    is_smoker BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table 2: Health conditions
CREATE TABLE IF NOT EXISTS health_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    condition_name TEXT NOT NULL UNIQUE,
    risk_multiplier REAL NOT NULL,
    icon_name TEXT 
);

-- Predefined conditions
INSERT OR IGNORE INTO health_conditions (condition_name, risk_multiplier, icon_name) VALUES
    ('Asthma', 1.8, 'lungs'),
    ('Heart disease', 1.6, 'heart'),
    ('COPD', 1.9, 'stethoscope'),
    ('Diabetes', 1.3, 'droplet'),
    ('Pregnant', 1.5, 'baby-carriage'),
    ('Allergies', 1.4, 'brain');

-- Table 3: User's active conditions
CREATE TABLE IF NOT EXISTS user_health_conditions (
    user_id TEXT NOT NULL,
    condition_id INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, condition_id),
    FOREIGN KEY (condition_id) REFERENCES health_conditions(id)
);

-- Table 4: User locations
CREATE TABLE IF NOT EXISTS user_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    location_type TEXT CHECK (location_type IN ('home', 'work', 'current')),
    address TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    city TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, location_type)
);

-- Table 5: User activity schedule
CREATE TABLE IF NOT EXISTS user_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    days_of_week TEXT DEFAULT '[1,2,3,4,5,6,7]',
    is_active BOOLEAN DEFAULT 1
);
