"""
Tests for calculate_aqi() — CPCB AQI sub-index calculation.
Covers: breakpoint boundaries, linear interpolation, CO unit conversion,
        dominant pollutant selection, None/missing value handling.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import calculate_aqi, _sub_index, _aqi_category


# ── _sub_index unit tests ─────────────────────────────────────────────────────

class TestSubIndex:
    """Test the linear interpolation helper for each pollutant."""

    # PM2.5 breakpoints: 0–30→0–50, 30–60→51–100, 60–90→101–200, ...
    def test_pm25_lower_bound(self):
        assert _sub_index("pm25", 0.0) == 0.0

    def test_pm25_upper_good(self):
        assert _sub_index("pm25", 30.0) == 50.0

    def test_pm25_midpoint_satisfactory(self):
        # 30–60 → 51–100; midpoint 45 → 75.5
        result = _sub_index("pm25", 45.0)
        assert abs(result - 75.5) < 0.01

    def test_pm25_upper_satisfactory(self):
        assert _sub_index("pm25", 60.0) == 100.0

    def test_pm25_moderate_range(self):
        # 60–90 → 101–200; at 75 → 150.5
        result = _sub_index("pm25", 75.0)
        assert abs(result - 150.5) < 0.01

    def test_pm25_severe_range(self):
        # 600 µg/m³ falls in the last PM2.5 breakpoint (250–9999 → 401–500)
        result = _sub_index("pm25", 600.0)
        assert 401 <= result <= 500

    # PM10 breakpoints: 0–50→0–50, 50–100→51–100, ...
    def test_pm10_lower_bound(self):
        assert _sub_index("pm10", 0.0) == 0.0

    def test_pm10_good_upper(self):
        assert _sub_index("pm10", 50.0) == 50.0

    def test_pm10_satisfactory_midpoint(self):
        # 50–100 → 51–100; at 75 → 75.5
        result = _sub_index("pm10", 75.0)
        assert abs(result - 75.5) < 0.01

    # NO2 breakpoints: 0–40→0–50, 40–80→51–100, ...
    def test_no2_lower_bound(self):
        assert _sub_index("no2", 0.0) == 0.0

    def test_no2_good_upper(self):
        assert _sub_index("no2", 40.0) == 50.0

    def test_no2_satisfactory_midpoint(self):
        # 40–80 → 51–100; at 60 → 75.5
        result = _sub_index("no2", 60.0)
        assert abs(result - 75.5) < 0.01

    # SO2 breakpoints: 0–40→0–50, 40–80→51–100, 80–380→101–200, ...
    def test_so2_lower_bound(self):
        assert _sub_index("so2", 0.0) == 0.0

    def test_so2_moderate_range(self):
        # 80–380 → 101–200; at 230 → 150.5
        result = _sub_index("so2", 230.0)
        assert abs(result - 150.5) < 0.01

    # CO breakpoints (mg/m³): 0–1→0–50, 1–2→51–100, 2–10→101–200, ...
    def test_co_lower_bound(self):
        assert _sub_index("co", 0.0) == 0.0

    def test_co_good_upper(self):
        assert _sub_index("co", 1.0) == 50.0

    def test_co_satisfactory_midpoint(self):
        # 1–2 → 51–100; at 1.5 → 75.5
        result = _sub_index("co", 1.5)
        assert abs(result - 75.5) < 0.01

    # O3 breakpoints: 0–50→0–50, 50–100→51–100, ...
    def test_o3_lower_bound(self):
        assert _sub_index("o3", 0.0) == 0.0

    def test_o3_good_upper(self):
        assert _sub_index("o3", 50.0) == 50.0


# ── _aqi_category unit tests ──────────────────────────────────────────────────

class TestAqiCategory:
    def test_good(self):
        assert _aqi_category(0) == "Good"
        assert _aqi_category(50) == "Good"

    def test_satisfactory(self):
        assert _aqi_category(51) == "Satisfactory"
        assert _aqi_category(100) == "Satisfactory"

    def test_moderate(self):
        assert _aqi_category(101) == "Moderate"
        assert _aqi_category(200) == "Moderate"

    def test_poor(self):
        assert _aqi_category(201) == "Poor"
        assert _aqi_category(300) == "Poor"

    def test_very_poor(self):
        assert _aqi_category(301) == "Very Poor"
        assert _aqi_category(400) == "Very Poor"

    def test_severe(self):
        assert _aqi_category(401) == "Severe"
        assert _aqi_category(500) == "Severe"


# ── calculate_aqi unit tests ──────────────────────────────────────────────────

class TestCalculateAqi:
    """Test the public calculate_aqi() function with Open-Meteo field names."""

    def test_returns_required_keys(self):
        result = calculate_aqi({"pm2_5": 15.0, "pm10": 25.0})
        assert "aqi" in result
        assert "aqi_category" in result
        assert "dominant_pollutant" in result
        assert "sub_indices" in result

    def test_all_zeros_returns_good(self):
        result = calculate_aqi({
            "pm2_5": 0.0, "pm10": 0.0,
            "nitrogen_dioxide": 0.0, "sulphur_dioxide": 0.0,
            "carbon_monoxide": 0.0, "ozone": 0.0,
        })
        assert result["aqi"] == 0
        assert result["aqi_category"] == "Good"

    def test_pm25_only_good_category(self):
        # PM2.5 = 15 µg/m³ → sub-index = 25 → Good
        result = calculate_aqi({"pm2_5": 15.0})
        assert result["aqi"] == 25
        assert result["aqi_category"] == "Good"
        assert result["dominant_pollutant"] == "PM2.5"

    def test_pm25_500_returns_severe(self):
        # CP-1: AQI of 500 µg/m³ PM2.5 shall return category "Severe"
        result = calculate_aqi({"pm2_5": 500.0})
        assert result["aqi_category"] == "Severe"

    def test_pm25_0_returns_good(self):
        # CP-1: AQI of 0 µg/m³ PM2.5 shall return category "Good"
        result = calculate_aqi({"pm2_5": 0.0})
        assert result["aqi_category"] == "Good"

    def test_overall_aqi_is_max_sub_index(self):
        # CP-1: overall AQI = max sub-index
        # PM2.5=15 → ~25, PM10=200 → ~126 (moderate range)
        result = calculate_aqi({"pm2_5": 15.0, "pm10": 200.0})
        assert result["aqi"] == result["sub_indices"]["pm10"]
        assert result["dominant_pollutant"] == "PM10"

    def test_co_unit_conversion(self):
        # CO from Open-Meteo is in µg/m³; 1000 µg/m³ = 1 mg/m³ → AQI sub-index = 50
        result = calculate_aqi({"carbon_monoxide": 1000.0})
        assert result["sub_indices"]["co"] == 50
        assert result["aqi_category"] == "Good"

    def test_co_2000_ugm3_satisfactory(self):
        # 2000 µg/m³ CO = 2 mg/m³ → upper bound of satisfactory → AQI 100
        result = calculate_aqi({"carbon_monoxide": 2000.0})
        assert result["sub_indices"]["co"] == 100
        assert result["aqi_category"] == "Satisfactory"

    def test_none_values_skipped(self):
        # None values should be skipped without error
        result = calculate_aqi({
            "pm2_5": None,
            "pm10": 75.0,
            "nitrogen_dioxide": None,
        })
        assert "pm25" not in result["sub_indices"]
        assert "pm10" in result["sub_indices"]

    def test_missing_keys_skipped(self):
        # Missing keys should be skipped without error
        result = calculate_aqi({"pm10": 75.0})
        assert "pm25" not in result["sub_indices"]
        assert result["dominant_pollutant"] == "PM10"

    def test_empty_dict_returns_unknown(self):
        result = calculate_aqi({})
        assert result["aqi"] == 0
        assert result["aqi_category"] == "Unknown"
        assert result["dominant_pollutant"] == "N/A"

    def test_dominant_pollutant_is_highest_sub_index(self):
        # NO2=350 µg/m³ → Very Poor range; PM2.5=10 → Good
        result = calculate_aqi({"pm2_5": 10.0, "nitrogen_dioxide": 350.0})
        assert result["dominant_pollutant"] == "NO₂"

    def test_sub_indices_are_integers(self):
        result = calculate_aqi({
            "pm2_5": 45.0, "pm10": 75.0,
            "nitrogen_dioxide": 60.0, "sulphur_dioxide": 200.0,
            "carbon_monoxide": 5000.0, "ozone": 80.0,
        })
        for key, val in result["sub_indices"].items():
            assert isinstance(val, int), f"sub_index for {key} should be int, got {type(val)}"

    def test_aqi_within_0_500(self):
        # AQI should always be in [0, 500]
        result = calculate_aqi({
            "pm2_5": 999.0, "pm10": 999.0,
            "nitrogen_dioxide": 999.0, "sulphur_dioxide": 9999.0,
            "carbon_monoxide": 999999.0, "ozone": 9999.0,
        })
        assert 0 <= result["aqi"] <= 500

    def test_breakpoint_boundary_pm25_30(self):
        # At exactly 30 µg/m³ PM2.5, sub-index should be 50 (top of Good)
        result = calculate_aqi({"pm2_5": 30.0})
        assert result["sub_indices"]["pm25"] == 50
        assert result["aqi_category"] == "Good"

    def test_breakpoint_boundary_pm25_60(self):
        # At exactly 60 µg/m³ PM2.5, sub-index should be 100 (top of Satisfactory)
        result = calculate_aqi({"pm2_5": 60.0})
        assert result["sub_indices"]["pm25"] == 100
        assert result["aqi_category"] == "Satisfactory"

    def test_all_pollutants_together(self):
        # Smoke test with all 6 pollutants
        result = calculate_aqi({
            "pm2_5": 95.0,           # Poor range
            "pm10": 140.0,           # Moderate range
            "nitrogen_dioxide": 42.0,# Satisfactory range
            "sulphur_dioxide": 12.0, # Good range
            "carbon_monoxide": 890.0,# ~0.89 mg/m³ → Good range
            "ozone": 38.0,           # Good range
        })
        # PM2.5=95 → Poor (201–300 range); should dominate
        assert result["dominant_pollutant"] == "PM2.5"
        assert result["aqi_category"] == "Poor"
        assert len(result["sub_indices"]) == 6


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
