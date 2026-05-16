"""
safe_route_service.py
=====================
POST /api/routes/safe-navigate

Calculates multiple alternative routes between the user's live GPS location
and a saved destination, scores each route for pollution exposure using
health-profile-weighted scoring, and returns ranked results.

Scoring formula (lower = safer):
  score = (pm25 * w_pm25) + (no2 * w_no2) + (report_density * w_report) + (anomaly * w_anomaly)

Health weights are personalised per user condition.
"""

import logging
import math
from datetime import datetime, timezone

import requests as http_req
from flask import Blueprint, request, jsonify

from reports_db import get_db
from profile_service import get_user_id
from utils.haversine import haversine

log = logging.getLogger(__name__)

safe_route_bp = Blueprint("safe_route", __name__)

OSRM_BASE = "http://router.project-osrm.org/route/v1"

# ── Transport mode mapping ────────────────────────────────────────────────────
_OSRM_MODE = {
    "driving":   "driving",
    "walking":   "foot",
    "bicycling": "bike",
    "transit":   "driving",   # OSRM has no transit; fall back to driving
}

# ── Default health weights ────────────────────────────────────────────────────
_DEFAULT_WEIGHTS = {"pm25": 0.35, "no2": 0.20, "report": 0.25, "anomaly": 0.20}

# Condition-specific weight overrides (condition_name → weight dict)
_CONDITION_WEIGHTS = {
    "asthma":          {"pm25": 0.50, "no2": 0.15, "report": 0.20, "anomaly": 0.15},
    "copd":            {"pm25": 0.50, "no2": 0.15, "report": 0.20, "anomaly": 0.15},
    "heart disease":   {"pm25": 0.25, "no2": 0.40, "report": 0.20, "anomaly": 0.15},
    "cardiovascular":  {"pm25": 0.25, "no2": 0.40, "report": 0.20, "anomaly": 0.15},
    "diabetes":        {"pm25": 0.30, "no2": 0.25, "report": 0.25, "anomaly": 0.20},
    "pregnancy":       {"pm25": 0.40, "no2": 0.25, "report": 0.20, "anomaly": 0.15},
    "child":           {"pm25": 0.45, "no2": 0.20, "report": 0.20, "anomaly": 0.15},
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_health_weights(user_id: str) -> dict:
    """Return personalised scoring weights based on user health conditions."""
    try:
        with get_db() as conn:
            rows = conn.execute(
                """SELECT LOWER(hc.condition_name) as name
                   FROM user_health_conditions uhc
                   JOIN health_conditions hc ON uhc.condition_id = hc.id
                   WHERE uhc.user_id = ?""",
                (user_id,)
            ).fetchall()
        conditions = [r["name"] for r in rows]
        for cond, weights in _CONDITION_WEIGHTS.items():
            if any(cond in c for c in conditions):
                return weights
    except Exception as exc:
        log.warning("Could not fetch health weights: %s", exc)
    return _DEFAULT_WEIGHTS.copy()


def _fetch_live_pollution(lat: float, lon: float) -> dict:
    """Fetch live PM2.5 and NO2 from Open-Meteo for a coordinate."""
    try:
        resp = http_req.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={
                "latitude": lat, "longitude": lon,
                "current": "pm2_5,nitrogen_dioxide",
                "timezone": "auto",
            },
            timeout=6,
        )
        if resp.ok:
            cur = resp.json().get("current", {})
            return {
                "pm25": float(cur.get("pm2_5") or 0),
                "no2":  float(cur.get("nitrogen_dioxide") or 0),
            }
    except Exception as exc:
        log.debug("Open-Meteo fetch failed for (%.4f, %.4f): %s", lat, lon, exc)
    return {"pm25": 0.0, "no2": 0.0}


def _get_reports_near(lat: float, lon: float, radius_m: float = 250) -> list:
    """Return active pollution reports within radius_m metres."""
    try:
        deg = radius_m / 111_000
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            rows = conn.execute(
                """SELECT id, severity, verified, incident_type, lat, lon
                   FROM pollution_reports
                   WHERE is_active = 1
                     AND (expires_at IS NULL OR expires_at > ?)
                     AND lat BETWEEN ? AND ?
                     AND lon BETWEEN ? AND ?""",
                (now, lat - deg, lat + deg, lon - deg, lon + deg),
            ).fetchall()
        result = []
        for r in rows:
            d = haversine(lat, lon, r["lat"], r["lon"])
            if d <= radius_m:
                result.append({"severity": r["severity"], "verified": bool(r["verified"]),
                                "type": r["incident_type"], "dist_m": d})
        return result
    except Exception as exc:
        log.debug("Reports query failed: %s", exc)
        return []


def _get_anomalies_near(lat: float, lon: float, radius_m: float = 250) -> list:
    """Return active pollution anomalies within radius_m metres."""
    try:
        deg = radius_m / 111_000
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            rows = conn.execute(
                """SELECT id, severity, type, latitude, longitude
                   FROM pollution_anomalies
                   WHERE (expires_at IS NULL OR expires_at > ?)
                     AND latitude BETWEEN ? AND ?
                     AND longitude BETWEEN ? AND ?""",
                (now, lat - deg, lat + deg, lon - deg, lon + deg),
            ).fetchall()
        result = []
        for r in rows:
            d = haversine(lat, lon, r["latitude"], r["longitude"])
            if d <= radius_m:
                result.append({"severity": r["severity"], "type": r["type"], "dist_m": d})
        return result
    except Exception as exc:
        log.debug("Anomalies query failed: %s", exc)
        return []


def _interpolate_coords(coords: list, step_m: float = 100) -> list:
    """
    Interpolate a list of [lon, lat] OSRM coords into ~step_m metre waypoints.
    Returns list of (lat, lon) tuples.
    """
    points = []
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        seg_dist = haversine(lat1, lon1, lat2, lon2)
        n = max(1, int(seg_dist / step_m))
        for j in range(n):
            t = j / n
            points.append((lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t))
    if coords:
        points.append((coords[-1][1], coords[-1][0]))
    return points


def _score_route(waypoints: list, weights: dict) -> dict:
    """
    Score a route by sampling pollution at each waypoint.
    Returns score dict with component breakdown and hazard list.
    """
    # Sample at most 12 evenly-spaced waypoints to limit API calls
    n = len(waypoints)
    step = max(1, n // 12)
    sampled = waypoints[::step]

    total_pm25 = total_no2 = total_report = total_anomaly = 0.0
    hazards = []

    for lat, lon in sampled:
        poll = _fetch_live_pollution(lat, lon)
        reports = _get_reports_near(lat, lon)
        anomalies = _get_anomalies_near(lat, lon)

        # Normalise PM2.5 (0–500 scale → 0–1)
        pm25_norm = min(poll["pm25"] / 300.0, 1.0)
        # Normalise NO2 (0–400 µg/m³ → 0–1)
        no2_norm = min(poll["no2"] / 200.0, 1.0)

        # Report density score (0–1)
        report_score = 0.0
        for rep in reports:
            w = 1.0 if rep["verified"] else 0.4
            report_score += (rep["severity"] / 10.0) * w
            hazards.append({
                "lat": lat, "lon": lon,
                "type": rep["type"], "severity": rep["severity"],
                "source": "community_report",
            })
        report_score = min(report_score, 1.0)

        # Anomaly score (0–1)
        anomaly_score = 0.0
        for ano in anomalies:
            anomaly_score += ano["severity"] / 10.0
            hazards.append({
                "lat": lat, "lon": lon,
                "type": ano["type"], "severity": ano["severity"],
                "source": "anomaly",
            })
        anomaly_score = min(anomaly_score, 1.0)

        total_pm25    += pm25_norm
        total_no2     += no2_norm
        total_report  += report_score
        total_anomaly += anomaly_score

    n_s = len(sampled) or 1
    avg_pm25    = total_pm25    / n_s
    avg_no2     = total_no2     / n_s
    avg_report  = total_report  / n_s
    avg_anomaly = total_anomaly / n_s

    score = (
        avg_pm25    * weights["pm25"]   +
        avg_no2     * weights["no2"]    +
        avg_report  * weights["report"] +
        avg_anomaly * weights["anomaly"]
    )

    return {
        "score":          round(score, 4),
        "avg_pm25_norm":  round(avg_pm25, 4),
        "avg_no2_norm":   round(avg_no2, 4),
        "avg_report":     round(avg_report, 4),
        "avg_anomaly":    round(avg_anomaly, 4),
        "hazards":        hazards,
        "hazard_count":   len(hazards),
    }


def _risk_label(score: float) -> str:
    if score < 0.15:  return "Low"
    if score < 0.35:  return "Moderate"
    return "High"


def _route_color(rank: int, score: float) -> str:
    if rank == 0:     return "#22c55e"   # safest → green
    if score < 0.35:  return "#eab308"   # moderate → yellow
    return "#ef4444"                      # dangerous → red


# ── Flask route ───────────────────────────────────────────────────────────────

@safe_route_bp.route("/safe-navigate", methods=["POST"])
def safe_navigate():
    """
    POST /api/routes/safe-navigate

    Body:
    {
      "source":           { "lat": 12.91, "lon": 77.61 },
      "destination_id":   5,          // user_saved_locations.id
      "transport_mode":   "driving"   // optional, overrides saved preference
    }
    """
    user_id = get_user_id(request)
    body    = request.get_json(silent=True) or {}

    src = body.get("source", {})
    src_lat = src.get("lat")
    src_lon = src.get("lon")
    dest_id = body.get("destination_id")

    if src_lat is None or src_lon is None:
        return jsonify({"error": "source.lat and source.lon are required"}), 400
    if dest_id is None:
        return jsonify({"error": "destination_id is required"}), 400

    # ── 1. Fetch destination ──────────────────────────────────────────────────
    try:
        with get_db() as conn:
            dest = conn.execute(
                """SELECT id, activity_name, latitude, longitude, address,
                          preferred_transport_mode
                   FROM user_saved_locations
                   WHERE id = ? AND user_id = ?""",
                (dest_id, user_id),
            ).fetchone()
    except Exception as exc:
        return jsonify({"error": f"DB error: {exc}"}), 500

    if not dest:
        return jsonify({"error": "Destination not found or access denied"}), 404

    dest_lat = dest["latitude"]
    dest_lon = dest["longitude"]
    mode     = body.get("transport_mode") or dest["preferred_transport_mode"] or "driving"
    osrm_mode = _OSRM_MODE.get(mode, "driving")

    # ── 2. Fetch alternative routes from OSRM ─────────────────────────────────
    osrm_url = (
        f"{OSRM_BASE}/{osrm_mode}/"
        f"{src_lon},{src_lat};{dest_lon},{dest_lat}"
        f"?overview=full&geometries=geojson&alternatives=true"
    )
    try:
        osrm_resp = http_req.get(osrm_url, timeout=12).json()
    except Exception as exc:
        log.error("OSRM request failed: %s", exc)
        return jsonify({"error": "Routing service unavailable"}), 503

    if osrm_resp.get("code") != "Ok":
        return jsonify({"error": "No routes found", "detail": osrm_resp.get("message")}), 400

    raw_routes = osrm_resp.get("routes", [])
    if not raw_routes:
        return jsonify({"error": "OSRM returned no routes"}), 400

    # ── 3. Get personalised health weights ────────────────────────────────────
    weights = _get_health_weights(user_id)

    # ── 4. Score each route ───────────────────────────────────────────────────
    analyzed = []
    for idx, r in enumerate(raw_routes[:3]):   # cap at 3 alternatives
        coords    = r["geometry"]["coordinates"]   # [[lon, lat], ...]
        waypoints = _interpolate_coords(coords, step_m=100)
        dist_km   = round(r["distance"] / 1000, 2)
        dur_min   = round(r["duration"] / 60, 1)

        scoring = _score_route(waypoints, weights)

        analyzed.append({
            "route_index":    idx,
            "coordinates":    [[lat, lon] for lon, lat in coords],  # → [lat, lon] for Leaflet
            "distance_km":    dist_km,
            "duration_min":   dur_min,
            "exposure_score": scoring["score"],
            "risk_level":     _risk_label(scoring["score"]),
            "hazard_count":   scoring["hazard_count"],
            "hazards":        scoring["hazards"],
            "breakdown": {
                "pm25":    scoring["avg_pm25_norm"],
                "no2":     scoring["avg_no2_norm"],
                "reports": scoring["avg_report"],
                "anomaly": scoring["avg_anomaly"],
            },
        })

    # ── 5. Rank by exposure score (lower = safer) ─────────────────────────────
    analyzed.sort(key=lambda x: x["exposure_score"])

    # Assign labels and colours after ranking
    labels = ["Safest Route", "Balanced Route", "Fastest Route"]
    for rank, route in enumerate(analyzed):
        route["label"]  = labels[rank] if rank < len(labels) else f"Route {rank + 1}"
        route["color"]  = _route_color(rank, route["exposure_score"])
        route["is_recommended"] = (rank == 0)

    # Fastest = shortest duration (may differ from safest)
    fastest_idx = min(range(len(analyzed)), key=lambda i: analyzed[i]["duration_min"])
    if fastest_idx != 0:
        analyzed[fastest_idx]["label"] = "Fastest Route"

    return jsonify({
        "success":     True,
        "destination": {
            "id":      dest["id"],
            "name":    dest["activity_name"],
            "address": dest["address"],
            "lat":     dest_lat,
            "lon":     dest_lon,
        },
        "transport_mode": mode,
        "weights_used":   weights,
        "routes":         analyzed,
    }), 200
