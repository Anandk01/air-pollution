import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import pytest

import anomaly_detector as ad


def make_historical_df(rows: int = 200) -> pd.DataFrame:
    """Create a stable PM2.5 dataset for anomaly model training."""
    start = datetime(2024, 1, 1, 0, 0)
    dates = [start + timedelta(hours=i) for i in range(rows)]
    values = [50.0 + 5.0 * np.sin(i / 24.0 * 2 * np.pi) + np.random.RandomState(42).normal(0, 2) for i in range(rows)]
    return pd.DataFrame({"datetime": dates, "PM2.5": values})


def test_train_anomaly_model_requires_at_least_100_rows(tmp_path, monkeypatch):
    df = make_historical_df(rows=80)
    model_file = tmp_path / "anomaly_model.pkl"
    monkeypatch.setattr(ad, "MODEL_PATH", str(model_file))

    with pytest.raises(ValueError, match="Need ≥ 100 rows to train anomaly model"):
        ad.train_anomaly_model(df)

    assert not model_file.exists()


def test_train_anomaly_model_saves_and_loads_model(tmp_path, monkeypatch):
    df = make_historical_df(rows=150)
    model_file = tmp_path / "anomaly_model.pkl"
    monkeypatch.setattr(ad, "MODEL_PATH", str(model_file))

    result = ad.train_anomaly_model(df, contamination=0.1)

    assert result["rows_trained"] == 150
    assert result["contamination"] == 0.1
    assert result["seasonal_buckets"] > 0
    assert model_file.exists()

    # Reset state and verify load from disk.
    monkeypatch.setattr(ad, "_iso_forest", None)
    monkeypatch.setattr(ad, "_seasonal_stats", {})

    assert ad.load_anomaly_model() is True
    assert ad._iso_forest is not None
    assert isinstance(ad._seasonal_stats, dict)
    assert len(ad._seasonal_stats) > 0


class DummyForest:
    def __init__(self, raw_score=-2.75, predict_value=-1):
        self.raw_score = raw_score
        self.predict_value = predict_value

    def score_samples(self, X):
        return np.full((len(X),), self.raw_score, dtype=float)

    def predict(self, X):
        return np.full((len(X),), self.predict_value, dtype=int)


def test_detect_anomaly_with_model_and_seasonal_stats(monkeypatch):
    monkeypatch.setattr(ad, "_iso_forest", DummyForest(raw_score=-2.75, predict_value=-1))
    monkeypatch.setattr(ad, "_seasonal_stats", {(12, 6): {"mean": 30.0, "std": 5.0}})

    dt = datetime(2024, 6, 15, 12, 0)
    result = ad.detect_anomaly(47.5, dt)

    assert result["is_anomaly"] is True
    assert result["anomaly_score"] == -2.75
    assert result["expected_value"] == 30.0
    assert result["expected_std"] == 5.0
    assert result["z_score"] == pytest.approx((47.5 - 30.0) / 5.0, rel=1e-3)
    assert result["cause_label"] == "UNKNOWN"
    assert result["cause_confidence"] == 0.30


def test_detect_anomaly_without_model_falls_back_to_seasonal_threshold(monkeypatch):
    monkeypatch.setattr(ad, "_iso_forest", None)
    monkeypatch.setattr(ad, "_seasonal_stats", {(14, 11): {"mean": 25.0, "std": 5.0}})

    dt = datetime(2023, 11, 12, 14, 0)
    result = ad.detect_anomaly(40.0, dt)

    assert result["is_anomaly"] is True
    assert result["anomaly_score"] == -0.5
    assert result["cause_label"] == "FESTIVAL"
    assert result["cause_confidence"] == 0.92
    assert "festival calendar" in result["explanation"].lower()


@pytest.mark.parametrize(
    "dt,extra,expected_label",
    [
        (datetime(2024, 10, 15, 9, 0), {"wind_direction": 280, "PM10": 120}, "CROP_BURNING"),
        (datetime(2024, 7, 9, 9, 0), {"NO2": 120}, "TRAFFIC"),
        (datetime(2024, 5, 25, 12, 0), {"wind_speed": 1.2, "humidity": 85}, "WEATHER_TRAPPED"),
    ],
)
def test_classify_cause_rule_based_labels(dt, extra, expected_label):
    result = ad.classify_cause(pm25=150.0, dt=dt, extra=extra)
    assert result["cause_label"] == expected_label
    assert 0.0 < result["cause_confidence"] <= 1.0
    assert result["explanation"]
