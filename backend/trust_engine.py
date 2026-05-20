"""
trust_engine.py
===============
Trust score calculation engine for community pollution reports.

Scoring rules:
  - Base score: 0.5
  - Account age > 30 days: +0.1
  - Accuracy rate (confirmed by satellite): +0.1 per confirmed (max +0.3)
  - Upvote ratio (avg upvotes per report): +0.05 per avg upvote (max +0.2)
  - Spam detection: >5 reports in 1 hour → score = 0.0, flagged
  - Final score clamped to [0.0, 1.0]
"""

import logging
from datetime import datetime, timedelta, timezone
from reports_db import get_db

log = logging.getLogger(__name__)


def calculate_trust_score(user_id: str) -> float:
    """Calculate and persist trust score for a user. Returns the score."""
    if not user_id or user_id == "anonymous":
        return 0.3  # anonymous users get low trust

    with get_db() as conn:
        # ── Fetch user history ────────────────────────────────────────────
        reports = conn.execute(
            "SELECT * FROM pollution_reports WHERE user_id = ? ORDER BY reported_at DESC",
            (user_id,),
        ).fetchall()

        if not reports:
            return 0.5  # new user, neutral trust

        report_count = len(reports)

        # ── Spam detection: >5 reports in last hour ───────────────────────
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        recent_count = conn.execute(
            "SELECT COUNT(*) FROM pollution_reports WHERE user_id = ? AND reported_at > ?",
            (user_id, one_hour_ago),
        ).fetchone()[0]

        if recent_count > 5:
            log.warning("Spam detected for user %s: %d reports in 1 hour", user_id, recent_count)
            _upsert_trust(conn, user_id, 0.0, 0.0, report_count, 0, flagged=True)
            return 0.0

        # ── Base score ────────────────────────────────────────────────────
        score = 0.5

        # ── Account age bonus ─────────────────────────────────────────────
        first_report = reports[-1]  # oldest report
        first_at = datetime.fromisoformat(first_report["reported_at"].replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - first_at).days > 30:
            score += 0.1

        # ── Accuracy rate (verified reports) ──────────────────────────────
        confirmed = sum(1 for r in reports if r["verified"])
        accuracy_rate = confirmed / report_count if report_count > 0 else 0.0
        score += min(confirmed * 0.1, 0.3)

        # ── Upvote ratio ─────────────────────────────────────────────────
        total_upvotes = sum(r["upvote_count"] for r in reports)
        avg_upvotes = total_upvotes / report_count if report_count > 0 else 0
        score += min(avg_upvotes * 0.05, 0.2)

        # ── Clamp ────────────────────────────────────────────────────────
        score = round(max(0.0, min(score, 1.0)), 3)

        _upsert_trust(conn, user_id, score, accuracy_rate, report_count, confirmed)

    return score


def _upsert_trust(conn, user_id, score, accuracy_rate, report_count, confirmed, flagged=False):
    """Insert or update user trust score record."""
    now = datetime.now(timezone.utc).isoformat()
    existing = conn.execute("SELECT 1 FROM user_trust_scores WHERE user_id = ?", (user_id,)).fetchone()
    if existing:
        conn.execute(
            """UPDATE user_trust_scores
               SET score = ?, accuracy_rate = ?, report_count = ?,
                   confirmed_count = ?, flagged_spam = ?, updated_at = ?
               WHERE user_id = ?""",
            (score, accuracy_rate, report_count, confirmed, int(flagged), now, user_id),
        )
    else:
        conn.execute(
            """INSERT INTO user_trust_scores
               (user_id, score, accuracy_rate, report_count, confirmed_count,
                flagged_spam, first_report_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, score, accuracy_rate, report_count, confirmed, int(flagged), now, now),
        )


def get_user_trust(user_id: str) -> dict:
    """Get user trust info."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM user_trust_scores WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        return dict(row)
    return {"user_id": user_id, "score": 0.5, "accuracy_rate": 0.0, "report_count": 0}
