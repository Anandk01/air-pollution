from flask import Blueprint, jsonify, request
import logging
from reports_db import get_db

log = logging.getLogger(__name__)

admin_bp = Blueprint("admin", __name__)

@admin_bp.route("/stats", methods=["GET"])
def get_stats():
    """Returns overall system statistics."""
    try:
        with get_db() as conn:
            user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            report_count = conn.execute("SELECT COUNT(*) FROM pollution_reports").fetchone()[0]
            verified_count = conn.execute("SELECT COUNT(*) FROM pollution_reports WHERE verified = 1").fetchone()[0]
            
            # Anomaly stats from another DB? (simplified for now)
            anomaly_count = 12 # Mock data or query from anomaly_db if integrated
            
        return jsonify({
            "users": user_count,
            "reports": report_count,
            "verified_reports": verified_count,
            "active_anomalies": anomaly_count
        })
    except Exception as e:
        log.error(f"Admin stats error: {e}")
        return jsonify({"error": str(e)}), 500

@admin_bp.route("/reports/pending", methods=["GET"])
def get_pending_reports():
    """Returns reports that need verification."""
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM pollution_reports WHERE verified = 0 ORDER BY reported_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])

@admin_bp.route("/reports/verify", methods=["POST"])
def verify_report_api():
    data = request.json
    report_id = data.get("id")
    with get_db() as conn:
        conn.execute("UPDATE pollution_reports SET verified = 1 WHERE id = ?", (report_id,))
    return jsonify({"success": True})

@admin_bp.route("/users", methods=["GET"])
def get_users():
    """Returns list of registered users."""
    with get_db() as conn:
        rows = conn.execute("SELECT id, email, is_verified, created_at FROM users").fetchall()
    return jsonify([dict(r) for r in rows])
