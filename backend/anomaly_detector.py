"""
anomaly_detector.py
====================
Anomaly detection pipeline for AirSight.

Detection logic (both conditions must be true):
  1. Isolation Forest anomaly score < threshold
  2. Observed value > seasonal_expected + 2.5 * seasonal_std

Root cause classification uses rule-based logic with confidence scores.
"""

import os
import logging
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timezone

log = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "anomaly_model.pkl")

# ── Indian festival dates (extend as needed) ──────────────────────────────────
FESTIVAL_DATES = {
    # Diwali (approx dates, varies yearly)
    "2023-11-12", "2022-10-24", "2021-11-04", "2020-11-14",
    "2019-10-27", "2018-11-07", "2017-10-19", "2016-10-30",
    "2015-11-11",
    # Holi
    "2023-03-08", "2022-03-18", "2021-03-29", "2020-03-10",
    "2019-03-21", "2018-03-02", "2017-03-13", "2016-03-24",
    "2015-03-06",
    # Dussehra
    "2023-10-24", "2022-10-05", "2021-10-15", "2020-10-25",
}

# ── Seasonal baseline: (hour_of_day, month) → (mean, std) ────────────────────
# Built during training from historical data
_seasonal_stats: dict = {}   # key: (hour, month) → {"mean": float, "std": float}
_iso_forest = None


# ─────────────────────────────────────────────────────────────────────────────
# Training
# ─────────────────────────────────────────────────────────────────────────────

def train_anomaly_model(df: pd.DataFrame, contamination: float = 0.05) -> dict:
    """
    Train Isolation Forest on historical PM2.5 data.

    Parameters
    ----------
    df : DataFrame with columns [datetime, PM2.5] at minimum.
         datetime must be parseable; PM2.5 must be numeric.
    contamination : expected fraction of anomalies in training data.

    Returns dict with training summary.
    """
    from sklearn.ensemble import IsolationForest

    df = df.copy()
    df["datetime"] = pd.to_datetime(df["datetime"], errors="coerce")
    df["PM2.5"]    = pd.to_numeric(df.get("PM2.5", df.get("pm25", df.get("pm2_5"))), errors="coerce")
    df = df.dropna(subset=["datetime", "PM2.5"]).sort_values("datetime").reset_index(drop=True)

    if len(df) < 100:
        raise ValueError(f"Need ≥ 100 rows to train anomaly model, got {len(df)}")

    df["hour"]  = df["datetime"].dt.hour
    df["month"] = df["datetime"].dt.month
    df["dow"]   = df["datetime"].dt.dayofweek

    # ── Build seasonal baseline ───────────────────────────────────────────────
    seasonal = {}
    for (hour, month), grp in df.groupby(["hour", "month"]):
        vals = grp["PM2.5"].values
        seasonal[(int(hour), int(month))] = {
            "mean": float(np.mean(vals)),
            "std":  max(float(np.std(vals)), 1.0),   # floor std at 1 to avoid div/0
        }

    # ── Residuals after removing seasonal mean ────────────────────────────────
    df["seasonal_mean"] = df.apply(
        lambda r: seasonal.get((r["hour"], r["month"]), {}).get("mean", df["PM2.5"].mean()), axis=1
    )
    df["residual"] = df["PM2.5"] - df["seasonal_mean"]

    # ── Features for Isolation Forest ─────────────────────────────────────────
    features = df[["PM2.5", "residual", "hour", "month", "dow"]].values

    iso = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        random_state=42,
        n_jobs=-1,
    )
    iso.fit(features)

    # ── Persist ───────────────────────────────────────────────────────────────
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump({"iso_forest": iso, "seasonal": seasonal}, MODEL_PATH)

    global _iso_forest, _seasonal_stats
    _iso_forest     = iso
    _seasonal_stats = seasonal

    log.info("Anomaly model trained on %d rows, saved → %s", len(df), MODEL_PATH)
    return {
        "rows_trained": len(df),
        "contamination": contamination,
        "seasonal_buckets": len(seasonal),
    }


def load_anomaly_model() -> bool:
    """Load persisted anomaly model. Returns True if successful."""
    global _iso_forest, _seasonal_stats
    if not os.path.exists(MODEL_PATH):
        log.warning("Anomaly model not found at %s", MODEL_PATH)
        return False
    try:
        saved           = joblib.load(MODEL_PATH)
        _iso_forest     = saved["iso_forest"]
        _seasonal_stats = saved["seasonal"]
        log.info("Anomaly model loaded from %s", MODEL_PATH)
        return True
    except Exception as exc:
        log.error("Failed to load anomaly model: %s", exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Detection
# ─────────────────────────────────────────────────────────────────────────────

def detect_anomaly(
    observed_pm25: float,
    dt: datetime,
    extra: dict | None = None,
) -> dict:
    """
    Check whether a single PM2.5 reading is anomalous.

    Parameters
    ----------
    observed_pm25 : current PM2.5 reading (µg/m³)
    dt            : datetime of the reading (timezone-aware or naive)
    extra         : optional dict with keys: PM10, NO2, SO2, CO,
                    wind_speed, wind_direction, humidity, temperature

    Returns
    -------
    {
      "is_anomaly": bool,
      "anomaly_score": float,        # raw IF score (more negative = more anomalous)
      "expected_value": float,
      "expected_std": float,
      "z_score": float,
      "cause_label": str,
      "cause_confidence": float,
      "explanation": str,
    }
    """
    extra = extra or {}
    hour  = dt.hour
    month = dt.month
    dow   = dt.weekday()

    # ── Seasonal baseline ─────────────────────────────────────────────────────
    bucket = _seasonal_stats.get((hour, month), {})
    expected = bucket.get("mean", observed_pm25)
    std      = bucket.get("std",  50.0)
    z_score  = (observed_pm25 - expected) / std

    # ── Isolation Forest score ────────────────────────────────────────────────
    if _iso_forest is not None:
        residual = observed_pm25 - expected
        X = np.array([[observed_pm25, residual, hour, month, dow]])
        raw_score  = float(_iso_forest.score_samples(X)[0])   # negative; lower = more anomalous
        if_anomaly = _iso_forest.predict(X)[0] == -1
    else:
        raw_score  = -0.5
        if_anomaly = z_score > 2.5

    # ── Combined gate: both conditions must fire ──────────────────────────────
    is_anomaly = if_anomaly and (z_score > 2.5)

    result = {
        "is_anomaly":    is_anomaly,
        "anomaly_score": round(raw_score, 4),
        "expected_value": round(expected, 2),
        "expected_std":   round(std, 2),
        "z_score":        round(z_score, 3),
        "cause_label":      "UNKNOWN",
        "cause_confidence": 0.0,
        "explanation":      "",
    }

    if is_anomaly:
        cause = classify_cause(observed_pm25, dt, extra)
        result.update(cause)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Root Cause Classifier
# ─────────────────────────────────────────────────────────────────────────────

def classify_cause(pm25: float, dt: datetime, extra: dict) -> dict:
    """
    Rule-based root cause classification.

    Returns {"cause_label": str, "cause_confidence": float, "explanation": str}
    """
    date_str   = dt.strftime("%Y-%m-%d")
    month      = dt.month
    hour       = dt.hour
    wind_speed = extra.get("wind_speed")
    wind_dir   = extra.get("wind_direction")   # degrees; NW ≈ 270–360 or 0–45
    humidity   = extra.get("humidity")
    pm10       = extra.get("PM10")
    no2        = extra.get("NO2")
    so2        = extra.get("SO2")
    no2_sat    = extra.get("no2_satellite")

    scores: dict[str, float] = {}

    # ── FESTIVAL ─────────────────────────────────────────────────────────────
    if date_str in FESTIVAL_DATES:
        scores["FESTIVAL"] = 0.92

    # ── CROP_BURNING ─────────────────────────────────────────────────────────
    if month in (10, 11):
        conf = 0.5
        if wind_dir is not None and (270 <= wind_dir <= 360 or 0 <= wind_dir <= 45):
            conf += 0.25
        if pm10 is not None and pm10 > 0:
            ratio = pm25 / pm10
            if ratio > 0.8:
                conf += 0.20
        scores["CROP_BURNING"] = min(conf, 0.95)

    # ── INDUSTRIAL ───────────────────────────────────────────────────────────
    if so2 is not None:
        # Approximate "normal" SO2 for Delhi ≈ 15 µg/m³
        if so2 > 30 and hour not in range(22, 6):   # daytime industrial hours
            conf = min(0.5 + (so2 - 30) / 100, 0.90)
            scores["INDUSTRIAL"] = conf

    # ── TRAFFIC ──────────────────────────────────────────────────────────────
    if hour in range(8, 11) or hour in range(17, 21):
        conf = 0.55
        if no2 is not None and no2 > 80:
            conf += 0.20
        if no2_sat is not None and no2_sat > 0.00015:
            conf += 0.15 # Satellite confirms high NO2 in the region
        scores["TRAFFIC"] = min(conf, 0.90)

    # ── WEATHER_TRAPPED ──────────────────────────────────────────────────────
    if wind_speed is not None and humidity is not None:
        if wind_speed < 2.0 and humidity > 80:
            scores["WEATHER_TRAPPED"] = 0.80

    # ── Pick highest confidence ───────────────────────────────────────────────
    if not scores:
        return {
            "cause_label":      "UNKNOWN",
            "cause_confidence": 0.30,
            "explanation":      "Anomalous PM2.5 spike detected. Cause could not be determined from available data.",
        }

    best_cause = max(scores, key=scores.get)
    confidence = round(scores[best_cause], 2)

    explanations = {
        "FESTIVAL":       f"Date {date_str} matches an Indian festival calendar entry. Fireworks and biomass burning typically cause sharp PM2.5 spikes.",
        "CROP_BURNING":   f"October–November crop residue burning season. Northwest wind direction and high PM2.5/PM10 ratio ({round(pm25/pm10,2) if pm10 else 'N/A'}) indicate stubble burning transport from Punjab/Haryana.",
        "INDUSTRIAL":     f"SO₂ reading ({so2} µg/m³) is elevated above 2× normal during active industrial hours, suggesting industrial emission event.",
        "TRAFFIC":        f"Anomaly at {hour:02d}:00 coincides with peak traffic hours. Elevated NO₂ ({no2} µg/m³) confirms vehicular emission source.",
        "WEATHER_TRAPPED":f"Wind speed ({wind_speed} m/s) below 2 m/s and humidity ({humidity}%) above 80% for extended period — meteorological trapping of pollutants.",
        "UNKNOWN":        "Anomalous PM2.5 spike detected. Cause could not be determined from available data.",
    }

    return {
        "cause_label":      best_cause,
        "cause_confidence": confidence,
        "explanation":      explanations[best_cause],
    }
