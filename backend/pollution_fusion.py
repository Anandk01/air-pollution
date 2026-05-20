"""
pollution_fusion.py
===================
Fuses satellite NO2 data with community reports for a given location.

Weight distribution:
  - Satellite data:     60%
  - Verified reports:   35%
  - Unverified reports:  5%
"""

import math
import logging
from gee_service import GEEService, idw_interpolation
from reports_db import get_active_reports

log = logging.getLogger(__name__)

# Global GEE instance (reuse from app.py)
_gee = None


def set_gee_instance(gee: GEEService):
    global _gee
    _gee = gee


def fuse_pollution_for_segment(lat: float, lon: float, radius_m: int = 500) -> dict:
    """
    Fuse satellite NO2 + community reports for a single point.

    Returns:
        {
            "pollution_score": 0-100,
            "satellite_aqi": float or None,
            "satellite_no2": float or None,
            "reports": [...],
            "verified_count": int,
            "unverified_count": int,
            "dominant_source": "satellite" | "report" | "both" | "none"
        }
    """
    # ── 1. Satellite NO2 via GEE cache ────────────────────────────────────
    sat_no2 = None
    sat_score = 0.0  # 0-100 scale
    sat_available = False

    if _gee:
        try:
            data = _gee.fetch_no2_data(lat, lon)
            if data:
                sat_no2 = idw_interpolation(lon, lat, data["lons"], data["lats"], data["no2"])
                sat_score = _no2_to_score(sat_no2)
                sat_available = True
        except Exception as exc:
            log.warning("Satellite fusion failed: %s", exc)

    # ── 2. Community reports within radius ────────────────────────────────
    radius_deg = radius_m / 111000  # approx meters to degrees
    bbox = (lat - radius_deg, lon - radius_deg, lat + radius_deg, lon + radius_deg)
    all_reports = get_active_reports(bbox)

    # Separate verified vs unverified
    verified = [r for r in all_reports if r.get("verified")]
    unverified = [r for r in all_reports if not r.get("verified")]

    # Average severity from reports (1-5 → 0-100)
    def avg_severity(reports):
        if not reports:
            return 0.0
        return sum(r["severity"] for r in reports) / len(reports) * 20  # scale 1-5 → 20-100

    verified_score = avg_severity(verified)
    unverified_score = avg_severity(unverified)

    # ── 3. Weighted fusion ────────────────────────────────────────────────
    if sat_available and (verified or unverified):
        pollution_score = (
            sat_score * 0.60 +
            verified_score * 0.35 +
            unverified_score * 0.05
        )
        dominant = "both"
    elif sat_available:
        pollution_score = sat_score
        dominant = "satellite"
    elif verified or unverified:
        pollution_score = verified_score * 0.875 + unverified_score * 0.125
        dominant = "report"
    else:
        pollution_score = 0
        dominant = "none"

    return {
        "pollution_score": round(min(max(pollution_score, 0), 100), 1),
        "satellite_aqi": round(sat_score, 1) if sat_available else None,
        "satellite_no2": round(sat_no2, 8) if sat_no2 else None,
        "reports": _slim_reports(all_reports),
        "verified_count": len(verified),
        "unverified_count": len(unverified),
        "dominant_source": dominant,
    }


def _no2_to_score(no2: float) -> float:
    """Convert NO2 mol/m² to a 0-100 pollution score."""
    if no2 <= 0:
        return 0
    # Map typical range [0, 0.0003] → [0, 100]
    return min((no2 / 0.0003) * 100, 100)


def _slim_reports(reports: list) -> list:
    """Return minimal report data for the API response."""
    return [
        {
            "id": r["id"],
            "incident_type": r["incident_type"],
            "lat": r["lat"],
            "lon": r["lon"],
            "severity": r["severity"],
            "description": r.get("description", ""),
            "trust_score": r.get("trust_score", 0.5),
            "verified": bool(r.get("verified")),
            "upvote_count": r.get("upvote_count", 0),
            "reported_at": r.get("reported_at"),
            "expires_at": r.get("expires_at"),
            "duration_type": r.get("duration_type"),
        }
        for r in reports
    ]
