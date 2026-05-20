"""
reports_api.py
==============
Flask Blueprint: Community Pollution Reporting API.

Endpoints:
  POST   /api/reports               — Submit a new incident report
  GET    /api/reports/active        — Get active reports (optional bbox filter)
  POST   /api/reports/<id>/upvote   — Upvote/confirm a report
  PATCH  /api/reports/<id>/verify   — Admin: verify a report
  GET    /api/reports/route         — Reports near a route polyline
  GET    /api/reports/fused         — Fused satellite + reports for a point
"""

import json
import logging
from flask import Blueprint, request, jsonify
from reports_db import (
    run_migrations,
    insert_report,
    get_active_reports,
    get_reports_history,
    get_reports_near_route,
    upvote_report,
    verify_report,
)
from trust_engine import calculate_trust_score, get_user_trust
from pollution_fusion import fuse_pollution_for_segment

log = logging.getLogger(__name__)

reports_bp = Blueprint("reports", __name__)


# ── Initialize DB on first import ─────────────────────────────────────────────
run_migrations()
log.info("Community reports DB initialized.")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/reports — Submit a new incident report
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports", methods=["POST"])
def create_report():
    body = request.get_json(force=True, silent=True) or {}

    # Validate required fields
    required = ["incident_type", "lat", "lon", "severity"]
    missing = [f for f in required if f not in body]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    valid_types = [
        "FIRE", "INDUSTRY", "CRACKERS", "CONSTRUCTION",
        "VEHICLE_EXHAUST", "WASTE_BURNING", "DUST_STORM",
        "CHEMICAL_SPILL", "OTHER"
    ]
    if body["incident_type"] not in valid_types:
        return jsonify({"error": f"Invalid incident_type. Must be one of: {valid_types}"}), 400

    severity = body.get("severity", 3)
    if not (1 <= severity <= 5):
        return jsonify({"error": "Severity must be between 1 and 5"}), 400

    # Calculate trust score for the submitting user
    user_id = body.get("user_id", "anonymous")
    trust = calculate_trust_score(user_id)

    # Check if user was flagged as spam
    if trust == 0.0:
        return jsonify({
            "error": "Too many reports in a short time. Please wait before submitting again.",
            "spam_flagged": True
        }), 429

    body["trust_score"] = trust
    report = insert_report(body)

    return jsonify({
        "success": True,
        "report": report,
        "trust_score": trust
    }), 201


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/reports/active?bbox=lat1,lon1,lat2,lon2
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports/active", methods=["GET"])
def active_reports():
    bbox_str = request.args.get("bbox")
    bbox = None
    if bbox_str:
        try:
            parts = [float(x) for x in bbox_str.split(",")]
            if len(parts) == 4:
                bbox = tuple(parts)
        except ValueError:
            return jsonify({"error": "Invalid bbox format. Use: lat1,lon1,lat2,lon2"}), 400

    reports = get_active_reports(bbox)
    return jsonify({"success": True, "count": len(reports), "reports": reports}), 200


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/reports/history?bbox=lat1,lon1,lat2,lon2&days=7
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports/history", methods=["GET"])
def history_reports():
    bbox_str = request.args.get("bbox")
    days = int(request.args.get("days", 7))
    bbox = None
    if bbox_str:
        try:
            parts = [float(x) for x in bbox_str.split(",")]
            if len(parts) == 4:
                bbox = tuple(parts)
        except ValueError:
            return jsonify({"error": "Invalid bbox format. Use: lat1,lon1,lat2,lon2"}), 400

    reports = get_reports_history(bbox, days)
    return jsonify({"success": True, "count": len(reports), "reports": reports}), 200


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/reports/<id>/upvote
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports/<int:report_id>/upvote", methods=["POST"])
def upvote(report_id):
    body = request.get_json(force=True, silent=True) or {}
    user_id = body.get("user_id", "anonymous")

    result = upvote_report(report_id, user_id)
    if "error" in result:
        return jsonify(result), 400

    return jsonify({"success": True, "report": result}), 200


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /api/reports/<id>/verify
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports/<int:report_id>/verify", methods=["PATCH"])
def verify(report_id):
    result = verify_report(report_id)
    if "error" in result:
        return jsonify(result), 404

    return jsonify({"success": True, "report": result}), 200


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/reports/route?polyline=[[lat,lon],[lat,lon],...]
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports/route", methods=["GET"])
def route_reports():
    polyline_str = request.args.get("polyline")
    if not polyline_str:
        return jsonify({"error": "polyline parameter required (JSON array of [lat,lon] pairs)"}), 400

    try:
        polyline = json.loads(polyline_str)
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid polyline JSON"}), 400

    # Sample every Nth point to avoid too many queries
    step = max(1, len(polyline) // 50)
    sampled = polyline[::step]

    reports = get_reports_near_route(sampled)
    return jsonify({"success": True, "count": len(reports), "reports": reports}), 200


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/reports/fused?lat=...&lon=...&radius=500
# ─────────────────────────────────────────────────────────────────────────────
@reports_bp.route("/api/reports/fused", methods=["GET"])
def fused_data():
    try:
        lat = float(request.args.get("lat"))
        lon = float(request.args.get("lon"))
    except (TypeError, ValueError):
        return jsonify({"error": "lat and lon are required"}), 400

    radius = int(request.args.get("radius", 500))
    result = fuse_pollution_for_segment(lat, lon, radius)
    return jsonify({"success": True, **result}), 200
