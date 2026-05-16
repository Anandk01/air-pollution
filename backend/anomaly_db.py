"""
anomaly_db.py
=============
SQLite persistence layer for anomaly events.

Table: anomaly_events
  id               INTEGER PRIMARY KEY AUTOINCREMENT
  detected_at      TEXT    (ISO-8601 UTC)
  city             TEXT
  pollutant        TEXT    (e.g. "PM2.5")
  observed_value   REAL
  expected_value   REAL
  anomaly_score    REAL
  cause_label      TEXT
  cause_confidence REAL
  explanation      TEXT
  resolved_at      TEXT    (NULL while active)
  is_false_positive INTEGER (0/1)

Table: fcm_tokens
  id         INTEGER PRIMARY KEY AUTOINCREMENT
  user_id    TEXT
  city       TEXT
  token      TEXT UNIQUE
  created_at TEXT
"""

import os
import sqlite3
import logging
from datetime import datetime, timezone
from contextlib import contextmanager

log = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "anomalies.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS anomaly_events (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    detected_at       TEXT    NOT NULL,
    city              TEXT    NOT NULL DEFAULT 'Delhi',
    pollutant         TEXT    NOT NULL DEFAULT 'PM2.5',
    observed_value    REAL    NOT NULL,
    expected_value    REAL    NOT NULL,
    anomaly_score     REAL    NOT NULL,
    cause_label       TEXT    NOT NULL,
    cause_confidence  REAL    NOT NULL,
    explanation       TEXT    NOT NULL,
    resolved_at       TEXT,
    is_false_positive INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fcm_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT    NOT NULL,
    city       TEXT    NOT NULL DEFAULT 'Delhi',
    token      TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL
);
"""


@contextmanager
def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db():
    """Create tables if they don't exist."""
    with _conn() as con:
        con.executescript(SCHEMA)
    log.info("Anomaly DB initialised at %s", DB_PATH)


def insert_anomaly(
    city: str,
    pollutant: str,
    observed_value: float,
    expected_value: float,
    anomaly_score: float,
    cause_label: str,
    cause_confidence: float,
    explanation: str,
) -> int:
    """Insert a new anomaly event. Returns the new row id."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        cur = con.execute(
            """INSERT INTO anomaly_events
               (detected_at, city, pollutant, observed_value, expected_value,
                anomaly_score, cause_label, cause_confidence, explanation)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (now, city, pollutant, observed_value, expected_value,
             anomaly_score, cause_label, cause_confidence, explanation),
        )
        return cur.lastrowid


def resolve_anomaly(anomaly_id: int):
    """Mark an anomaly as resolved (set resolved_at to now)."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            "UPDATE anomaly_events SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
            (now, anomaly_id),
        )


def mark_false_positive(anomaly_id: int):
    """Admin action: mark event as false positive."""
    with _conn() as con:
        con.execute(
            "UPDATE anomaly_events SET is_false_positive=1 WHERE id=?",
            (anomaly_id,),
        )


def get_recent_anomalies(city: str = "Delhi", days: int = 7) -> list[dict]:
    """Return anomaly events from the last N days for a city."""
    with _conn() as con:
        rows = con.execute(
            """SELECT * FROM anomaly_events
               WHERE city=?
                 AND detected_at >= datetime('now', ?)
                 AND is_false_positive=0
               ORDER BY detected_at DESC""",
            (city, f"-{days} days"),
        ).fetchall()
    return [dict(r) for r in rows]


def get_active_anomalies(city: str | None = None) -> list[dict]:
    """Return anomalies that have not been resolved yet."""
    with _conn() as con:
        if city:
            rows = con.execute(
                """SELECT * FROM anomaly_events
                   WHERE resolved_at IS NULL AND is_false_positive=0 AND city=?
                   ORDER BY detected_at DESC""",
                (city,),
            ).fetchall()
        else:
            rows = con.execute(
                """SELECT * FROM anomaly_events
                   WHERE resolved_at IS NULL AND is_false_positive=0
                   ORDER BY detected_at DESC"""
            ).fetchall()
    return [dict(r) for r in rows]


def resolve_city_anomalies(city: str):
    """Resolve all active anomalies for a city (called when values return to normal)."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            "UPDATE anomaly_events SET resolved_at=? WHERE city=? AND resolved_at IS NULL",
            (now, city),
        )


# ── FCM token helpers ─────────────────────────────────────────────────────────

def upsert_fcm_token(user_id: str, city: str, token: str):
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            """INSERT INTO fcm_tokens (user_id, city, token, created_at)
               VALUES (?,?,?,?)
               ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, city=excluded.city""",
            (user_id, city, token, now),
        )


def get_tokens_for_city(city: str) -> list[str]:
    with _conn() as con:
        rows = con.execute(
            "SELECT token FROM fcm_tokens WHERE city=?", (city,)
        ).fetchall()
    return [r["token"] for r in rows]
