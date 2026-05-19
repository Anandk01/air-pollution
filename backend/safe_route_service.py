"""
safe_route_service.py
=====================
POST /api/routes/safe-navigate

Avoidance strategy:
  1. Fetch all active FIRE/CHEMICAL/WASTE reports from DB
  2. For each hazard near the direct route, try 8 offset directions (N/S/E/W + diagonals)
     at increasing distances, snap each to the nearest road via OSRM /nearest
  3. Route through the snapped road waypoint — guaranteed to be on a real road away from fire
  4. Score all candidate routes, recommend the safest one with no critical hazard
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

OSRM_BASE    = "http://router.project-osrm.org/route/v1"
OSRM_NEAREST = "http://router.project-osrm.org/nearest/v1"

_OSRM_MODE = {
    "driving":   "driving",
    "walking":   "foot",
    "bicycling": "bike",
    "transit":   "driving",
}

_CRITICAL_INCIDENTS = {"FIRE", "CHEMICAL_SPILL", "WASTE_BURNING", "INDUSTRY"}

_DEFAULT_WEIGHTS = {"pm25": 0.35, "no2": 0.20, "report": 0.25, "anomaly": 0.20}

_CONDITION_WEIGHTS = {
    "asthma":        {"pm25": 0.50, "no2": 0.15, "report": 0.20, "anomaly": 0.15},
    "copd":          {"pm25": 0.50, "no2": 0.15, "report": 0.20, "anomaly": 0.15},
    "heart disease": {"pm25": 0.25, "no2": 0.40, "report": 0.20, "anomaly": 0.15},
    "cardiovascular":{"pm25": 0.25, "no2": 0.40, "report": 0.20, "anomaly": 0.15},
    "diabetes":      {"pm25": 0.30, "no2": 0.25, "report": 0.25, "anomaly": 0.20},
    "pregnant":      {"pm25": 0.40, "no2": 0.25, "report": 0.20, "anomaly": 0.15},
    "allergies":     {"pm25": 0.45, "no2": 0.20, "report": 0.20, "anomaly": 0.15},
}


# ── Health weights ────────────────────────────────────────────────────────────

def _get_health_weights(user_id: str) -> dict:
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
        if not conditions:
            return _DEFAULT_WEIGHTS.copy()
        matched = [w for cond, w in _CONDITION_WEIGHTS.items()
                   if any(cond in c for c in conditions)]
        if not matched:
            return _DEFAULT_WEIGHTS.copy()
        keys   = ["pm25", "no2", "report", "anomaly"]
        merged = {k: sum(w[k] for w in matched) / len(matched) for k in keys}
        total  = sum(merged.values())
        merged = {k: round(v / total, 4) for k, v in merged.items()}
        log.info("Weights for %s: %s", user_id, merged)
        return merged
    except Exception as exc:
        log.warning("Could not fetch health weights: %s", exc)
    return _DEFAULT_WEIGHTS.copy()


# ── Pollution fetch ───────────────────────────────────────────────────────────

def _fetch_live_pollution(lat: float, lon: float) -> dict:
    try:
        resp = http_req.get(
            "https://air-quality-api.open-meteo.com/v1/air-quality",
            params={"latitude": lat, "longitude": lon,
                    "current": "pm2_5,nitrogen_dioxide", "timezone": "auto"},
            timeout=6,
        )
        if resp.ok:
            cur = resp.json().get("current", {})
            return {"pm25": float(cur.get("pm2_5") or 0),
                    "no2":  float(cur.get("nitrogen_dioxide") or 0)}
    except Exception:
        pass
    return {"pm25": 0.0, "no2": 0.0}


# ── DB hazard queries ─────────────────────────────────────────────────────────

def _get_reports_near(lat: float, lon: float, radius_m: float = 300) -> list:
    try:
        deg = radius_m / 111_000
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            rows = conn.execute(
                """SELECT severity, verified, incident_type, lat, lon
                   FROM pollution_reports
                   WHERE is_active = 1
                     AND (expires_at IS NULL OR expires_at > ?)
                     AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?""",
                (now, lat - deg, lat + deg, lon - deg, lon + deg),
            ).fetchall()
        result = []
        for r in rows:
            d = haversine(lat, lon, r["lat"], r["lon"])
            if d <= radius_m:
                result.append({
                    "severity": r["severity"], "verified": bool(r["verified"]),
                    "type": r["incident_type"], "dist_m": d,
                    "is_critical": r["incident_type"] in _CRITICAL_INCIDENTS,
                })
        return result
    except Exception as exc:
        log.debug("Reports query failed: %s", exc)
        return []


def _get_anomalies_near(lat: float, lon: float, radius_m: float = 300) -> list:
    try:
        deg = radius_m / 111_000
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            rows = conn.execute(
                """SELECT severity, type, latitude, longitude
                   FROM pollution_anomalies
                   WHERE (expires_at IS NULL OR expires_at > ?)
                     AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?""",
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


def _get_active_critical_hazards() -> list:
    try:
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            rows = conn.execute(
                """SELECT lat, lon, incident_type, severity
                   FROM pollution_reports
                   WHERE is_active = 1
                     AND incident_type IN ('FIRE','CHEMICAL_SPILL','WASTE_BURNING','INDUSTRY')
                     AND (expires_at IS NULL OR expires_at > ?)""",
                (now,)
            ).fetchall()
        return [dict(r) for r in rows]
    except Exception as exc:
        log.warning("Could not fetch critical hazards: %s", exc)
        return []


# ── Route geometry helpers ────────────────────────────────────────────────────

def _route_passes_near_hazard(coords: list, hazards: list, radius_m: float = 400) -> bool:
    for lon, lat in coords:
        for h in hazards:
            if haversine(lat, lon, h["lat"], h["lon"]) <= radius_m:
                return True
    return False


def _interpolate_coords(coords: list, step_m: float = 50) -> list:
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


# ── OSRM helpers ──────────────────────────────────────────────────────────────

def _snap_to_road(osrm_mode: str, lat: float, lon: float):
    """Snap a lat/lon to the nearest road using OSRM /nearest. Returns (lat, lon) or None."""
    try:
        url  = f"{OSRM_NEAREST}/{osrm_mode}/{lon},{lat}?number=1"
        resp = http_req.get(url, timeout=5).json()
        if resp.get("code") == "Ok" and resp.get("waypoints"):
            loc = resp["waypoints"][0]["location"]  # [lon, lat]
            return loc[1], loc[0]
    except Exception as exc:
        log.debug("OSRM nearest failed: %s", exc)
    return None


def _fetch_osrm_route(osrm_mode: str, src_lat, src_lon, dest_lat, dest_lon,
                      via_lat=None, via_lon=None) -> dict | None:
    """Fetch a single best route from OSRM, optionally via a waypoint."""
    if via_lat is not None and via_lon is not None:
        coord_str = f"{src_lon},{src_lat};{via_lon},{via_lat};{dest_lon},{dest_lat}"
    else:
        coord_str = f"{src_lon},{src_lat};{dest_lon},{dest_lat}"
    url = f"{OSRM_BASE}/{osrm_mode}/{coord_str}?overview=full&geometries=geojson"
    try:
        resp = http_req.get(url, timeout=12).json()
        if resp.get("code") == "Ok" and resp.get("routes"):
            return resp["routes"][0]
    except Exception as exc:
        log.error("OSRM route failed: %s", exc)
    return None


def _find_avoidance_route(osrm_mode: str, src_lat, src_lon, dest_lat, dest_lon,
                           hazard_lat, hazard_lon) -> dict | None:
    """
    Try 8 directions × 3 distances around the hazard.
    Snap each candidate to the nearest road.
    Return the first OSRM route that does NOT pass within 350m of the hazard.
    """
    hazard = {"lat": hazard_lat, "lon": hazard_lon}
    # 8 compass directions in degrees
    directions = [0, 45, 90, 135, 180, 225, 270, 315]
    # Try 500m, 800m, 1200m offsets
    offsets_m  = [500, 800, 1200]

    for offset_m in offsets_m:
        for bearing_deg in directions:
            bearing = math.radians(bearing_deg)
            deg_offset = offset_m / 111_000
            via_lat = hazard_lat + math.cos(bearing) * deg_offset
            via_lon = hazard_lon + math.sin(bearing) * deg_offset

            # Snap to nearest real road
            snapped = _snap_to_road(osrm_mode, via_lat, via_lon)
            if not snapped:
                continue
            via_lat, via_lon = snapped

            # Skip if snapped point is still too close to hazard
            if haversine(via_lat, via_lon, hazard_lat, hazard_lon) < 300:
                continue

            route = _fetch_osrm_route(osrm_mode, src_lat, src_lon,
                                       dest_lat, dest_lon, via_lat, via_lon)
            if not route:
                continue

            coords = route["geometry"]["coordinates"]
            if not _route_passes_near_hazard(coords, [hazard], radius_m=350):
                log.info("Found avoidance route via bearing=%d° offset=%dm", bearing_deg, offset_m)
                route["_is_avoidance"] = True
                return route

    log.warning("Could not find avoidance route for hazard at %.5f,%.5f", hazard_lat, hazard_lon)
    return None


# ── Route scoring ─────────────────────────────────────────────────────────────

def _score_route(waypoints: list, weights: dict) -> dict:
    # Poll every ~500m for air quality
    poll_step   = max(1, len(waypoints) // 20)
    poll_points = waypoints[::poll_step]
    total_pm25 = total_no2 = 0.0
    for lat, lon in poll_points:
        p = _fetch_live_pollution(lat, lon)
        total_pm25 += min(p["pm25"] / 300.0, 1.0)
        total_no2  += min(p["no2"]  / 200.0, 1.0)
    n_p      = len(poll_points) or 1
    avg_pm25 = total_pm25 / n_p
    avg_no2  = total_no2  / n_p

    # Check every waypoint for hazards, deduplicate by type+location bucket
    seen_keys       = set()
    unique_hazards  = []
    has_critical    = False
    report_penalty  = 0.0
    anomaly_penalty = 0.0
    last_checked    = None

    for lat, lon in waypoints:
        if last_checked and haversine(lat, lon, *last_checked) < 30:
            continue
        last_checked = (lat, lon)

        for rep in _get_reports_near(lat, lon):
            key = (rep["type"], round(lat, 3), round(lon, 3))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_hazards.append({
                "lat": lat, "lon": lon, "type": rep["type"],
                "severity": rep["severity"], "source": "community_report",
                "critical": rep["is_critical"],
            })
            if rep["is_critical"]:
                has_critical   = True
                report_penalty = 1.0
            else:
                w = 1.0 if rep["verified"] else 0.4
                report_penalty = min(report_penalty + (rep["severity"] / 10.0) * w, 1.0)

        for ano in _get_anomalies_near(lat, lon):
            key = ("ano", ano["type"], round(lat, 3), round(lon, 3))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            unique_hazards.append({
                "lat": lat, "lon": lon, "type": ano["type"],
                "severity": ano["severity"], "source": "anomaly", "critical": False,
            })
            anomaly_penalty = min(anomaly_penalty + ano["severity"] / 10.0, 1.0)

    score = (avg_pm25 * weights["pm25"] + avg_no2 * weights["no2"] +
             report_penalty * weights["report"] + anomaly_penalty * weights["anomaly"])
    if has_critical:
        score = max(score, 0.60)

    return {
        "score": round(score, 4), "avg_pm25_norm": round(avg_pm25, 4),
        "avg_no2_norm": round(avg_no2, 4), "avg_report": round(report_penalty, 4),
        "avg_anomaly": round(anomaly_penalty, 4), "has_critical": has_critical,
        "hazards": unique_hazards, "hazard_count": len(unique_hazards),
    }


def _risk_label(score: float, has_critical: bool) -> str:
    if has_critical or score >= 0.40: return "High"
    if score >= 0.20:                 return "Moderate"
    return "Low"


def _route_color(score: float, has_critical: bool) -> str:
    if has_critical or score >= 0.40: return "#ef4444"
    if score >= 0.20:                 return "#eab308"
    return "#22c55e"


# ── Flask route ───────────────────────────────────────────────────────────────

@safe_route_bp.route("/safe-navigate", methods=["POST"])
def safe_navigate():
    user_id = get_user_id(request)
    body    = request.get_json(silent=True) or {}

    src     = body.get("source", {})
    src_lat = src.get("lat")
    src_lon = src.get("lon")
    dest_id = body.get("destination_id")

    # Fallback to saved home location
    if src_lat is None or src_lon is None:
        try:
            with get_db() as conn:
                home = conn.execute(
                    "SELECT latitude, longitude FROM user_locations WHERE user_id=? AND location_type='home'",
                    (user_id,)
                ).fetchone()
            if home:
                src_lat, src_lon = home["latitude"], home["longitude"]
        except Exception as exc:
            log.warning("Could not fetch home location: %s", exc)

    if src_lat is None or src_lon is None:
        return jsonify({"error": "source.lat/lon required or save a home address in your profile"}), 400
    if dest_id is None:
        return jsonify({"error": "destination_id is required"}), 400

    # Fetch destination
    try:
        with get_db() as conn:
            dest = conn.execute(
                """SELECT id, activity_name, latitude, longitude, address, preferred_transport_mode
                   FROM user_saved_locations WHERE id = ? AND user_id = ?""",
                (dest_id, user_id),
            ).fetchone()
    except Exception as exc:
        return jsonify({"error": f"DB error: {exc}"}), 500

    if not dest:
        return jsonify({"error": "Destination not found or access denied"}), 404

    dest_lat  = dest["latitude"]
    dest_lon  = dest["longitude"]
    mode      = body.get("transport_mode") or dest["preferred_transport_mode"] or "driving"
    osrm_mode = _OSRM_MODE.get(mode, "driving")

    # ── 1. Direct route ───────────────────────────────────────────────────────
    direct = _fetch_osrm_route(osrm_mode, src_lat, src_lon, dest_lat, dest_lon)
    if not direct:
        return jsonify({"error": "Routing service unavailable"}), 503

    # ── 2. Check for critical hazards near the direct route ───────────────────
    critical_hazards = _get_active_critical_hazards()
    direct_coords    = direct["geometry"]["coordinates"]
    nearby_hazards   = [h for h in critical_hazards
                        if _route_passes_near_hazard(direct_coords, [h], radius_m=400)]

    # ── 3. Generate avoidance routes for each nearby hazard ───────────────────
    raw_routes = [direct]
    for hazard in nearby_hazards:
        avoid = _find_avoidance_route(
            osrm_mode, src_lat, src_lon, dest_lat, dest_lon,
            hazard["lat"], hazard["lon"]
        )
        if avoid:
            raw_routes.append(avoid)

    # Deduplicate by rounded distance
    seen_dist, unique_raw = set(), []
    for r in raw_routes:
        d = round(r["distance"], -1)
        if d not in seen_dist:
            seen_dist.add(d)
            unique_raw.append(r)
    raw_routes = unique_raw[:3]

    # ── 4. Score all routes ───────────────────────────────────────────────────
    weights   = _get_health_weights(user_id)
    from threshold_calculator import calculate_personal_threshold
    threshold = calculate_personal_threshold(user_id)

    analyzed = []
    for idx, r in enumerate(raw_routes):
        coords    = r["geometry"]["coordinates"]
        waypoints = _interpolate_coords(coords, step_m=50)
        scoring   = _score_route(waypoints, weights)
        est_pm25  = scoring["avg_pm25_norm"] * 300.0

        analyzed.append({
            "route_index":        idx,
            "coordinates":        [[lat, lon] for lon, lat in coords],
            "distance_km":        round(r["distance"] / 1000, 2),
            "duration_min":       round(r["duration"] / 60, 1),
            "exposure_score":     scoring["score"],
            "risk_level":         _risk_label(scoring["score"], scoring["has_critical"]),
            "has_critical":       scoring["has_critical"],
            "hazard_count":       scoring["hazard_count"],
            "hazards":            scoring["hazards"],
            "est_pm25":           round(est_pm25, 1),
            "personal_threshold": threshold,
            "exceeds_threshold":  scoring["has_critical"] or est_pm25 > threshold,
            "is_avoidance":       bool(r.get("_is_avoidance")),
            "breakdown": {
                "pm25":    scoring["avg_pm25_norm"],
                "no2":     scoring["avg_no2_norm"],
                "reports": scoring["avg_report"],
                "anomaly": scoring["avg_anomaly"],
            },
        })

    # ── 5. Rank and label ─────────────────────────────────────────────────────
    analyzed.sort(key=lambda x: x["exposure_score"])

    safe_routes  = [r for r in analyzed if not r["has_critical"]]
    all_critical = len(safe_routes) == 0
    rec_idx      = analyzed.index(safe_routes[0]) if safe_routes else 0

    labels = ["Safest Route", "Alternative Route", "Fastest Route"]
    for rank, route in enumerate(analyzed):
        route["color"]          = _route_color(route["exposure_score"], route["has_critical"])
        route["label"]          = labels[rank] if rank < len(labels) else f"Route {rank + 1}"
        route["is_recommended"] = (rank == rec_idx)

    # Label fastest among safe routes
    fastest_pool = safe_routes if safe_routes else analyzed
    fastest      = min(fastest_pool, key=lambda r: r["duration_min"])
    if not fastest["is_recommended"]:
        fastest["label"] = "Fastest Safe Route"

    return jsonify({
        "success":           True,
        "all_routes_unsafe": all_critical,
        "destination": {
            "id": dest["id"], "name": dest["activity_name"],
            "address": dest["address"], "lat": dest_lat, "lon": dest_lon,
        },
        "transport_mode":  mode,
        "weights_used":    weights,
        "user_threshold":  threshold,
        "routes":          analyzed,
    }), 200
