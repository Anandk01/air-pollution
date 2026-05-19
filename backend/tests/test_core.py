"""
tests/test_core.py
==================
Unit tests for core backend logic:
  1. _aqi_label         — PM2.5 → AQI category string
  2. _sub_index         — CPCB linear interpolation
  3. _aqi_category      — AQI value → category label
  4. calculate_aqi      — full CPCB AQI from pollutant dict
  5. _detect_col        — column name detection
  6. _round             — safe float rounding
  7. haversine          — great-circle distance
  8. detect_anomaly     — anomaly detection (no model loaded)
  9. classify_cause     — root cause classification
 10. /api/health        — Flask route
 11. /api/upload        — CSV upload validation
 12. /api/analyze-air-quality — AQI calculation endpoint
 13. /api/aqi-calculate       — duplicate AQI endpoint
 14. /api/cities              — cities list

Run:
    cd backend
    .\\venv\\Scripts\\python -m pytest tests/test_core.py -v --tb=short
"""

import io
import os
import sys
import math
import tempfile
import uuid
from unittest.mock import MagicMock
import pytest

# ── Make backend importable ────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# ── Stub ALL heavy/optional modules before any import ────────────────────────
_STUB_MODULES = [
    "ee", "googlemaps", "firebase_admin", "firebase_admin.credentials",
    "firebase_admin.messaging", "google.auth", "google.oauth2",
    "google.oauth2.credentials", "google.genai", "sentence_transformers",
    "faiss", "fitz", "fpdf", "fpdf2",
]
for _mod in _STUB_MODULES:
    sys.modules.setdefault(_mod, MagicMock())

# Stub gee_service so app.py doesn't call ee at module level
_gee_mock = MagicMock()
_gee_mock.GEEService.return_value = MagicMock()
_gee_mock.idw_interpolation.return_value = 0.0
sys.modules["gee_service"] = _gee_mock

# Stub route_pollution_service and safe_route_service blueprints
_route_mock = MagicMock()
_route_mock.route_bp = MagicMock()
_route_mock.route_bp.name = "route"
sys.modules["route_pollution_service"] = _route_mock

_safe_mock = MagicMock()
_safe_mock.safe_route_bp = MagicMock()
_safe_mock.safe_route_bp.name = "safe_route"
sys.modules["safe_route_service"] = _safe_mock

# Stub scheduler
_sched_mock = MagicMock()
_sched_mock.init_scheduler = MagicMock()
sys.modules["scheduler_service"] = _sched_mock

# Stub pollution_fusion
_fusion_mock = MagicMock()
_fusion_mock.set_gee_instance = MagicMock()
sys.modules["pollution_fusion"] = _fusion_mock

# ── Isolate DB before importing app ───────────────────────────────────────────
_TMP_DB = os.path.join(tempfile.gettempdir(), f"test_core_{uuid.uuid4().hex}.db")
import reports_db as _rdb
_rdb.DB_PATH = _TMP_DB
_rdb.run_migrations()

from app import app as flask_app, _aqi_label, _sub_index, _aqi_category, calculate_aqi, _detect_col, _round
from utils.haversine import haversine
from anomaly_detector import detect_anomaly, classify_cause
from datetime import datetime, timezone


# ══════════════════════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture(scope="module")
def client():
    flask_app.config["TESTING"] = True
    with flask_app.test_client() as c:
        yield c


# ══════════════════════════════════════════════════════════════════════════════
# 1. _aqi_label
# ══════════════════════════════════════════════════════════════════════════════

class TestAqiLabel:
    def test_good(self):          assert _aqi_label(0)   == "Good"
    def test_good_boundary(self): assert _aqi_label(30)  == "Good"
    def test_satisfactory(self):  assert _aqi_label(31)  == "Satisfactory"
    def test_satisfactory_boundary(self): assert _aqi_label(60) == "Satisfactory"
    def test_moderate(self):      assert _aqi_label(61)  == "Moderate"
    def test_moderate_boundary(self): assert _aqi_label(90) == "Moderate"
    def test_poor(self):          assert _aqi_label(91)  == "Poor"
    def test_poor_boundary(self): assert _aqi_label(120) == "Poor"
    def test_very_poor(self):     assert _aqi_label(121) == "Very Poor"
    def test_very_poor_boundary(self): assert _aqi_label(250) == "Very Poor"
    def test_severe(self):        assert _aqi_label(251) == "Severe"
    def test_severe_high(self):   assert _aqi_label(999) == "Severe"


# ══════════════════════════════════════════════════════════════════════════════
# 2. _sub_index (CPCB linear interpolation)
# ══════════════════════════════════════════════════════════════════════════════

class TestSubIndex:
    def test_pm25_zero_is_zero(self):
        assert _sub_index("pm25", 0.0) == pytest.approx(0.0, abs=1)

    def test_pm25_midpoint(self):
        # midpoint of (0,30,0,50) → 15 → AQI 25
        assert _sub_index("pm25", 15.0) == pytest.approx(25.0, abs=1)

    def test_pm25_at_boundary(self):
        assert _sub_index("pm25", 30.0) == pytest.approx(50.0, abs=1)

    def test_pm10_zero(self):
        assert _sub_index("pm10", 0.0) == pytest.approx(0.0, abs=1)

    def test_co_unit_conversion_range(self):
        # CO is passed in µg/m³ and scaled by 1e-3 inside calculate_aqi
        # Direct _sub_index call uses mg/m³ already
        result = _sub_index("co", 0.5)   # 0.5 mg/m³ → first bracket
        assert 0 <= result <= 50

    def test_above_all_breakpoints_caps_at_500(self):
        assert _sub_index("pm25", 10000.0) == pytest.approx(500.0, abs=1)

    def test_no2_moderate_range(self):
        result = _sub_index("no2", 100.0)   # falls in (80,180,101,200)
        assert 101 <= result <= 200


# ══════════════════════════════════════════════════════════════════════════════
# 3. _aqi_category
# ══════════════════════════════════════════════════════════════════════════════

class TestAqiCategory:
    def test_good(self):         assert _aqi_category(0)   == "Good"
    def test_good_boundary(self):assert _aqi_category(50)  == "Good"
    def test_satisfactory(self): assert _aqi_category(51)  == "Satisfactory"
    def test_satisfactory_boundary(self): assert _aqi_category(100) == "Satisfactory"
    def test_moderate(self):     assert _aqi_category(101) == "Moderate"
    def test_poor(self):         assert _aqi_category(201) == "Poor"
    def test_very_poor(self):    assert _aqi_category(301) == "Very Poor"
    def test_severe(self):       assert _aqi_category(401) == "Severe"
    def test_severe_high(self):  assert _aqi_category(500) == "Severe"


# ══════════════════════════════════════════════════════════════════════════════
# 4. calculate_aqi
# ══════════════════════════════════════════════════════════════════════════════

class TestCalculateAqi:
    def test_empty_dict_returns_unknown(self):
        result = calculate_aqi({})
        assert result["aqi"] == 0
        assert result["aqi_category"] == "Unknown"
        assert result["dominant_pollutant"] == "N/A"

    def test_pm25_dominant(self):
        result = calculate_aqi({"pm2_5": 200.0, "pm10": 10.0})
        assert result["dominant_pollutant"] == "PM2.5"
        assert result["aqi"] > 100

    def test_co_converted_from_ug_to_mg(self):
        # 1000 µg/m³ CO = 1.0 mg/m³ → sub-index ~50
        result = calculate_aqi({"carbon_monoxide": 1000.0})
        assert result["aqi"] == pytest.approx(50, abs=5)

    def test_none_values_skipped(self):
        result = calculate_aqi({"pm2_5": None, "pm10": 50.0})
        assert result["dominant_pollutant"] == "PM10"

    def test_negative_values_skipped(self):
        result = calculate_aqi({"pm2_5": -10.0, "pm10": 50.0})
        assert result["dominant_pollutant"] == "PM10"

    def test_all_pollutants_returns_max(self):
        pollutants = {
            "pm2_5": 200.0,
            "pm10": 300.0,
            "nitrogen_dioxide": 50.0,
            "sulphur_dioxide": 50.0,
            "carbon_monoxide": 5000.0,
            "ozone": 60.0,
        }
        result = calculate_aqi(pollutants)
        assert result["aqi"] == max(result["sub_indices"].values())

    def test_sub_indices_are_ints(self):
        result = calculate_aqi({"pm2_5": 50.0})
        for v in result["sub_indices"].values():
            assert isinstance(v, int)


# ══════════════════════════════════════════════════════════════════════════════
# 5. _detect_col
# ══════════════════════════════════════════════════════════════════════════════

class TestDetectCol:
    CANDIDATES = ["pm2_5", "pm25", "PM2.5", "value"]

    def test_exact_match(self):
        assert _detect_col(["pm25", "date"], self.CANDIDATES) == "pm25"

    def test_case_insensitive_match(self):
        assert _detect_col(["PM25", "date"], self.CANDIDATES) == "PM25"

    def test_returns_none_when_no_match(self):
        assert _detect_col(["temperature", "humidity"], self.CANDIDATES) is None

    def test_first_candidate_wins(self):
        # pm2_5 comes before pm25 in CANDIDATES
        result = _detect_col(["pm2_5", "pm25"], self.CANDIDATES)
        assert result == "pm2_5"

    def test_empty_columns(self):
        assert _detect_col([], self.CANDIDATES) is None


# ══════════════════════════════════════════════════════════════════════════════
# 6. _round
# ══════════════════════════════════════════════════════════════════════════════

class TestRound:
    def test_normal_value(self):
        assert _round(3.14159, 2) == pytest.approx(3.14)

    def test_nan_returns_none(self):
        assert _round(float("nan")) is None

    def test_inf_returns_none(self):
        assert _round(float("inf")) is None

    def test_neg_inf_returns_none(self):
        assert _round(float("-inf")) is None

    def test_zero(self):
        assert _round(0.0) == pytest.approx(0.0)

    def test_default_precision_4(self):
        result = _round(1.23456789)
        assert result == pytest.approx(1.2346, abs=1e-4)


# ══════════════════════════════════════════════════════════════════════════════
# 7. haversine
# ══════════════════════════════════════════════════════════════════════════════

class TestHaversine:
    def test_same_point_zero(self):
        assert haversine(28.6, 77.2, 28.6, 77.2) == pytest.approx(0.0, abs=1)

    def test_delhi_to_agra(self):
        dist = haversine(28.6139, 77.2090, 27.1767, 78.0081)
        assert 170_000 < dist < 190_000

    def test_symmetry(self):
        d1 = haversine(28.6, 77.2, 19.0, 72.8)
        d2 = haversine(19.0, 72.8, 28.6, 77.2)
        assert d1 == pytest.approx(d2, rel=1e-9)

    def test_returns_float(self):
        assert isinstance(haversine(0, 0, 1, 1), float)

    def test_equator_one_degree(self):
        # 1 degree of longitude at equator ≈ 111,320 m
        dist = haversine(0.0, 0.0, 0.0, 1.0)
        assert 110_000 < dist < 113_000


# ══════════════════════════════════════════════════════════════════════════════
# 8. detect_anomaly (no trained model — fallback path)
# ══════════════════════════════════════════════════════════════════════════════

class TestDetectAnomaly:
    DT = datetime(2023, 11, 12, 14, 0, tzinfo=timezone.utc)  # Diwali 2023

    def test_returns_dict_with_required_keys(self):
        result = detect_anomaly(50.0, self.DT)
        for key in ("is_anomaly", "anomaly_score", "expected_value", "z_score",
                    "cause_label", "cause_confidence", "explanation"):
            assert key in result

    def test_normal_reading_not_anomaly(self):
        # Without a trained model, z_score check uses fallback
        result = detect_anomaly(50.0, self.DT)
        assert isinstance(result["is_anomaly"], bool)

    def test_is_anomaly_is_bool(self):
        result = detect_anomaly(500.0, self.DT)
        assert isinstance(result["is_anomaly"], bool)

    def test_anomaly_score_is_float(self):
        result = detect_anomaly(100.0, self.DT)
        assert isinstance(result["anomaly_score"], float)

    def test_extra_fields_accepted(self):
        extra = {"PM10": 200, "NO2": 90, "wind_speed": 1.0, "humidity": 85}
        result = detect_anomaly(300.0, self.DT, extra)
        assert "is_anomaly" in result


# ══════════════════════════════════════════════════════════════════════════════
# 9. classify_cause
# ══════════════════════════════════════════════════════════════════════════════

class TestClassifyCause:
    def test_festival_date_returns_festival(self):
        dt = datetime(2023, 11, 12, 20, 0, tzinfo=timezone.utc)  # Diwali
        result = classify_cause(350.0, dt, {})
        assert result["cause_label"] == "FESTIVAL"
        assert result["cause_confidence"] >= 0.9

    def test_traffic_hour_returns_traffic(self):
        dt = datetime(2024, 6, 15, 9, 0, tzinfo=timezone.utc)  # morning rush
        result = classify_cause(200.0, dt, {"NO2": 100})
        assert result["cause_label"] == "TRAFFIC"

    def test_weather_trapped_conditions(self):
        dt = datetime(2024, 3, 10, 15, 0, tzinfo=timezone.utc)
        extra = {"wind_speed": 0.5, "humidity": 90}
        result = classify_cause(200.0, dt, extra)
        assert result["cause_label"] == "WEATHER_TRAPPED"
        assert result["cause_confidence"] == pytest.approx(0.80, abs=0.01)

    def test_crop_burning_october(self):
        dt = datetime(2024, 10, 20, 12, 0, tzinfo=timezone.utc)
        extra = {"PM10": 300, "wind_direction": 315}
        result = classify_cause(250.0, dt, extra)
        assert result["cause_label"] == "CROP_BURNING"

    def test_unknown_cause_when_no_signals(self):
        dt = datetime(2024, 5, 5, 3, 0, tzinfo=timezone.utc)  # no signals
        result = classify_cause(200.0, dt, {})
        assert result["cause_label"] == "UNKNOWN"
        assert "explanation" in result

    def test_result_has_required_keys(self):
        dt = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
        result = classify_cause(100.0, dt, {})
        assert "cause_label" in result
        assert "cause_confidence" in result
        assert "explanation" in result

    def test_confidence_between_0_and_1(self):
        dt = datetime(2023, 11, 12, 20, 0, tzinfo=timezone.utc)
        result = classify_cause(350.0, dt, {})
        assert 0.0 <= result["cause_confidence"] <= 1.0


# ══════════════════════════════════════════════════════════════════════════════
# 10. /api/health
# ══════════════════════════════════════════════════════════════════════════════

class TestHealthEndpoint:
    def test_returns_200(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200

    def test_returns_ok_status(self, client):
        body = client.get("/api/health").get_json()
        assert body["status"] == "ok"


# ══════════════════════════════════════════════════════════════════════════════
# 11. /api/upload
# ══════════════════════════════════════════════════════════════════════════════

def _make_csv(content: str) -> tuple:
    return (io.BytesIO(content.encode()), "test.csv")

class TestUploadEndpoint:
    def test_no_file_returns_400(self, client):
        res = client.post("/api/upload", data={})
        assert res.status_code == 400

    def test_non_csv_returns_400(self, client):
        data = {"file": (io.BytesIO(b"data"), "test.txt")}
        res = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert res.status_code == 400

    def test_empty_csv_returns_400(self, client):
        data = {"file": (io.BytesIO(b""), "empty.csv")}
        res = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert res.status_code == 400

    def test_valid_csv_returns_200(self, client):
        csv_content = "datetime,pm25\n2024-01-01T00:00:00Z,45.0\n2024-01-01T01:00:00Z,50.0\n"
        data = {"file": (io.BytesIO(csv_content.encode()), "valid.csv")}
        res = client.post("/api/upload", data=data, content_type="multipart/form-data")
        assert res.status_code == 200
        body = res.get_json()
        assert body["success"] is True
        assert body["rows"] == 2

    def test_valid_csv_returns_columns(self, client):
        csv_content = "datetime,pm25,temperature\n2024-01-01T00:00:00Z,45.0,25.0\n"
        data = {"file": (io.BytesIO(csv_content.encode()), "cols.csv")}
        res = client.post("/api/upload", data=data, content_type="multipart/form-data")
        body = res.get_json()
        assert "columns" in body
        assert "datetime" in body["columns"]


# ══════════════════════════════════════════════════════════════════════════════
# 12. /api/analyze-air-quality
# ══════════════════════════════════════════════════════════════════════════════

VALID_POLLUTANTS = {"pm25": 50, "pm10": 80, "no2": 40, "so2": 20, "co": 1.0, "o3": 60}

class TestAnalyzeAirQuality:
    def test_valid_input_returns_200(self, client):
        res = client.post("/api/analyze-air-quality", json=VALID_POLLUTANTS)
        assert res.status_code == 200
        body = res.get_json()
        assert body["success"] is True

    def test_response_has_required_fields(self, client):
        body = client.post("/api/analyze-air-quality", json=VALID_POLLUTANTS).get_json()
        for field in ("aqi", "category", "dominant_pollutant", "health_advice", "sub_indices"):
            assert field in body

    def test_missing_field_returns_400(self, client):
        bad = {k: v for k, v in VALID_POLLUTANTS.items() if k != "pm25"}
        res = client.post("/api/analyze-air-quality", json=bad)
        assert res.status_code == 400

    def test_negative_value_returns_400(self, client):
        bad = {**VALID_POLLUTANTS, "pm25": -5}
        res = client.post("/api/analyze-air-quality", json=bad)
        assert res.status_code == 400

    def test_string_value_returns_400(self, client):
        bad = {**VALID_POLLUTANTS, "pm25": "high"}
        res = client.post("/api/analyze-air-quality", json=bad)
        assert res.status_code == 400

    def test_empty_body_returns_400(self, client):
        res = client.post("/api/analyze-air-quality", data="", content_type="application/json")
        assert res.status_code == 400

    def test_aqi_is_integer(self, client):
        body = client.post("/api/analyze-air-quality", json=VALID_POLLUTANTS).get_json()
        assert isinstance(body["aqi"], int)

    def test_high_pm25_gives_high_aqi(self, client):
        high = {**VALID_POLLUTANTS, "pm25": 300}
        body = client.post("/api/analyze-air-quality", json=high).get_json()
        assert body["aqi"] >= 300

    def test_zero_values_give_good_category(self, client):
        zero = {k: 0 for k in VALID_POLLUTANTS}
        body = client.post("/api/analyze-air-quality", json=zero).get_json()
        assert body["category"] == "Good"


# ══════════════════════════════════════════════════════════════════════════════
# 13. /api/aqi-calculate
# ══════════════════════════════════════════════════════════════════════════════

class TestAqiCalculate:
    def test_valid_returns_200(self, client):
        res = client.post("/api/aqi-calculate", json=VALID_POLLUTANTS)
        assert res.status_code == 200
        assert res.get_json()["success"] is True

    def test_missing_field_returns_400(self, client):
        bad = {k: v for k, v in VALID_POLLUTANTS.items() if k != "o3"}
        res = client.post("/api/aqi-calculate", json=bad)
        assert res.status_code == 400

    def test_dominant_pollutant_is_string(self, client):
        body = client.post("/api/aqi-calculate", json=VALID_POLLUTANTS).get_json()
        assert isinstance(body["dominant_pollutant"], str)

    def test_sub_indices_present(self, client):
        body = client.post("/api/aqi-calculate", json=VALID_POLLUTANTS).get_json()
        assert isinstance(body["sub_indices"], dict)
        assert len(body["sub_indices"]) > 0


# ══════════════════════════════════════════════════════════════════════════════
# 14. /api/cities
# ══════════════════════════════════════════════════════════════════════════════

class TestCitiesEndpoint:
    def test_returns_200(self, client):
        assert client.get("/api/cities").status_code == 200

    def test_returns_list(self, client):
        body = client.get("/api/cities").get_json()
        assert isinstance(body, list)
        assert len(body) > 0

    def test_each_city_has_required_fields(self, client):
        cities = client.get("/api/cities").get_json()
        for city in cities:
            assert "name" in city
            assert "lat" in city
            assert "lon" in city

    def test_coordinates_within_india_bounds(self, client):
        cities = client.get("/api/cities").get_json()
        for city in cities:
            assert 8 <= city["lat"] <= 37,  f"{city['name']} lat out of range"
            assert 68 <= city["lon"] <= 97, f"{city['name']} lon out of range"

    def test_delhi_is_present(self, client):
        cities = client.get("/api/cities").get_json()
        names = [c["name"] for c in cities]
        assert "Delhi" in names
