"""
Unit tests for calculate_aqi() — all 6 CPCB AQI categories.

Covers:
  - PM2.5 values in each of the 6 category ranges
  - PM10 values in each of the 6 category ranges
  - Boundary values between categories

CPCB AQI categories:
  Good         AQI   0–50    PM2.5  0–30 µg/m³   PM10   0–50 µg/m³
  Satisfactory AQI  51–100   PM2.5 31–60 µg/m³   PM10  51–100 µg/m³
  Moderate     AQI 101–200   PM2.5 61–90 µg/m³   PM10 101–250 µg/m³
  Poor         AQI 201–300   PM2.5 91–120 µg/m³  PM10 251–350 µg/m³
  Very Poor    AQI 301–400   PM2.5 121–250 µg/m³ PM10 351–430 µg/m³
  Severe       AQI 401–500   PM2.5 >250 µg/m³    PM10 >430 µg/m³

Run with:
  pytest backend/test_aqi.py -v
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import calculate_aqi


# ─────────────────────────────────────────────────────────────────────────────
# PM2.5 — all 6 categories
# ─────────────────────────────────────────────────────────────────────────────

class TestPM25Categories:
    """PM2.5 values should map to the correct AQI category."""

    def test_pm25_good_lower_bound(self):
        """PM2.5 = 0 µg/m³ → Good"""
        result = calculate_aqi({"pm2_5": 0.0})
        assert result["aqi_category"] == "Good"

    def test_pm25_good_midpoint(self):
        """PM2.5 = 15 µg/m³ → Good"""
        result = calculate_aqi({"pm2_5": 15.0})
        assert result["aqi_category"] == "Good"

    def test_pm25_good_upper_bound(self):
        """PM2.5 = 30 µg/m³ → Good (boundary)"""
        result = calculate_aqi({"pm2_5": 30.0})
        assert result["aqi_category"] == "Good"

    def test_pm25_satisfactory_lower_bound(self):
        """PM2.5 just above 30 µg/m³ → Satisfactory"""
        result = calculate_aqi({"pm2_5": 31.0})
        assert result["aqi_category"] == "Satisfactory"

    def test_pm25_satisfactory_midpoint(self):
        """PM2.5 = 45 µg/m³ → Satisfactory"""
        result = calculate_aqi({"pm2_5": 45.0})
        assert result["aqi_category"] == "Satisfactory"

    def test_pm25_satisfactory_upper_bound(self):
        """PM2.5 = 60 µg/m³ → Satisfactory (boundary)"""
        result = calculate_aqi({"pm2_5": 60.0})
        assert result["aqi_category"] == "Satisfactory"

    def test_pm25_moderate_lower_bound(self):
        """PM2.5 just above 60 µg/m³ → Moderate"""
        result = calculate_aqi({"pm2_5": 61.0})
        assert result["aqi_category"] == "Moderate"

    def test_pm25_moderate_midpoint(self):
        """PM2.5 = 75 µg/m³ → Moderate"""
        result = calculate_aqi({"pm2_5": 75.0})
        assert result["aqi_category"] == "Moderate"

    def test_pm25_moderate_upper_bound(self):
        """PM2.5 = 90 µg/m³ → Moderate (boundary)"""
        result = calculate_aqi({"pm2_5": 90.0})
        assert result["aqi_category"] == "Moderate"

    def test_pm25_poor_lower_bound(self):
        """PM2.5 just above 90 µg/m³ → Poor"""
        result = calculate_aqi({"pm2_5": 91.0})
        assert result["aqi_category"] == "Poor"

    def test_pm25_poor_midpoint(self):
        """PM2.5 = 105 µg/m³ → Poor"""
        result = calculate_aqi({"pm2_5": 105.0})
        assert result["aqi_category"] == "Poor"

    def test_pm25_poor_upper_bound(self):
        """PM2.5 = 120 µg/m³ → Poor (boundary)"""
        result = calculate_aqi({"pm2_5": 120.0})
        assert result["aqi_category"] == "Poor"

    def test_pm25_very_poor_lower_bound(self):
        """PM2.5 just above 120 µg/m³ → Very Poor"""
        result = calculate_aqi({"pm2_5": 121.0})
        assert result["aqi_category"] == "Very Poor"

    def test_pm25_very_poor_midpoint(self):
        """PM2.5 = 185 µg/m³ → Very Poor"""
        result = calculate_aqi({"pm2_5": 185.0})
        assert result["aqi_category"] == "Very Poor"

    def test_pm25_very_poor_upper_bound(self):
        """PM2.5 = 250 µg/m³ → Very Poor (boundary)"""
        result = calculate_aqi({"pm2_5": 250.0})
        assert result["aqi_category"] == "Very Poor"

    def test_pm25_severe_lower_bound(self):
        """PM2.5 just above 250 µg/m³ → Severe"""
        result = calculate_aqi({"pm2_5": 251.0})
        assert result["aqi_category"] == "Severe"

    def test_pm25_severe_midpoint(self):
        """PM2.5 = 375 µg/m³ → Severe"""
        result = calculate_aqi({"pm2_5": 375.0})
        assert result["aqi_category"] == "Severe"

    def test_pm25_severe_upper_bound(self):
        """PM2.5 = 500 µg/m³ → Severe (CP-1 requirement)"""
        result = calculate_aqi({"pm2_5": 500.0})
        assert result["aqi_category"] == "Severe"


# ─────────────────────────────────────────────────────────────────────────────
# PM10 — all 6 categories
# ─────────────────────────────────────────────────────────────────────────────

class TestPM10Categories:
    """PM10 values should map to the correct AQI category."""

    def test_pm10_good_lower_bound(self):
        """PM10 = 0 µg/m³ → Good"""
        result = calculate_aqi({"pm10": 0.0})
        assert result["aqi_category"] == "Good"

    def test_pm10_good_midpoint(self):
        """PM10 = 25 µg/m³ → Good"""
        result = calculate_aqi({"pm10": 25.0})
        assert result["aqi_category"] == "Good"

    def test_pm10_good_upper_bound(self):
        """PM10 = 50 µg/m³ → Good (boundary)"""
        result = calculate_aqi({"pm10": 50.0})
        assert result["aqi_category"] == "Good"

    def test_pm10_satisfactory_lower_bound(self):
        """PM10 just above 50 µg/m³ → Satisfactory"""
        result = calculate_aqi({"pm10": 51.0})
        assert result["aqi_category"] == "Satisfactory"

    def test_pm10_satisfactory_midpoint(self):
        """PM10 = 75 µg/m³ → Satisfactory"""
        result = calculate_aqi({"pm10": 75.0})
        assert result["aqi_category"] == "Satisfactory"

    def test_pm10_satisfactory_upper_bound(self):
        """PM10 = 100 µg/m³ → Satisfactory (boundary)"""
        result = calculate_aqi({"pm10": 100.0})
        assert result["aqi_category"] == "Satisfactory"

    def test_pm10_moderate_lower_bound(self):
        """PM10 just above 100 µg/m³ → Moderate"""
        result = calculate_aqi({"pm10": 101.0})
        assert result["aqi_category"] == "Moderate"

    def test_pm10_moderate_midpoint(self):
        """PM10 = 175 µg/m³ → Moderate"""
        result = calculate_aqi({"pm10": 175.0})
        assert result["aqi_category"] == "Moderate"

    def test_pm10_moderate_upper_bound(self):
        """PM10 = 250 µg/m³ → Moderate (boundary)"""
        result = calculate_aqi({"pm10": 250.0})
        assert result["aqi_category"] == "Moderate"

    def test_pm10_poor_lower_bound(self):
        """PM10 just above 250 µg/m³ → Poor"""
        result = calculate_aqi({"pm10": 251.0})
        assert result["aqi_category"] == "Poor"

    def test_pm10_poor_midpoint(self):
        """PM10 = 300 µg/m³ → Poor"""
        result = calculate_aqi({"pm10": 300.0})
        assert result["aqi_category"] == "Poor"

    def test_pm10_poor_upper_bound(self):
        """PM10 = 350 µg/m³ → Poor (boundary)"""
        result = calculate_aqi({"pm10": 350.0})
        assert result["aqi_category"] == "Poor"

    def test_pm10_very_poor_lower_bound(self):
        """PM10 just above 350 µg/m³ → Very Poor"""
        result = calculate_aqi({"pm10": 351.0})
        assert result["aqi_category"] == "Very Poor"

    def test_pm10_very_poor_midpoint(self):
        """PM10 = 390 µg/m³ → Very Poor"""
        result = calculate_aqi({"pm10": 390.0})
        assert result["aqi_category"] == "Very Poor"

    def test_pm10_very_poor_upper_bound(self):
        """PM10 = 430 µg/m³ → Very Poor (boundary)"""
        result = calculate_aqi({"pm10": 430.0})
        assert result["aqi_category"] == "Very Poor"

    def test_pm10_severe_lower_bound(self):
        """PM10 just above 430 µg/m³ → Severe"""
        result = calculate_aqi({"pm10": 431.0})
        assert result["aqi_category"] == "Severe"

    def test_pm10_severe_midpoint(self):
        """PM10 = 600 µg/m³ → Severe"""
        result = calculate_aqi({"pm10": 600.0})
        assert result["aqi_category"] == "Severe"

    def test_pm10_severe_high_value(self):
        """PM10 = 900 µg/m³ → Severe"""
        result = calculate_aqi({"pm10": 900.0})
        assert result["aqi_category"] == "Severe"


# ─────────────────────────────────────────────────────────────────────────────
# Boundary values between categories
# ─────────────────────────────────────────────────────────────────────────────

class TestCategoryBoundaries:
    """Exact boundary values must map to the correct category."""

    # PM2.5 boundaries
    def test_pm25_boundary_good_to_satisfactory(self):
        """PM2.5 = 30 → Good; PM2.5 = 31 → Satisfactory"""
        assert calculate_aqi({"pm2_5": 30.0})["aqi_category"] == "Good"
        assert calculate_aqi({"pm2_5": 31.0})["aqi_category"] == "Satisfactory"

    def test_pm25_boundary_satisfactory_to_moderate(self):
        """PM2.5 = 60 → Satisfactory; PM2.5 = 61 → Moderate"""
        assert calculate_aqi({"pm2_5": 60.0})["aqi_category"] == "Satisfactory"
        assert calculate_aqi({"pm2_5": 61.0})["aqi_category"] == "Moderate"

    def test_pm25_boundary_moderate_to_poor(self):
        """PM2.5 = 90 → Moderate; PM2.5 = 91 → Poor"""
        assert calculate_aqi({"pm2_5": 90.0})["aqi_category"] == "Moderate"
        assert calculate_aqi({"pm2_5": 91.0})["aqi_category"] == "Poor"

    def test_pm25_boundary_poor_to_very_poor(self):
        """PM2.5 = 120 → Poor; PM2.5 = 121 → Very Poor"""
        assert calculate_aqi({"pm2_5": 120.0})["aqi_category"] == "Poor"
        assert calculate_aqi({"pm2_5": 121.0})["aqi_category"] == "Very Poor"

    def test_pm25_boundary_very_poor_to_severe(self):
        """PM2.5 = 250 → Very Poor; PM2.5 = 251 → Severe"""
        assert calculate_aqi({"pm2_5": 250.0})["aqi_category"] == "Very Poor"
        assert calculate_aqi({"pm2_5": 251.0})["aqi_category"] == "Severe"

    # PM10 boundaries
    def test_pm10_boundary_good_to_satisfactory(self):
        """PM10 = 50 → Good; PM10 = 51 → Satisfactory"""
        assert calculate_aqi({"pm10": 50.0})["aqi_category"] == "Good"
        assert calculate_aqi({"pm10": 51.0})["aqi_category"] == "Satisfactory"

    def test_pm10_boundary_satisfactory_to_moderate(self):
        """PM10 = 100 → Satisfactory; PM10 = 101 → Moderate"""
        assert calculate_aqi({"pm10": 100.0})["aqi_category"] == "Satisfactory"
        assert calculate_aqi({"pm10": 101.0})["aqi_category"] == "Moderate"

    def test_pm10_boundary_moderate_to_poor(self):
        """PM10 = 250 → Moderate; PM10 = 251 → Poor"""
        assert calculate_aqi({"pm10": 250.0})["aqi_category"] == "Moderate"
        assert calculate_aqi({"pm10": 251.0})["aqi_category"] == "Poor"

    def test_pm10_boundary_poor_to_very_poor(self):
        """PM10 = 350 → Poor; PM10 = 351 → Very Poor"""
        assert calculate_aqi({"pm10": 350.0})["aqi_category"] == "Poor"
        assert calculate_aqi({"pm10": 351.0})["aqi_category"] == "Very Poor"

    def test_pm10_boundary_very_poor_to_severe(self):
        """PM10 = 430 → Very Poor; PM10 = 431 → Severe"""
        assert calculate_aqi({"pm10": 430.0})["aqi_category"] == "Very Poor"
        assert calculate_aqi({"pm10": 431.0})["aqi_category"] == "Severe"


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
