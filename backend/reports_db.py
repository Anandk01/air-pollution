"""
reports_db.py
=============
SQLite database helper for community pollution reports.
Handles connection, migration, and all CRUD operations.
"""

import os
import json
import sqlite3
import logging
from datetime import datetime, timedelta, timezone
from contextlib import contextmanager

log = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "reports.db")
MIGRATION_PATH = os.path.join(os.path.dirname(__file__), "migrations", "001_pollution_reports.sql")


def _ensure_dir():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


@contextmanager
def get_db():
    """Context manager that yields a sqlite3 connection with row_factory."""
    _ensure_dir()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def run_migrations():
    """Run all SQL migration files to create tables."""
    _ensure_dir()
    migrations_dir = os.path.dirname(MIGRATION_PATH)
    if not os.path.exists(migrations_dir):
        log.warning("Migrations directory not found")
        return
        
    migration_files = sorted([f for f in os.listdir(migrations_dir) if f.endswith('.sql')])
    
    with get_db() as conn:
        for m_file in migration_files:
            path = os.path.join(migrations_dir, m_file)
            with open(path, "r") as f:
                sql = f.read()
            conn.executescript(sql)
            log.info("Database migration applied: %s", m_file)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def insert_report(data: dict) -> dict:
    """Insert a new pollution report and return the created row."""
    now = datetime.now(timezone.utc)
    expires_at = _calc_expires(data, now)

    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO pollution_reports
               (user_id, incident_type, lat, lon, description, severity,
                duration_type, duration_value, schedule_json,
                reported_at, expires_at, trust_score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get("user_id", "anonymous"),
                data["incident_type"],
                data["lat"],
                data["lon"],
                data.get("description", ""),
                data["severity"],
                data.get("duration_type", "TEMPORARY"),
                data.get("duration_value"),
                json.dumps(data["schedule"]) if data.get("schedule") else None,
                now.isoformat(),
                expires_at.isoformat() if expires_at else None,
                data.get("trust_score", 0.5),
            ),
        )
        report_id = cur.lastrowid
        row = conn.execute("SELECT * FROM pollution_reports WHERE id = ?", (report_id,)).fetchone()
    return dict(row)


def get_active_reports(bbox: tuple = None) -> list:
    """Return all active, non-expired reports. Optionally filter by bounding box."""
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        # First, deactivate expired reports
        conn.execute(
            "UPDATE pollution_reports SET is_active = 0 WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1",
            (now,),
        )

        query = """SELECT * FROM pollution_reports WHERE is_active = 1"""
        params = []

        if bbox:
            lat1, lon1, lat2, lon2 = bbox
            min_lat, max_lat = min(lat1, lat2), max(lat1, lat2)
            min_lon, max_lon = min(lon1, lon2), max(lon1, lon2)
            query += " AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?"
            params.extend([min_lat, max_lat, min_lon, max_lon])

        query += " ORDER BY reported_at DESC"
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def get_reports_history(bbox: tuple = None, days: int = 7) -> list:
    """Return all reports from the last N days, regardless of active status."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with get_db() as conn:
        query = "SELECT * FROM pollution_reports WHERE reported_at >= ?"
        params = [since]

        if bbox:
            lat1, lon1, lat2, lon2 = bbox
            min_lat, max_lat = min(lat1, lat2), max(lat1, lat2)
            min_lon, max_lon = min(lon1, lon2), max(lon1, lon2)
            query += " AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?"
            params.extend([min_lat, max_lat, min_lon, max_lon])

        query += " ORDER BY reported_at ASC"
        rows = conn.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def get_reports_near_route(polyline: list, radius_deg: float = 0.005) -> list:
    """
    Get all active reports within ~500m of a route polyline.
    polyline: list of [lat, lon] pairs.
    radius_deg: approx 0.005° ≈ 500m
    """
    if not polyline:
        return []

    now = datetime.now(timezone.utc).isoformat()
    all_reports = []
    seen_ids = set()

    with get_db() as conn:
        conn.execute(
            "UPDATE pollution_reports SET is_active = 0 WHERE expires_at IS NOT NULL AND expires_at < ? AND is_active = 1",
            (now,),
        )
        for lat, lon in polyline:
            rows = conn.execute(
                """SELECT * FROM pollution_reports
                   WHERE is_active = 1
                     AND lat BETWEEN ? AND ?
                     AND lon BETWEEN ? AND ?
                   ORDER BY reported_at DESC""",
                (lat - radius_deg, lat + radius_deg, lon - radius_deg, lon + radius_deg),
            ).fetchall()
            for r in rows:
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    all_reports.append(dict(r))

    return all_reports


def upvote_report(report_id: int, user_id: str) -> dict:
    """Upvote a report. Returns updated report or error."""
    with get_db() as conn:
        # Check duplicate
        existing = conn.execute(
            "SELECT 1 FROM report_upvotes WHERE report_id = ? AND user_id = ?",
            (report_id, user_id),
        ).fetchone()
        if existing:
            return {"error": "Already upvoted"}

        conn.execute(
            "INSERT INTO report_upvotes (report_id, user_id) VALUES (?, ?)",
            (report_id, user_id),
        )
        conn.execute(
            "UPDATE pollution_reports SET upvote_count = upvote_count + 1 WHERE id = ?",
            (report_id,),
        )
        row = conn.execute("SELECT * FROM pollution_reports WHERE id = ?", (report_id,)).fetchone()
    return dict(row) if row else {"error": "Report not found"}


def verify_report(report_id: int) -> dict:
    """Admin: mark a report as verified."""
    with get_db() as conn:
        conn.execute(
            "UPDATE pollution_reports SET verified = 1 WHERE id = ?",
            (report_id,),
        )
        row = conn.execute("SELECT * FROM pollution_reports WHERE id = ?", (report_id,)).fetchone()
    return dict(row) if row else {"error": "Report not found"}


# ── Expiry Calculation ────────────────────────────────────────────────────────

def _calc_expires(data: dict, now: datetime):
    """Calculate expires_at based on incident_type and duration settings."""
    dtype = data.get("duration_type", "TEMPORARY")
    dval = data.get("duration_value")
    itype = data.get("incident_type", "OTHER")

    if dtype == "PERMANENT":
        return None  # never expires

    if dtype == "RECURRING":
        return None  # managed by schedule

    # TEMPORARY — use provided duration_value or defaults
    default_hours = {
        "FIRE": 3,
        "CRACKERS": 1,
        "CONSTRUCTION": 8,
        "VEHICLE_EXHAUST": 2,
        "WASTE_BURNING": 4,
        "DUST_STORM": 6,
        "CHEMICAL_SPILL": 12,
        "INDUSTRY": 24,
        "OTHER": 4,
    }
    hours = dval if dval else default_hours.get(itype, 4)
    return now + timedelta(hours=hours)
