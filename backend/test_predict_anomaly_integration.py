import joblib
import numpy as np
import pandas as pd

from app import app
import app as application


class DummyModel:
    def predict(self, X):
        return np.array([42.0])


def test_predict_includes_anomaly_payload(tmp_path, monkeypatch):
    csv_path = tmp_path / "latest.csv"
    dates = pd.date_range("2024-01-01T00:00:00Z", periods=30, freq="15T")
    df = pd.DataFrame({"datetime": dates, "pm25": np.linspace(20.0, 50.0, len(dates))})
    df.to_csv(csv_path, index=False)

    model_path = tmp_path / "best_model.pkl"
    joblib.dump({
        "model": DummyModel(),
        "features": ["hour", "day", "month", "weekday", "lag1", "lag2", "lag24", "rolling_mean_24"],
        "name": "Dummy",
    }, str(model_path))

    monkeypatch.setattr(application, "MODEL_FOLDER", str(tmp_path))
    monkeypatch.setattr(application, "_latest_csv", lambda: str(csv_path))
    monkeypatch.setattr(application, "ANOMALY_AVAILABLE", True)
    monkeypatch.setattr(application, "detect_anomaly", lambda pm25, dt, extra=None: {
        "is_anomaly": False,
        "anomaly_score": -0.5,
        "expected_value": 25.0,
        "expected_std": 5.0,
        "z_score": 1.0,
        "cause_label": "UNKNOWN",
        "cause_confidence": 0.3,
        "explanation": "No anomaly detected.",
    })

    client = app.test_client()
    response = client.post("/api/predict", json={"hours_ahead": 1})
    assert response.status_code == 200

    result = response.get_json()
    assert result["success"] is True
    assert result["anomaly_available"] is True
    assert isinstance(result["anomaly"], dict)
    assert result["anomaly"]["is_anomaly"] is False
    assert result["anomaly"]["cause_label"] == "UNKNOWN"


def test_predict_with_anomaly_endpoint_returns_same_payload(tmp_path, monkeypatch):
    csv_path = tmp_path / "latest.csv"
    dates = pd.date_range("2024-01-01T00:00:00Z", periods=30, freq="15T")
    df = pd.DataFrame({"datetime": dates, "pm25": np.linspace(20.0, 50.0, len(dates))})
    df.to_csv(csv_path, index=False)

    model_path = tmp_path / "best_model.pkl"
    joblib.dump({
        "model": DummyModel(),
        "features": ["hour", "day", "month", "weekday", "lag1", "lag2", "lag24", "rolling_mean_24"],
        "name": "Dummy",
    }, str(model_path))

    monkeypatch.setattr(application, "MODEL_FOLDER", str(tmp_path))
    monkeypatch.setattr(application, "_latest_csv", lambda: str(csv_path))
    monkeypatch.setattr(application, "ANOMALY_AVAILABLE", True)
    monkeypatch.setattr(application, "detect_anomaly", lambda pm25, dt, extra=None: {
        "is_anomaly": False,
        "anomaly_score": -0.5,
        "expected_value": 25.0,
        "expected_std": 5.0,
        "z_score": 1.0,
        "cause_label": "UNKNOWN",
        "cause_confidence": 0.3,
        "explanation": "No anomaly detected.",
    })

    client = app.test_client()
    response = client.post("/api/predict-with-anomaly", json={"hours_ahead": 1})
    assert response.status_code == 200

    result = response.get_json()
    assert result["success"] is True
    assert result["anomaly_available"] is True
    assert isinstance(result["anomaly"], dict)
    assert result["anomaly"]["cause_label"] == "UNKNOWN"


def test_dashboard_includes_last_anomaly_summary(tmp_path, monkeypatch):
    csv_path = tmp_path / "latest.csv"
    dates = pd.date_range("2024-01-01T00:00:00Z", periods=30, freq="15T")
    df = pd.DataFrame({"datetime": dates, "pm25": np.linspace(20.0, 50.0, len(dates))})
    df.to_csv(csv_path, index=False)

    monkeypatch.setattr(application, "_latest_csv", lambda: str(csv_path))
    monkeypatch.setattr(application, "ANOMALY_AVAILABLE", True)
    monkeypatch.setattr(application, "detect_anomaly", lambda pm25, dt, extra=None: {
        "is_anomaly": False,
        "anomaly_score": -0.5,
        "expected_value": 25.0,
        "expected_std": 5.0,
        "z_score": 1.0,
        "cause_label": "UNKNOWN",
        "cause_confidence": 0.3,
        "explanation": "No anomaly detected.",
    })

    client = app.test_client()
    response = client.get("/api/dashboard")
    assert response.status_code == 200

    result = response.get_json()
    assert result["success"] is True
    assert result["anomaly_available"] is True
    assert isinstance(result["last_anomaly"], dict)
    assert result["last_anomaly"]["cause_label"] == "UNKNOWN"
