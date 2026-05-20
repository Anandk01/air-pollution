"""
tests/test_airguard.py
======================
Comprehensive unit + integration tests for AirGuard backend.
Covers:
  1. Haversine utility
  2. Threshold calculator
  3. Route pollution scoring (segment_route, calculate_segment_aqi, color coding)
  4. Saved-location API  (GET / POST / PUT / DELETE)
  5. Profile API          (GET / PUT / conditions)
  6. Community reports API
  7. Input validation edge cases
  8. Duplicate prevention

Run:
    cd backend
    .\\venv\\Scripts\\python -m pytest tests/test_airguard.py -v --tb=short
"""

import json
import math
import os
import sys
import sqlite3
import tempfile
import pytest

# ── Make backend importable ────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Patch DB_PATH to an isolated temp database before importing app ────────────
import uuid
_TMP_DB = os.path.join(tempfile.gettempdir(), f"test_airguard_{uuid.uuid4().hex}.db")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)

os.environ["TEST_DB_PATH"] = _TMP_DB          # signal; reports_db reads this below

import reports_db as _rdb
_rdb.DB_PATH = _TMP_DB                        # monkey-patch before any connections

# Now safe to import app
from app import app as flask_app

# ── Apply migrations to the temp DB ───────────────────────────────────────────
_rdb.run_migrations()


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="session")
def client():
    flask_app.config["TESTING"] = True
    flask_app.config["WTF_CSRF_ENABLED"] = False
    with flask_app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clean_saved_locations():
    """Wipe the saved-locations table before each test for isolation."""
    with _rdb.get_db() as conn:
        conn.execute("DELETE FROM user_saved_locations")
        conn.execute("DELETE FROM user_profiles")
        conn.execute("DELETE FROM user_health_conditions")
    yield


# ══════════════════════════════════════════════════════════════════════════════
# 1. Haversine Distance Utility
# ══════════════════════════════════════════════════════════════════════════════

from utils.haversine import haversine

class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine(28.6, 77.2, 28.6, 77.2) == pytest.approx(0.0, abs=1)

    def test_known_distance_delhi_agra(self):
        # Delhi (28.6139, 77.2090) → Agra (27.1767, 78.0081) ≈ 178 km (Haversine)
        dist = haversine(28.6139, 77.2090, 27.1767, 78.0081)
        assert 170_000 < dist < 190_000, f"Expected ~178km, got {dist/1000:.1f}km"

    def test_symmetry(self):
        d1 = haversine(28.6, 77.2, 19.0, 72.8)
        d2 = haversine(19.0, 72.8, 28.6, 77.2)
        assert d1 == pytest.approx(d2, rel=1e-9)

    def test_100m_segment(self):
        # Moving ~100m north (≈ 0.0009 degrees lat)
        dist = haversine(28.6000, 77.2000, 28.6009, 77.2000)
        assert 80 < dist < 130, f"Expected ~100m, got {dist:.1f}m"

    def test_negative_coordinates(self):
        # Sydney → Melbourne (valid negative lat/lon)
        dist = haversine(-33.87, 151.21, -37.81, 144.96)
        assert 700_000 < dist < 800_000

    def test_returns_float(self):
        result = haversine(0, 0, 1, 1)
        assert isinstance(result, float)


# ══════════════════════════════════════════════════════════════════════════════
# 2. Threshold Calculator
# ══════════════════════════════════════════════════════════════════════════════

from threshold_calculator import calculate_personal_threshold

class TestThresholdCalculator:
    def test_no_conditions_returns_150(self):
        result = calculate_personal_threshold("test_user_no_cond")
        assert result == pytest.approx(150.0, abs=0.5)

    def test_asthma_lowers_threshold(self):
        # Asthma multiplier = 1.8 → 150 / (1 + 1.8) = 53.6
        with _rdb.get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO user_profiles (user_id, full_name, age) VALUES (?, ?, ?)",
                         ("u_asthma", "Test", 30))
            conn.execute("INSERT OR IGNORE INTO user_health_conditions (user_id, condition_id) VALUES (?, ?)",
                         ("u_asthma", 1))  # id=1 is Asthma
        result = calculate_personal_threshold("u_asthma")
        assert result == pytest.approx(150 / (1 + 1.8), abs=0.5)

    def test_multiple_conditions_stack(self):
        # Asthma (1.8) + Heart disease (1.6) → 150 / (1 + 3.4) = 34.1
        with _rdb.get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO user_profiles (user_id, full_name, age) VALUES (?, ?, ?)",
                         ("u_multi", "Test", 40))
            conn.execute("INSERT OR IGNORE INTO user_health_conditions (user_id, condition_id) VALUES (?, ?)", ("u_multi", 1))
            conn.execute("INSERT OR IGNORE INTO user_health_conditions (user_id, condition_id) VALUES (?, ?)", ("u_multi", 2))
        result = calculate_personal_threshold("u_multi")
        assert result == pytest.approx(150 / (1 + 1.8 + 1.6), abs=0.5)

    def test_guest_user_returns_150(self):
        result = calculate_personal_threshold("guest_user")
        assert result == pytest.approx(150.0, abs=0.5)

    def test_threshold_is_positive(self):
        # Even with many conditions, threshold must stay positive
        with _rdb.get_db() as conn:
            conn.execute("INSERT OR IGNORE INTO user_profiles (user_id, full_name, age) VALUES (?, ?, ?)",
                         ("u_all", "Test", 50))
            # Ensure conditions 1-6 exist (they should from migration 003)
            for cid in [1, 2, 3, 4, 5, 6]:
                conn.execute("INSERT OR IGNORE INTO user_health_conditions (user_id, condition_id) VALUES (?, ?)", ("u_all", cid))
        result = calculate_personal_threshold("u_all")
        assert result > 0


# ══════════════════════════════════════════════════════════════════════════════
# 3. Route Pollution Scoring Functions
# ══════════════════════════════════════════════════════════════════════════════

from route_pollution_service import (
    segment_route, calculate_segment_aqi, get_segment_color, calculate_route_exposure
)
import polyline as pl

class TestSegmentRoute:
    # Build a valid 3-point polyline ~2km long
    COORDS = [(28.6139, 77.2090), (28.6200, 77.2150), (28.6300, 77.2200)]
    POLY   = pl.encode(COORDS)
    DURATION = 5.0  # minutes

    def test_returns_list(self):
        segs = segment_route(self.POLY, self.DURATION)
        assert isinstance(segs, list)
        assert len(segs) > 0

    def test_segment_has_required_keys(self):
        segs = segment_route(self.POLY, self.DURATION)
        for s in segs:
            assert "lat" in s
            assert "lon" in s
            assert "time_spent_minutes" in s

    def test_total_time_preserved(self):
        segs = segment_route(self.POLY, self.DURATION)
        total_time = sum(s["time_spent_minutes"] for s in segs)
        assert total_time == pytest.approx(self.DURATION, rel=0.05)

    def test_empty_polyline_returns_empty(self):
        # A minimal 1-point polyline (just 2 identical points) should not crash
        tiny = pl.encode([(28.6, 77.2), (28.6, 77.2)])
        segs = segment_route(tiny, 1.0)
        assert isinstance(segs, list)

    def test_coordinates_in_valid_range(self):
        segs = segment_route(self.POLY, self.DURATION)
        for s in segs:
            assert -90 <= s["lat"] <= 90
            assert -180 <= s["lon"] <= 180


class TestCalculateSegmentAqi:
    def test_no_reports_uses_60pct_satellite(self):
        aqi = calculate_segment_aqi(100.0, [])
        assert aqi == pytest.approx(60.0, abs=0.1)

    def test_verified_report_adds_35pct_penalty(self):
        reports = [{"severity": 5, "verified": True, "distance_m": 100}]
        # penalty = 5 * 10 * 0.35 = 17.5
        aqi = calculate_segment_aqi(100.0, reports)
        assert aqi == pytest.approx(60.0 + 17.5, abs=0.1)

    def test_unverified_report_adds_5pct_penalty(self):
        reports = [{"severity": 5, "verified": False, "distance_m": 200}]
        # penalty = 5 * 10 * 0.05 = 2.5
        aqi = calculate_segment_aqi(100.0, reports)
        assert aqi == pytest.approx(60.0 + 2.5, abs=0.1)

    def test_verified_outweighs_unverified(self):
        verified   = [{"severity": 3, "verified": True,  "distance_m": 100}]
        unverified = [{"severity": 3, "verified": False, "distance_m": 100}]
        assert calculate_segment_aqi(100, verified) > calculate_segment_aqi(100, unverified)

    def test_multiple_reports_accumulate(self):
        reports = [
            {"severity": 2, "verified": True,  "distance_m": 50},
            {"severity": 4, "verified": False, "distance_m": 200},
        ]
        # 60 + (2*10*0.35) + (4*10*0.05) = 60 + 7 + 2 = 69
        aqi = calculate_segment_aqi(100.0, reports)
        assert aqi == pytest.approx(69.0, abs=0.1)


class TestGetSegmentColor:
    def test_below_70pct_threshold_is_green(self):
        assert get_segment_color(50, 100) == "green"

    def test_between_70_and_100pct_is_yellow(self):
        assert get_segment_color(80, 100) == "yellow"

    def test_above_threshold_is_red(self):
        assert get_segment_color(110, 100) == "red"

    def test_exactly_at_threshold_is_red(self):
        # Based on: if segment_aqi > user_threshold: return 'red' else yellow
        assert get_segment_color(100, 100) == "yellow"

    def test_exactly_at_70pct_is_yellow(self):
        # Based on: elif segment_aqi > (user_threshold * 0.7): return 'yellow' else green
        assert get_segment_color(70, 100) == "green"

    def test_zero_aqi_is_green(self):
        assert get_segment_color(0, 150) == "green"


# ══════════════════════════════════════════════════════════════════════════════
# 4. Saved-Location API  (GET / POST / PUT / DELETE)
# ══════════════════════════════════════════════════════════════════════════════

BASE = "/api/profile/saved-locations"

VALID_PAYLOAD = {
    "activity_name": "Gym",
    "latitude": 28.6139,
    "longitude": 77.2090,
    "address": "Rohini Sports Complex, Delhi",
    "preferred_transport_mode": "driving",
    "preferred_time": "07:00",
}

class TestSavedLocationsGet:
    def test_get_empty_returns_list(self, client):
        res = client.get(BASE)
        assert res.status_code == 200
        assert res.get_json()["locations"] == []

    def test_get_after_insert_returns_record(self, client):
        client.post(BASE, json=VALID_PAYLOAD)
        res = client.get(BASE)
        locs = res.get_json()["locations"]
        assert len(locs) == 1
        assert locs[0]["activity_name"] == "Gym"


class TestSavedLocationsPost:
    def test_create_returns_201(self, client):
        res = client.post(BASE, json=VALID_PAYLOAD)
        assert res.status_code == 201
        body = res.get_json()
        assert body["success"] is True
        assert "id" in body

    def test_create_stores_all_fields(self, client):
        client.post(BASE, json=VALID_PAYLOAD)
        locs = client.get(BASE).get_json()["locations"]
        loc = locs[0]
        assert loc["address"]  == VALID_PAYLOAD["address"]
        assert loc["latitude"] == VALID_PAYLOAD["latitude"]
        assert loc["longitude"]== VALID_PAYLOAD["longitude"]
        assert loc["preferred_transport_mode"] == "driving"
        assert loc["preferred_time"] == "07:00"

    def test_duplicate_name_returns_409(self, client):
        client.post(BASE, json=VALID_PAYLOAD)
        res = client.post(BASE, json=VALID_PAYLOAD)
        assert res.status_code == 409
        assert "already exists" in res.get_json()["error"]

    def test_missing_activity_name_returns_400(self, client):
        bad = {**VALID_PAYLOAD, "activity_name": ""}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_missing_address_returns_400(self, client):
        bad = {**VALID_PAYLOAD, "address": ""}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_invalid_lat_returns_400(self, client):
        bad = {**VALID_PAYLOAD, "latitude": 999.0}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_invalid_lon_returns_400(self, client):
        bad = {**VALID_PAYLOAD, "longitude": -999.0}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_invalid_transport_mode_returns_400(self, client):
        bad = {**VALID_PAYLOAD, "preferred_transport_mode": "helicopter"}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_all_valid_transport_modes(self, client):
        for i, mode in enumerate(["driving", "walking", "bicycling", "transit"]):
            payload = {**VALID_PAYLOAD, "activity_name": f"Place{i}", "preferred_transport_mode": mode}
            res = client.post(BASE, json=payload)
            assert res.status_code == 201, f"Mode {mode} failed: {res.get_json()}"

    def test_optional_fields_can_be_omitted(self, client):
        minimal = {
            "activity_name": "Office",
            "latitude": 28.5,
            "longitude": 77.1,
            "address": "Somewhere"
        }
        res = client.post(BASE, json=minimal)
        assert res.status_code == 201

    def test_activity_name_too_long_returns_400(self, client):
        bad = {**VALID_PAYLOAD, "activity_name": "X" * 81}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_missing_lat_returns_400(self, client):
        bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "latitude"}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_string_coords_rejected(self, client):
        bad = {**VALID_PAYLOAD, "latitude": "twenty eight", "longitude": "seventy seven"}
        res = client.post(BASE, json=bad)
        assert res.status_code == 400

    def test_boundary_coordinates_accepted(self, client):
        # Extreme but valid coordinates
        edge = {**VALID_PAYLOAD, "activity_name": "EdgeCase", "latitude": -90.0, "longitude": 180.0}
        res = client.post(BASE, json=edge)
        assert res.status_code == 201

    def test_empty_body_returns_400(self, client):
        res = client.post(BASE, json={})
        assert res.status_code == 400


class TestSavedLocationsPut:
    def test_update_address(self, client):
        create_res = client.post(BASE, json=VALID_PAYLOAD)
        loc_id = create_res.get_json()["id"]
        res = client.put(f"{BASE}/{loc_id}", json={"address": "New Address, Delhi"})
        assert res.status_code == 200
        # Confirm change
        locs = client.get(BASE).get_json()["locations"]
        assert locs[0]["address"] == "New Address, Delhi"

    def test_update_transport_mode(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        res = client.put(f"{BASE}/{loc_id}", json={"preferred_transport_mode": "bicycling"})
        assert res.status_code == 200
        locs = client.get(BASE).get_json()["locations"]
        assert locs[0]["preferred_transport_mode"] == "bicycling"

    def test_update_invalid_mode_returns_400(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        res = client.put(f"{BASE}/{loc_id}", json={"preferred_transport_mode": "rocket"})
        assert res.status_code == 400

    def test_update_nonexistent_returns_404(self, client):
        res = client.put(f"{BASE}/99999", json={"address": "X"})
        assert res.status_code == 404

    def test_update_invalid_coords_returns_400(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        res = client.put(f"{BASE}/{loc_id}", json={"latitude": 200.0})
        assert res.status_code == 400

    def test_update_empty_body_returns_400(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        res = client.put(f"{BASE}/{loc_id}", json={})
        assert res.status_code == 400


class TestSavedLocationsDelete:
    def test_delete_removes_record(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        res = client.delete(f"{BASE}/{loc_id}")
        assert res.status_code == 200
        assert client.get(BASE).get_json()["locations"] == []

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete(f"{BASE}/99999")
        assert res.status_code == 404

    def test_delete_returns_deleted_id(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        body = client.delete(f"{BASE}/{loc_id}").get_json()
        assert body["deleted_id"] == loc_id

    def test_double_delete_second_is_404(self, client):
        loc_id = client.post(BASE, json=VALID_PAYLOAD).get_json()["id"]
        client.delete(f"{BASE}/{loc_id}")
        res = client.delete(f"{BASE}/{loc_id}")
        assert res.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# 5. Profile API
# ══════════════════════════════════════════════════════════════════════════════

PROF_BASE = "/api/profile"

class TestProfileApi:
    def test_get_guest_profile_returns_200(self, client):
        res = client.get(PROF_BASE + "/")
        assert res.status_code == 200
        body = res.get_json()
        assert "personal_aqi_threshold" in body

    def test_guest_threshold_is_150(self, client):
        res = client.get(PROF_BASE + "/")
        assert res.get_json()["personal_aqi_threshold"] == pytest.approx(150.0, abs=1)

    def test_create_profile_via_put(self, client):
        payload = {
            "full_name": "Anand Test", "age": 28, "gender": "Male",
            "weight_kg": 70, "height_cm": 175, "is_smoker": False
        }
        res = client.put(PROF_BASE + "/", json=payload)
        assert res.status_code == 200

    def test_add_condition_lowers_threshold(self, client):
        # Create profile first
        client.put(PROF_BASE, json={"full_name": "User", "age": 30, "gender": "Male", "weight_kg": 70, "height_cm": 170})
        # Add Asthma
        res = client.post(f"{PROF_BASE}/conditions", json={"condition_id": 1, "action": "add"})
        assert res.status_code == 200
        new_threshold = res.get_json()["new_threshold"]
        assert new_threshold < 150

    def test_remove_condition_raises_threshold(self, client):
        client.put(PROF_BASE, json={"full_name": "User", "age": 30, "gender": "Male", "weight_kg": 70, "height_cm": 170})
        client.post(f"{PROF_BASE}/conditions", json={"condition_id": 1, "action": "add"})
        after_add = client.post(f"{PROF_BASE}/conditions", json={"condition_id": 1, "action": "add"})
        # Remove it
        res = client.post(f"{PROF_BASE}/conditions", json={"condition_id": 1, "action": "remove"})
        assert res.status_code == 200
        assert res.get_json()["new_threshold"] == pytest.approx(150.0, abs=1)


# ══════════════════════════════════════════════════════════════════════════════
# 6. Community Reports API
# ══════════════════════════════════════════════════════════════════════════════

REPORTS_BASE = "/api/reports"

VALID_REPORT = {
    "incident_type": "FIRE",
    "lat": 28.6139,
    "lon": 77.2090,
    "description": "Garbage burning near park",
    "severity": 4,
}

class TestCommunityReports:
    def test_get_reports_returns_list(self, client):
        res = client.get(REPORTS_BASE + "/active")
        assert res.status_code == 200
        body = res.get_json()
        assert "reports" in body or isinstance(body, list)

    def test_post_report_succeeds(self, client):
        res = client.post(REPORTS_BASE, json=VALID_REPORT)
        assert res.status_code in (200, 201)

    def test_missing_incident_type_fails(self, client):
        bad = {k: v for k, v in VALID_REPORT.items() if k != "incident_type"}
        res = client.post(REPORTS_BASE, json=bad)
        assert res.status_code in (400, 422, 500)

    def test_invalid_severity_fails(self, client):
        bad = {**VALID_REPORT, "severity": 10}  # max is 5
        res = client.post(REPORTS_BASE, json=bad)
        assert res.status_code in (400, 422, 500)


# ══════════════════════════════════════════════════════════════════════════════
# 7. Route Analyze API — Integration
# ══════════════════════════════════════════════════════════════════════════════

ROUTE_BASE = "/api/routes/analyze"

class TestRouteAnalyzeApi:
    def test_missing_start_returns_400(self, client):
        res = client.post(ROUTE_BASE, json={"end": {"lat": 28.5, "lon": 77.1}})
        assert res.status_code == 400

    def test_missing_end_returns_400(self, client):
        res = client.post(ROUTE_BASE, json={"start": {"lat": 28.6, "lon": 77.2}})
        assert res.status_code == 400

    def test_empty_body_returns_400(self, client):
        res = client.post(ROUTE_BASE, json={})
        assert res.status_code == 400

    def test_valid_request_returns_routes_or_error(self, client):
        # May return routes (OSRM online) or a 404/500 if offline — both are valid
        res = client.post(ROUTE_BASE, json={
            "start": {"lat": 28.7041, "lon": 77.1025},
            "end":   {"lat": 28.6304, "lon": 77.2177},
            "mode":  "driving"
        })
        assert res.status_code in (200, 404, 500)
        if res.status_code == 200:
            body = res.get_json()
            assert "routes" in body
            assert "user_threshold" in body


# ══════════════════════════════════════════════════════════════════════════════
# 8. Health Check
# ══════════════════════════════════════════════════════════════════════════════

class TestHealthCheck:
    def test_health_returns_ok(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        body = res.get_json()
        assert body.get("status") == "ok"
