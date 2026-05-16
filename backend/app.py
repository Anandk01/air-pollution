"""
Air Pollution Prediction System — Flask Backend
================================================
Routes:
  GET  /api/health         — liveness probe
  POST /api/upload         — CSV upload + validation
  GET  /api/analytics      — summary stats & trend from latest CSV
  GET  /api/dashboard      — unified dashboard data
  POST /api/train          — preprocess → feature engineering → train → save best model
  POST /api/predict        — rolling prediction for 1 / 6 / 24 hours ahead
  POST /api/predict-with-anomaly — prediction plus anomaly evaluation for latest reading
  GET  /api/export-report  — downloadable PDF report
  GET  /api/air-quality    — live pollutant data from Open-Meteo + CPCB AQI
  GET  /api/cities         — list of major Indian cities with lat/lon
  POST /api/chat           — RAG chatbot: health advisory from PDF knowledge base
"""

import os
import glob
import math
import logging
import warnings
import requests as http_requests

from dotenv import load_dotenv
load_dotenv()          # reads .env before anything else

from gee_service import GEEService, idw_interpolation
gee = GEEService()

import pandas as pd
import numpy as np
import joblib

from notifications import push_bp, get_notifications
from auth_api import auth_bp
from admin_api import admin_bp
from profile_service import profile_bp
from scheduler_service import init_scheduler
from route_pollution_service import route_bp
from safe_route_service import safe_route_bp
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

warnings.filterwarnings("ignore")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(__file__)
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
MODEL_FOLDER  = os.path.join(BASE_DIR, "models")
ALLOWED_EXT   = {"csv"}
MAX_UPLOAD_MB = 50

for d in (UPLOAD_FOLDER, MODEL_FOLDER):
    os.makedirs(d, exist_ok=True)

# ── Flask app ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["UPLOAD_FOLDER"]      = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024
# Enable CORS for all routes so the React frontend on :5173 can talk to us
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.register_blueprint(push_bp, url_prefix="/api/push")
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(admin_bp, url_prefix="/api/admin")
app.register_blueprint(profile_bp, url_prefix="/api/profile")
app.register_blueprint(route_bp, url_prefix="/api/routes")
app.register_blueprint(safe_route_bp, url_prefix="/api/routes")

# ── Community Reports Blueprint ───────────────────────────────────────────────
from reports_api import reports_bp
app.register_blueprint(reports_bp)

from pollution_fusion import set_gee_instance
set_gee_instance(gee)

# ── XGBoost (optional) ────────────────────────────────────────────────────────
try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
    log.info("XGBoost found — will be included in training.")
except ImportError:
    XGBOOST_AVAILABLE = False
    log.warning("XGBoost not installed — skipping XGBoost model.")

# ── RAG Engine (optional) ─────────────────────────────────────────────────────
try:
    from rag_engine import build_index, retrieve_chunks, generate_answer, RAG_AVAILABLE
    log.info("RAG engine imported successfully.")
except ImportError as _rag_import_err:
    RAG_AVAILABLE = False
    build_index = retrieve_chunks = generate_answer = None  # type: ignore[assignment]
    log.warning("RAG engine could not be imported (%s). /api/chat will be unavailable.", _rag_import_err)

# ── RAG lazy-load flag (task 2.6) ─────────────────────────────────────────────
_rag_index_built = False

# Pre-build the FAISS index at startup in a background thread so the first
# /api/chat request doesn't have to wait 30–60 seconds.
if RAG_AVAILABLE and build_index is not None:
    import threading
    def _prebuild_index():
        global _rag_index_built
        try:
            log.info("Pre-building FAISS index at startup …")
            build_index()
            _rag_index_built = True
            log.info("FAISS index pre-built successfully.")
        except Exception as exc:
            log.warning("Background index build failed: %s — will retry on first /api/chat request.", exc)
    threading.Thread(target=_prebuild_index, daemon=True).start()

# ── Column detection ──────────────────────────────────────────────────────────
PM25_CANDIDATES = ["pm2_5", "pm25", "PM2.5", "PM25", "pm_2_5", "PM2_5",
                   "pm2.5", "PM_2_5", "pm 2.5", "PM 2.5", "value"]
DATE_CANDIDATES = ["period.datetimeFrom.utc", "timestamp", "Timestamp", "datetime",
                   "Datetime", "date", "Date", "DATE", "DATETIME", "time", "Time"]
PARAM_CANDIDATES = ["parameter.name", "parameter", "param", "pollutant"]


def _detect_col(columns: list[str], candidates: list[str]) -> str | None:
    col_set = set(columns)
    for c in candidates:
        if c in col_set:
            return c
    lower_map = {c.lower(): c for c in columns}
    for c in candidates:
        if c.lower() in lower_map:
            return lower_map[c.lower()]
    return None


def _latest_csv() -> str | None:
    files = glob.glob(os.path.join(UPLOAD_FOLDER, "*.csv"))
    return max(files, key=os.path.getmtime) if files else None


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


# ── Helpers ───────────────────────────────────────────────────────────────────
def _round(v, n=4):
    return round(float(v), n) if not (math.isnan(v) or math.isinf(v)) else None


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


# ── Upload ────────────────────────────────────────────────────────────────────
@app.route("/api/upload", methods=["POST"])
def upload_csv():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file key. Use field name 'file'."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"success": False, "message": "No file selected."}), 400
    if not _allowed_file(file.filename):
        return jsonify({"success": False, "message": "Only .csv files are accepted."}), 400

    filename  = secure_filename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)

    try:
        df = pd.read_csv(save_path)
        if df.empty:
            os.remove(save_path)
            return jsonify({"success": False, "message": "CSV is empty."}), 400
        return jsonify({"success": True, "filename": filename,
                        "rows": int(len(df)), "columns": df.columns.tolist()}), 200
    except pd.errors.EmptyDataError:
        os.remove(save_path)
        return jsonify({"success": False, "message": "CSV is empty."}), 400
    except pd.errors.ParserError:
        os.remove(save_path)
        return jsonify({"success": False, "message": "Invalid CSV — could not be parsed."}), 400
    except Exception as exc:
        if os.path.exists(save_path):
            os.remove(save_path)
        return jsonify({"success": False, "message": str(exc)}), 500


# ── Analytics ─────────────────────────────────────────────────────────────────
@app.route("/api/analytics", methods=["GET"])
def get_analytics():
    csv_path = _latest_csv()
    if not csv_path:
        return jsonify({"success": False,
                        "message": "No dataset found. Upload a CSV first."}), 404
    try:
        df = pd.read_csv(csv_path)
        pm25_col = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
        date_col = _detect_col(df.columns.tolist(), DATE_CANDIDATES)
        param_col = _detect_col(df.columns.tolist(), PARAM_CANDIDATES)

        if param_col and "pm25" in df[param_col].astype(str).str.lower().values:
            df = df[df[param_col].astype(str).str.lower() == "pm25"].copy()

        if not pm25_col or not date_col:
            return jsonify({"success": False,
                            "message": "Could not detect PM2.5 or date column."}), 400

        df[date_col]  = pd.to_datetime(df[date_col], utc=True, errors="coerce")
        df[pm25_col]  = pd.to_numeric(df[pm25_col], errors="coerce")
        df = df.dropna(subset=[date_col, pm25_col])
        if df.empty:
            return jsonify({"success": False, "message": "No valid rows after cleaning."}), 400

        summary = {
            "avg_pm25": _round(df[pm25_col].mean(), 2),
            "max_pm25": _round(df[pm25_col].max(), 2),
            "min_pm25": _round(df[pm25_col].min(), 2),
        }

        df["_date"] = df[date_col].dt.date
        daily = df.groupby("_date")[pm25_col].mean().reset_index().tail(365)
        daily.columns = ["date", "pm25"]
        daily["date"]  = daily["date"].astype(str)
        daily["pm25"]  = daily["pm25"].round(2)

        df["_period"] = df[date_col].dt.to_period("M")
        monthly = df.groupby("_period")[pm25_col].mean().reset_index()
        monthly.columns = ["month", "pm25"]
        monthly["month"] = monthly["month"].dt.strftime("%b %Y")
        monthly["pm25"]  = monthly["pm25"].round(2)

        return jsonify({
            "success": True,
            "filename": os.path.basename(csv_path),
            "total_rows": int(len(df)),
            "summary":     summary,
            "trend":       daily.to_dict(orient="records"),
            "monthly_avg": monthly.to_dict(orient="records"),
        }), 200
    except Exception as exc:
        log.exception("Analytics error")
        return jsonify({"success": False, "message": str(exc)}), 500


# ── Train ─────────────────────────────────────────────────────────────────────
@app.route("/api/train", methods=["POST"])
def train_models():
    """
    Pipeline:
      1. Load latest CSV
      2. Filter rows where parameter == pm25  (if parameter column exists)
      3. Rename value → pm25, period.datetimeFrom.utc → datetime
      4. Parse datetime, sort, drop nulls
      5. Feature engineering: hour, day, month, weekday, lag1/2/24, rolling_mean_24
      6. Time-based 80/20 train/test split
      7. Train LinearRegression, RandomForest, (XGBoost if available)
      8. Evaluate RMSE / MAE / R²
      9. Save best model (lowest RMSE) to models/best_model.pkl
     10. Return JSON results
    """
    csv_path = _latest_csv()
    if not csv_path:
        return jsonify({"success": False,
                        "message": "No dataset found. Upload a CSV first."}), 404

    # ── 1. Load ───────────────────────────────────────────────────────────────
    try:
        df = pd.read_csv(csv_path)
        log.info("Loaded %s  (%d rows)", os.path.basename(csv_path), len(df))
    except Exception as exc:
        return jsonify({"success": False, "message": f"Cannot read CSV: {exc}"}), 500

    # ── 2. Filter parameter = pm25 ────────────────────────────────────────────
    param_col = _detect_col(df.columns.tolist(), PARAM_CANDIDATES)
    if param_col:
        mask = df[param_col].astype(str).str.lower() == "pm25"
        df   = df[mask].copy()
        log.info("After pm25 filter: %d rows", len(df))
        if df.empty:
            return jsonify({"success": False,
                            "message": "No rows with parameter == pm25 found."}), 400

    # ── 3. Rename columns ─────────────────────────────────────────────────────
    col_map = {}
    raw_pm25 = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
    raw_date = _detect_col(df.columns.tolist(), DATE_CANDIDATES)

    if not raw_pm25:
        return jsonify({"success": False,
                        "message": "Cannot find PM2.5 value column."}), 400
    if not raw_date:
        return jsonify({"success": False,
                        "message": "Cannot find datetime column."}), 400

    if raw_pm25 != "pm25":  col_map[raw_pm25] = "pm25"
    if raw_date != "datetime": col_map[raw_date] = "datetime"
    df = df.rename(columns=col_map)

    # ── 4. Parse datetime, sort, drop nulls ───────────────────────────────────
    df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
    df["pm25"]     = pd.to_numeric(df["pm25"], errors="coerce")
    df = df.dropna(subset=["datetime", "pm25"]).sort_values("datetime").reset_index(drop=True)
    log.info("After cleaning: %d rows", len(df))

    if len(df) < 50:
        return jsonify({"success": False,
                        "message": f"Too few valid rows ({len(df)}) to train. Need ≥ 50."}), 400

    # ── 5. Feature engineering ────────────────────────────────────────────────
    df["hour"]    = df["datetime"].dt.hour
    df["day"]     = df["datetime"].dt.day
    df["month"]   = df["datetime"].dt.month
    df["weekday"] = df["datetime"].dt.weekday   # 0=Mon … 6=Sun

    df["lag1"]  = df["pm25"].shift(1)
    df["lag2"]  = df["pm25"].shift(2)
    df["lag24"] = df["pm25"].shift(24)
    df["rolling_mean_24"] = df["pm25"].shift(1).rolling(window=24, min_periods=1).mean()

    df = df.dropna(subset=["lag1", "lag2", "lag24", "rolling_mean_24"]).reset_index(drop=True)
    log.info("After lag/rolling drops: %d rows", len(df))

    if "no2_satellite" not in df.columns:
        df["no2_satellite"] = 0.0  # Default value if not present in dataset
        log.info("no2_satellite column missing in dataset, filling with 0.0")

    if len(df) < 30:
        return jsonify({"success": False,
                        "message": "Not enough rows after feature engineering. Need ≥ 30."}), 400

    # ── 6. 80/20 time-based split ─────────────────────────────────────────────
    FEATURES = ["hour", "day", "month", "weekday", "lag1", "lag2", "lag24", "rolling_mean_24", "no2_satellite"]
    TARGET   = "pm25"

    split_idx = int(len(df) * 0.80)
    X_train, X_test = df[FEATURES].iloc[:split_idx], df[FEATURES].iloc[split_idx:]
    y_train, y_test = df[TARGET].iloc[:split_idx],   df[TARGET].iloc[split_idx:]

    log.info("Train: %d rows | Test: %d rows", len(X_train), len(X_test))

    # ── 7. Train models ───────────────────────────────────────────────────────
    candidates = {
        "LinearRegression": LinearRegression(),
        "RandomForest":     RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
    }
    if XGBOOST_AVAILABLE:
        candidates["XGBoost"] = XGBRegressor(
            n_estimators=200, learning_rate=0.05, max_depth=6,
            subsample=0.8, colsample_bytree=0.8,
            random_state=42, verbosity=0,
        )

    results  = []
    best_name, best_rmse, best_model = None, float("inf"), None

    for name, model in candidates.items():
        log.info("Training %s …", name)
        try:
            model.fit(X_train, y_train)
            preds = model.predict(X_test)

            rmse = _round(math.sqrt(mean_squared_error(y_test, preds)), 4)
            mae  = _round(mean_absolute_error(y_test, preds), 4)
            r2   = _round(r2_score(y_test, preds), 4)

            log.info("  %s → RMSE=%.2f  MAE=%.2f  R²=%.4f", name, rmse, mae, r2)
            results.append({"model": name, "rmse": rmse, "mae": mae, "r2": r2})

            if rmse < best_rmse:
                best_rmse  = rmse
                best_name  = name
                best_model = model

        except Exception as exc:
            log.error("  %s FAILED: %s", name, exc)
            results.append({"model": name, "error": str(exc)})

    if best_model is None:
        return jsonify({"success": False, "message": "All models failed to train."}), 500

    # ── 9. Save best model ────────────────────────────────────────────────────
    model_path = os.path.join(MODEL_FOLDER, "best_model.pkl")
    joblib.dump({
        "model":       best_model,
        "features":    FEATURES,
        "name":        best_name,
        "rmse":        best_rmse,
        "all_metrics": [r for r in results if "error" not in r],
    }, model_path)
    log.info("Saved best model (%s, RMSE=%.2f) → %s", best_name, best_rmse, model_path)

    # ── 10. Return results ────────────────────────────────────────────────────
    return jsonify({
        "success":    True,
        "best_model": best_name,
        "best_rmse":  best_rmse,
        "train_rows": int(len(X_train)),
        "test_rows":  int(len(X_test)),
        "features":   FEATURES,
        "metrics":    results,
    }), 200


# ── Dashboard ────────────────────────────────────────────────────────────────
@app.route("/api/dashboard", methods=["GET"])
def get_dashboard():
    """
    Unified dashboard endpoint combining:
      - Latest PM2.5 reading + AQI status
      - Recent hourly trend (up to 48 points)
      - Saved model metadata (name, RMSE, per-model metrics)
      - Dataset record count
    """
    # ── Dataset ───────────────────────────────────────────────────────────────
    csv_path = _latest_csv()
    if not csv_path:
        return jsonify({"success": False,
                        "message": "No dataset found. Upload a CSV first."}), 404

    try:
        df        = pd.read_csv(csv_path)
        param_col = _detect_col(df.columns.tolist(), PARAM_CANDIDATES)
        if param_col:
            df = df[df[param_col].astype(str).str.lower() == "pm25"].copy()

        raw_pm25 = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
        raw_date = _detect_col(df.columns.tolist(), DATE_CANDIDATES)

        if not raw_pm25 or not raw_date:
            return jsonify({"success": False,
                            "message": "Cannot detect required columns."}), 400

        col_map = {}
        if raw_pm25 != "pm25":    col_map[raw_pm25] = "pm25"
        if raw_date != "datetime": col_map[raw_date] = "datetime"
        df = df.rename(columns=col_map)

        df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
        df["pm25"]     = pd.to_numeric(df["pm25"], errors="coerce")
        df = df.dropna(subset=["datetime", "pm25"]).sort_values("datetime").reset_index(drop=True)

    except Exception as exc:
        return jsonify({"success": False, "message": f"Error reading dataset: {exc}"}), 500

    if df.empty:
        return jsonify({"success": False, "message": "Dataset is empty after cleaning."}), 400

    records_count = int(len(df))
    current_pm25  = round(float(df["pm25"].iloc[-1]), 2)
    last_dt       = df["datetime"].iloc[-1]

    # ── Recent hourly trend (last 48 hours, 1-hour buckets) ───────────────────
    df["_hour"] = df["datetime"].dt.floor("h")
    hourly = (
        df.groupby("_hour")["pm25"]
        .mean()
        .reset_index()
        .tail(48)
    )
    hourly.columns = ["hour", "pm25"]
    recent_trend = [
        {
            "time": row["hour"].strftime("%d %b %H:%M"),
            "pm25": round(float(row["pm25"]), 1),
        }
        for _, row in hourly.iterrows()
    ]

    # ── Model metadata ────────────────────────────────────────────────────────
    model_path    = os.path.join(MODEL_FOLDER, "best_model.pkl")
    best_model_name = None
    best_rmse       = None
    model_metrics   = []

    if os.path.exists(model_path):
        try:
            saved           = joblib.load(model_path)
            best_model_name = saved.get("name", "Unknown")
            best_rmse       = saved.get("rmse")
            model_metrics   = saved.get("all_metrics",
                                        [{"model": best_model_name, "rmse": best_rmse}])
        except Exception as exc:
            log.warning("Could not load model for dashboard: %s", exc)

    # ── AQI colour scale buckets for frontend mini-chart ─────────────────────
    hourly_stats = {
        "avg":  round(float(df["pm25"].mean()), 2),
        "max":  round(float(df["pm25"].max()),  2),
        "min":  round(float(df["pm25"].min()),  2),
    }

    last_anomaly = None
    if ANOMALY_AVAILABLE:
        try:
            extra = {
                k: df[k].iloc[-1]
                for k in ("PM10", "NO2", "SO2", "CO", "wind_speed", "wind_direction", "humidity", "temperature")
                if k in df.columns
            }
            last_anomaly = detect_anomaly(current_pm25, last_dt.to_pydatetime(), extra)
        except Exception as exc:
            log.warning("Dashboard anomaly detection failed: %s", exc)

    return jsonify({
        "success":          True,
        "current_pm25":     current_pm25,
        "aqi_status":       _aqi_label(current_pm25),
        "best_model":       best_model_name,
        "best_rmse":        best_rmse,
        "records_count":    records_count,
        "last_updated":     last_dt.isoformat(),
        "dataset_file":     os.path.basename(csv_path),
        "hourly_stats":     hourly_stats,
        "recent_trend":     recent_trend,
        "model_metrics":    model_metrics,
        "anomaly_available": ANOMALY_AVAILABLE,
        "last_anomaly":     last_anomaly,
    }), 200


# ── AQI label ─────────────────────────────────────────────────────────────────
def _aqi_label(pm25: float) -> str:
    if pm25 <= 30:   return "Good"
    if pm25 <= 60:   return "Satisfactory"
    if pm25 <= 90:   return "Moderate"
    if pm25 <= 120:  return "Poor"
    if pm25 <= 250:  return "Very Poor"
    return "Severe"


# ── Predict ───────────────────────────────────────────────────────────────────
def _build_predict_response(body: dict) -> tuple[dict, int]:
    body = body or {}
    hours_ahead = int(body.get("hours_ahead", 1))
    if hours_ahead not in (1, 6, 24):
        return {"success": False,
                "message": "hours_ahead must be 1, 6, or 24."}, 400

    model_path = os.path.join(MODEL_FOLDER, "best_model.pkl")
    if not os.path.exists(model_path):
        return {"success": False,
                "message": "No trained model found. Call /api/train first."}, 404

    try:
        saved      = joblib.load(model_path)
        model      = saved["model"]
        features   = saved["features"]
        model_name = saved["name"]
    except Exception as exc:
        return {"success": False,
                "message": f"Failed to load model: {exc}"}, 500

    csv_path = _latest_csv()
    if not csv_path:
        return {"success": False,
                "message": "No dataset found. Upload a CSV first."}, 404

    try:
        df        = pd.read_csv(csv_path)
        param_col = _detect_col(df.columns.tolist(), PARAM_CANDIDATES)
        if param_col:
            df = df[df[param_col].astype(str).str.lower() == "pm25"].copy()

        raw_pm25 = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
        raw_date = _detect_col(df.columns.tolist(), DATE_CANDIDATES)

        if not raw_pm25 or not raw_date:
            return {"success": False,
                    "message": "Cannot detect PM2.5 or datetime column."}, 400

        col_map = {}
        if raw_pm25 != "pm25":    col_map[raw_pm25] = "pm25"
        if raw_date != "datetime": col_map[raw_date] = "datetime"
        df = df.rename(columns=col_map)

        df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
        df["pm25"]     = pd.to_numeric(df["pm25"], errors="coerce")
        df = df.dropna(subset=["datetime", "pm25"]).sort_values("datetime").reset_index(drop=True)

    except Exception as exc:
        return {"success": False,
                "message": f"Error reading dataset: {exc}"}, 500

    if len(df) < 24:
        return {"success": False,
                "message": f"Need ≥ 24 data rows to build features. Found {len(df)}."}, 400

    STEPS_PER_HOUR = 4
    steps = hours_ahead * STEPS_PER_HOUR

    recent_vals = list(df["pm25"].values)
    last_dt     = df["datetime"].iloc[-1]

    last_known_pm25 = round(float(recent_vals[-1]), 2)
    last_known_dt   = last_dt.isoformat()

    predicted_pm25 = None
    for step in range(1, steps + 1):
        target_dt = last_dt + pd.Timedelta(minutes=15 * step)

        lag1  = recent_vals[-1]
        lag2  = recent_vals[-2] if len(recent_vals) >= 2 else lag1
        lag24 = recent_vals[-24] if len(recent_vals) >= 24 else recent_vals[0]
        rolling_mean_24 = float(np.mean(recent_vals[-24:]))

        row = {
            "hour":            target_dt.hour,
            "day":             target_dt.day,
            "month":           target_dt.month,
            "weekday":         target_dt.weekday(),
            "lag1":            lag1,
            "lag2":            lag2,
            "lag24":           lag24,
            "rolling_mean_24": rolling_mean_24,
            "no2_satellite":   body.get("no2_satellite", 0.0)
        }
        X = pd.DataFrame([row])[features]
        predicted_pm25 = float(model.predict(X)[0])
        predicted_pm25 = max(0.0, predicted_pm25)
        recent_vals.append(predicted_pm25)

    predicted_pm25 = round(predicted_pm25, 2)

    response = {
        "success":             True,
        "hours_ahead":         hours_ahead,
        "predicted_pm25":      predicted_pm25,
        "aqi_status":          _aqi_label(predicted_pm25),
        "model":               model_name,
        "last_known_pm25":     last_known_pm25,
        "last_known_datetime": last_known_dt,
        "anomaly_available":   ANOMALY_AVAILABLE,
    }

    if ANOMALY_AVAILABLE:
        try:
            dt_obj = last_dt.to_pydatetime() if hasattr(last_dt, "to_pydatetime") else last_dt
            extra = {
                k: body.get(k)
                for k in ("PM10", "NO2", "SO2", "CO", "wind_speed", "wind_direction", "humidity", "temperature")
            }
            # Include satellite data for better anomaly classification
            if "no2_satellite" in body:
                extra["no2_satellite"] = body["no2_satellite"]

            response["anomaly"] = detect_anomaly(last_known_pm25, dt_obj, extra)
        except Exception as exc:
            log.warning("Anomaly detection failed inside /api/predict: %s", exc)
            response["anomaly_error"] = str(exc)

    log.info("Predict %dh ahead → %.2f µg/m³ (%s)  [%s]",
             hours_ahead, predicted_pm25, _aqi_label(predicted_pm25), model_name)

    return response, 200


@app.route("/api/predict", methods=["POST"])
def predict():
    body = request.get_json(force=True, silent=True) or {}
    response, status = _build_predict_response(body)
    return jsonify(response), status


@app.route("/api/predict-with-anomaly", methods=["POST"])
def predict_with_anomaly():
    body = request.get_json(force=True, silent=True) or {}
    response, status = _build_predict_response(body)
    return jsonify(response), status


# ── Satellite-AQI ─────────────────────────────────────────────────────────────
@app.route("/api/satellite-aqi", methods=["POST"])
def satellite_aqi():
    """
    POST /api/satellite-aqi
    Input: { "city": "Delhi", "lat": 28.6, "lon": 77.2, "date": "YYYY-MM-DD" }
    Output: { "no2_satellite": float, "aqi_prediction": float, "heatmap_geojson": GeoJSON }
    """
    body = request.get_json(force=True, silent=True) or {}
    city = body.get("city", "Delhi")
    lat = body.get("lat", 28.6)
    lon = body.get("lon", 77.2)
    date_str = body.get("date")

    # 1. Fetch Satellite Data
    satellite_data = gee.fetch_no2_data(lat, lon, date_str)
    no2_val = 0.0
    satellite_available = False
    heatmap_geojson = {"type": "FeatureCollection", "features": []}

    if satellite_data:
        satellite_available = True
        # IDW Interpolation at requested lat/lon
        no2_val = idw_interpolation(lon, lat, satellite_data['lons'], satellite_data['lats'], satellite_data['no2'])
        
        # Generate Heatmap GeoJSON (Grid of points)
        for i, plat in enumerate(satellite_data['lats']):
            for j, plon in enumerate(satellite_data['lons']):
                val = satellite_data['no2'][i][j]
                if val > 0:
                    heatmap_geojson["features"].append({
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": [plon, plat]},
                        "properties": {"no2": float(val)}
                    })
    else:
        log.warning("Satellite data unavailable, falling back to OpenMeteo/Existing model features.")

    # 2. Get Prediction (Fallback logic included in _build_predict_response)
    # We pass the satellite NO2 as an extra feature
    body['no2_satellite'] = no2_val
    prediction_resp, status = _build_predict_response(body)

    if status != 200:
        return jsonify(prediction_resp), status

    result = {
        "success": True,
        "city": city,
        "no2_satellite": no2_val,
        "satellite_available": satellite_available,
        "aqi_prediction": prediction_resp.get("predicted_pm25"),
        "aqi_status": prediction_resp.get("aqi_status"),
        "heatmap_geojson": heatmap_geojson
    }

    return jsonify(result), 200


# ── Route AQI  ────────────────────────────────────────────────────────────────
@app.route("/api/route-aqi", methods=["POST"])
def route_aqi():
    """
    POST /api/route-aqi
    Input:  { "start_lat", "start_lon", "end_lat", "end_lon" }
    Output: { "route_coords": [...], "segments": [...], "summary": {...} }

    Uses OSRM for routing + satellite NO2 data for AQI along the path.
    """
    from pollution_fusion import fuse_pollution_for_segment
    import requests as http_requests
    import math

    body = request.get_json(force=True, silent=True) or {}
    start_lat = body.get("start_lat")
    start_lon = body.get("start_lon")
    end_lat   = body.get("end_lat")
    end_lon   = body.get("end_lon")

    if not all([start_lat, start_lon, end_lat, end_lon]):
        return jsonify({"error": "start_lat, start_lon, end_lat, end_lon required"}), 400

    # 1. Get route from OSRM (free, no API key)
    osrm_url = (
        f"http://router.project-osrm.org/route/v1/driving/"
        f"{start_lon},{start_lat};{end_lon},{end_lat}"
        f"?overview=full&geometries=geojson&steps=true"
    )
    try:
        osrm_resp = http_requests.get(osrm_url, timeout=10).json()
        if osrm_resp.get("code") != "Ok":
            return jsonify({"error": "Could not find route", "detail": osrm_resp.get("message")}), 400
    except Exception as exc:
        log.error("OSRM routing failed: %s", exc)
        return jsonify({"error": "Routing service unavailable"}), 503

    route_geom = osrm_resp["routes"][0]["geometry"]["coordinates"]  # [[lon, lat], ...]
    distance_m = osrm_resp["routes"][0]["distance"]
    duration_s = osrm_resp["routes"][0]["duration"]

    # 2. Sample data along route at regular intervals
    # We no longer pre-fetch the satellite bounding box here since fuse_pollution_for_segment 
    # handles fetching and interpolation internally via the shared GEE instance.
    def haversine(lat1, lon1, lat2, lon2):
        R = 6371000
        p = math.pi / 180
        a = 0.5 - math.cos((lat2-lat1)*p)/2 + math.cos(lat1*p)*math.cos(lat2*p)*(1-math.cos((lon2-lon1)*p))/2
        return 2 * R * math.asin(math.sqrt(a))

    def no2_to_aqi_label(no2):
        """Convert NO2 mol/m² to a safety label and numeric score."""
        if no2 > 0.0002:
            return {"aqi": 300, "label": "Hazardous",     "color": "#ef4444", "safe": False}
        elif no2 > 0.00015:
            return {"aqi": 200, "label": "Unhealthy",     "color": "#f97316", "safe": False}
        elif no2 > 0.0001:
            return {"aqi": 150, "label": "Moderate",      "color": "#eab308", "safe": True}
        elif no2 > 0.00005:
            return {"aqi": 75,  "label": "Satisfactory",  "color": "#84cc16", "safe": True}
        else:
            return {"aqi": 30,  "label": "Good",          "color": "#22c55e", "safe": True}

    segments = []
    sampled_aqi = []
    has_satellite = False

    for i in range(len(route_geom) - 1):
        lon1, lat1 = route_geom[i]
        lon2, lat2 = route_geom[i + 1]
        mid_lat = (lat1 + lat2) / 2
        mid_lon = (lon1 + lon2) / 2
        seg_dist = haversine(lat1, lon1, lat2, lon2)

        # Fuse satellite + community reports
        fusion = fuse_pollution_for_segment(mid_lat, mid_lon, radius_m=500)
        score = fusion["pollution_score"]  # 0 to 100
        if fusion["satellite_aqi"] is not None:
            has_satellite = True
        
        # Convert 0-100 score to 0-300 AQI scale for the UI logic
        aqi_val = score * 3
        
        if aqi_val > 200:
            rating = {"aqi": aqi_val, "label": "Hazardous", "color": "#ef4444", "safe": False}
        elif aqi_val > 150:
            rating = {"aqi": aqi_val, "label": "Unhealthy", "color": "#f97316", "safe": False}
        elif aqi_val > 100:
            rating = {"aqi": aqi_val, "label": "Moderate", "color": "#eab308", "safe": True}
        elif aqi_val > 50:
            rating = {"aqi": aqi_val, "label": "Satisfactory", "color": "#84cc16", "safe": True}
        else:
            rating = {"aqi": aqi_val, "label": "Good", "color": "#22c55e", "safe": True}

        sampled_aqi.append(rating["aqi"])

        segments.append({
            "start": [lat1, lon1],
            "end":   [lat2, lon2],
            "fusion": fusion,
            "aqi":   round(rating["aqi"]),
            "label": rating["label"],
            "color": rating["color"],
            "safe":  rating["safe"],
            "distance_m": round(seg_dist, 1)
        })

    # 4. Build summary
    if sampled_aqi:
        avg_aqi = sum(sampled_aqi) / len(sampled_aqi)
        worst_aqi = max(sampled_aqi)
        best_aqi  = min(sampled_aqi)
        unsafe_pct = round(100 * sum(1 for s in segments if not s["safe"]) / len(segments), 1)
    else:
        avg_aqi = worst_aqi = best_aqi = 0
        unsafe_pct = 0

    # Overall safety
    if avg_aqi <= 75:
        overall = "Safe"
    elif avg_aqi <= 150:
        overall = "Moderate"
    else:
        overall = "Unsafe"

    return jsonify({
        "success": True,
        "satellite_available": has_satellite,
        "route_distance_km": round(distance_m / 1000, 2),
        "route_duration_min": round(duration_s / 60, 1),
        "segments": segments,
        "summary": {
            "overall_safety": overall,
            "avg_aqi": round(avg_aqi, 1),
            "worst_aqi": worst_aqi,
            "best_aqi": best_aqi,
            "unsafe_segments_pct": unsafe_pct,
            "total_segments": len(segments)
        }
    }), 200

# ── Export Report ─────────────────────────────────────────────────────────────
@app.route("/api/export-report", methods=["GET"])
def export_report():
    """
    Generate and return a styled PDF report in-memory using fpdf2.
    Includes: title, current PM2.5, AQI, best model, RMSE,
              dataset stats, model comparison table, timestamp.
    """
    from fpdf import FPDF
    import io
    from datetime import datetime, timezone

    # ── Gather data (same logic as /api/dashboard) ────────────────────────────
    csv_path = _latest_csv()
    if not csv_path:
        return jsonify({"success": False,
                        "message": "No dataset. Upload a CSV first."}), 404

    try:
        df        = pd.read_csv(csv_path)
        param_col = _detect_col(df.columns.tolist(), PARAM_CANDIDATES)
        if param_col:
            df = df[df[param_col].astype(str).str.lower() == "pm25"].copy()

        raw_pm25 = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
        raw_date = _detect_col(df.columns.tolist(), DATE_CANDIDATES)

        col_map = {}
        if raw_pm25 != "pm25":    col_map[raw_pm25] = "pm25"
        if raw_date != "datetime": col_map[raw_date] = "datetime"
        df = df.rename(columns=col_map)

        df["datetime"] = pd.to_datetime(df["datetime"], utc=True, errors="coerce")
        df["pm25"]     = pd.to_numeric(df["pm25"], errors="coerce")
        df = df.dropna(subset=["datetime", "pm25"]).sort_values("datetime").reset_index(drop=True)
    except Exception as exc:
        return jsonify({"success": False, "message": str(exc)}), 500

    if df.empty:
        return jsonify({"success": False, "message": "Dataset empty after cleaning."}), 400

    current_pm25  = round(float(df["pm25"].iloc[-1]), 2)
    aqi_status    = _aqi_label(current_pm25)
    records_count = len(df)
    avg_pm25      = round(float(df["pm25"].mean()), 2)
    max_pm25      = round(float(df["pm25"].max()),  2)
    min_pm25      = round(float(df["pm25"].min()),  2)
    dataset_file  = os.path.basename(csv_path)
    last_reading  = df["datetime"].iloc[-1].strftime("%Y-%m-%d %H:%M UTC")
    generated_at  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # Model info
    best_model_name = "Not trained"
    best_rmse       = "—"
    all_metrics     = []
    model_path      = os.path.join(MODEL_FOLDER, "best_model.pkl")
    if os.path.exists(model_path):
        try:
            saved           = joblib.load(model_path)
            best_model_name = saved.get("name", "Unknown")
            best_rmse       = str(saved.get("rmse", "—"))
            all_metrics     = saved.get("all_metrics", [])
        except Exception:
            pass

    # ── Build PDF ─────────────────────────────────────────────────────────────
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()

    # ── Header band ───────────────────────────────────────────────────────────
    pdf.set_fill_color(13, 21, 38)        # dark navy
    pdf.rect(0, 0, 210, 42, "F")

    pdf.set_xy(14, 8)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(0, 212, 255)       # cyan
    pdf.cell(0, 10, "Smart Air Pollution Forecasting System", ln=True)

    pdf.set_x(14)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(160, 174, 200)
    pdf.cell(0, 7, "AI-Powered PM2.5 Prediction Report", ln=True)

    pdf.set_x(14)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(120, 140, 170)
    pdf.cell(0, 6, f"Generated: {generated_at}", ln=True)

    # ── Section helper ────────────────────────────────────────────────────────
    def section(title):
        pdf.ln(6)
        pdf.set_fill_color(20, 32, 56)
        pdf.set_text_color(79, 142, 247)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_x(14)
        pdf.cell(182, 8, f"  {title}", ln=True, fill=True)
        pdf.ln(2)

    def row(label, value, highlight=False):
        pdf.set_x(14)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(140, 156, 180)
        pdf.cell(75, 7, label)
        pdf.set_font("Helvetica", "B" if highlight else "", 10)
        pdf.set_text_color(230, 235, 245) if not highlight else pdf.set_text_color(0, 212, 255)
        pdf.cell(107, 7, str(value), ln=True)

    # ── Air Quality Summary ───────────────────────────────────────────────────
    section("Air Quality Summary")
    AQI_COLOURS = {
        "Good":        (34,  197, 94),
        "Satisfactory":(132, 204, 22),
        "Moderate":    (245, 158, 11),
        "Poor":        (249, 115, 22),
        "Very Poor":   (239, 68,  68),
        "Severe":      (168, 85,  247),
    }
    ac = AQI_COLOURS.get(aqi_status, (239, 68, 68))

    # AQI big box
    pdf.set_fill_color(20, 32, 56)
    pdf.set_x(14)
    pdf.rect(14, pdf.get_y(), 85, 24, "F")
    pdf.set_xy(16, pdf.get_y() + 4)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*ac)
    pdf.cell(81, 10, f"{current_pm25} μg/m3", align="C")
    pdf.ln(10)
    pdf.set_x(16)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(140, 156, 180)
    pdf.cell(81, 5, "Current PM2.5", align="C", ln=True)

    pdf.set_xy(110, pdf.get_y() - 18)
    pdf.set_fill_color(*ac)
    pdf.rect(110, pdf.get_y() + 2, 86, 16, "F")
    pdf.set_xy(112, pdf.get_y() + 5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(82, 8, aqi_status, align="C", ln=True)

    pdf.ln(6)
    row("Average PM2.5",  f"{avg_pm25} μg/m3")
    row("Maximum PM2.5",  f"{max_pm25} μg/m3")
    row("Minimum PM2.5",  f"{min_pm25} μg/m3")
    row("Last Reading",   last_reading)

    # ── Dataset Info ──────────────────────────────────────────────────────────
    section("Dataset Information")
    row("File",           dataset_file)
    row("Total Records",  f"{records_count:,}")
    row("Date Range",     f"{df['datetime'].iloc[0].strftime('%Y-%m-%d')}  →  {df['datetime'].iloc[-1].strftime('%Y-%m-%d')}")

    # ── Model Information ─────────────────────────────────────────────────────
    section("ML Model Summary")
    row("Best Model",     best_model_name, highlight=True)
    row("RMSE",           f"{best_rmse} μg/m3")

    # Model comparison table
    if all_metrics:
        pdf.ln(4)
        # Table header
        pdf.set_fill_color(20, 32, 56)
        pdf.set_text_color(79, 142, 247)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_x(14)
        for h, w in [("Model", 65), ("RMSE", 32), ("MAE", 32), ("R²", 32)]:
            pdf.cell(w, 7, h, fill=True, border=0)
        pdf.ln(7)

        for m in all_metrics:
            is_best = m.get("model") == best_model_name
            pdf.set_x(14)
            pdf.set_fill_color(25, 38, 60) if is_best else pdf.set_fill_color(17, 25, 42)
            pdf.set_text_color(0, 212, 255) if is_best else pdf.set_text_color(200, 210, 230)
            pdf.set_font("Helvetica", "B" if is_best else "", 9)
            pdf.cell(65, 6, ("★ " if is_best else "  ") + m.get("model", ""), fill=True)
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(200, 210, 230)
            pdf.cell(32, 6, str(m.get("rmse", "—")), fill=True)
            pdf.cell(32, 6, str(m.get("mae",  "—")), fill=True)
            pdf.cell(32, 6, str(m.get("r2",   "—")), fill=True)
            pdf.ln(6)

    # ── Footer ────────────────────────────────────────────────────────────────
    pdf.ln(10)
    pdf.set_draw_color(30, 48, 80)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(90, 110, 145)
    pdf.set_x(14)
    pdf.cell(0, 5, "Smart Air Pollution Forecasting System  ·  Confidential  ·  AI-Generated Report", align="C")

    # ── Output ────────────────────────────────────────────────────────────────
    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)

    from flask import send_file
    filename = f"air_quality_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    return send_file(
        buf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# ── Analyze Air Quality ────────────────────────────────────────────────────────
# Breakpoints follow India's CPCB AQI standard (linear interpolation)
# Each entry: (conc_lo, conc_hi, aqi_lo, aqi_hi)
_BREAKPOINTS = {
    "pm25": [
        (0.0,  30.0,   0,   50),
        (30.0, 60.0,  51,  100),
        (60.0, 90.0, 101,  200),
        (90.0,120.0, 201,  300),
        (120.0,250.0,301,  400),
        (250.0,9999, 401,  500),
    ],
    "pm10": [
        (0,    50,    0,   50),
        (50,  100,   51,  100),
        (100, 250,  101,  200),
        (250, 350,  201,  300),
        (350, 430,  301,  400),
        (430, 9999, 401,  500),
    ],
    "no2": [
        (0,   40,    0,   50),
        (40,  80,   51,  100),
        (80,  180, 101,  200),
        (180, 280, 201,  300),
        (280, 400, 301,  400),
        (400, 9999,401,  500),
    ],
    "so2": [
        (0,   40,    0,   50),
        (40,  80,   51,  100),
        (80,  380, 101,  200),
        (380, 800, 201,  300),
        (800,1600, 301,  400),
        (1600,9999,401,  500),
    ],
    "co": [
        (0,    1.0,   0,   50),
        (1.0,  2.0,  51,  100),
        (2.0, 10.0, 101,  200),
        (10.0,17.0, 201,  300),
        (17.0,34.0, 301,  400),
        (34.0,9999, 401,  500),
    ],
    "o3": [
        (0,   50,    0,   50),
        (50,  100,  51,  100),
        (100, 168, 101,  200),
        (168, 208, 201,  300),
        (208, 748, 301,  400),
        (748, 9999,401,  500),
    ],
}

_LABELS = {
    "pm25": "PM2.5", "pm10": "PM10", "no2": "NO₂",
    "so2": "SO₂",   "co":   "CO",   "o3":  "O₃",
}

_HEALTH = {
    "Good":       "Air quality is satisfactory. Enjoy your outdoor activities freely.",
    "Satisfactory":"Air quality is acceptable. Sensitive individuals should limit prolonged exertion.",
    "Moderate":   "Sensitive groups (children, elderly, asthma) should reduce outdoor exertion.",
    "Poor":       "Everyone may experience health effects. Limit prolonged outdoor exertion.",
    "Very Poor":  "Health alert — everyone is likely to be affected. Avoid outdoor activities.",
    "Severe":     "Emergency conditions. Avoid all outdoor exertion. Stay indoors with windows closed.",
}


def _sub_index(pollutant: str, concentration: float) -> float:
    """Linear interpolation using CPCB breakpoints."""
    for (c_lo, c_hi, a_lo, a_hi) in _BREAKPOINTS[pollutant]:
        if c_lo <= concentration <= c_hi:
            if c_hi == c_lo:
                return float(a_lo)
            return ((a_hi - a_lo) / (c_hi - c_lo)) * (concentration - c_lo) + a_lo
    # Above all breakpoints → cap at 500
    return 500.0


def _aqi_category(aqi: float) -> str:
    if aqi <= 50:   return "Good"
    if aqi <= 100:  return "Satisfactory"
    if aqi <= 200:  return "Moderate"
    if aqi <= 300:  return "Poor"
    if aqi <= 400:  return "Very Poor"
    return "Severe"


# ── CPCB AQI calculator (Open-Meteo field names) ──────────────────────────────
def calculate_aqi(pollutants: dict) -> dict:
    """
    Calculate CPCB AQI from Open-Meteo pollutant values.

    Parameters
    ----------
    pollutants : dict
        Keys expected (all concentrations in µg/m³ as returned by Open-Meteo):
          pm2_5, pm10, nitrogen_dioxide, sulphur_dioxide,
          carbon_monoxide (µg/m³ — converted to mg/m³ internally), ozone
        Missing or None values are skipped.

    Returns
    -------
    dict with keys:
        aqi               – int, overall AQI (max sub-index)
        aqi_category      – str, CPCB category label
        dominant_pollutant– str, human-readable name of the highest sub-index pollutant
        sub_indices       – dict mapping internal key → rounded int sub-index
    """
    # Map Open-Meteo field names → internal breakpoint keys + optional unit conversion
    # Each entry: (open_meteo_key, internal_key, scale_factor)
    _FIELD_MAP = [
        ("pm2_5",            "pm25", 1.0),
        ("pm10",             "pm10", 1.0),
        ("nitrogen_dioxide", "no2",  1.0),
        ("sulphur_dioxide",  "so2",  1.0),
        ("carbon_monoxide",  "co",   1e-3),   # µg/m³ → mg/m³
        ("ozone",            "o3",   1.0),
    ]

    sub_indices: dict[str, int] = {}

    for om_key, bp_key, scale in _FIELD_MAP:
        raw = pollutants.get(om_key)
        if raw is None:
            continue
        try:
            concentration = float(raw) * scale
        except (TypeError, ValueError):
            continue
        if concentration < 0:
            continue
        sub_indices[bp_key] = int(round(_sub_index(bp_key, concentration)))

    if not sub_indices:
        return {
            "aqi":                0,
            "aqi_category":       "Unknown",
            "dominant_pollutant": "N/A",
            "sub_indices":        {},
        }

    dominant_key = max(sub_indices, key=sub_indices.get)
    overall_aqi  = sub_indices[dominant_key]
    category     = _aqi_category(overall_aqi)

    return {
        "aqi":                overall_aqi,
        "aqi_category":       category,
        "dominant_pollutant": _LABELS[dominant_key],
        "sub_indices":        sub_indices,
    }


@app.route("/api/analyze-air-quality", methods=["POST"])
def analyze_air_quality():
    """
    Calculate AQI from individual pollutant concentrations.
    Body: { pm25, pm10, no2, so2, co, o3 }  — all numeric, non-negative.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"success": False, "message": "JSON body required."}), 400

    required = ["pm25", "pm10", "no2", "so2", "co", "o3"]
    errors = []
    values = {}

    for key in required:
        val = body.get(key)
        if val is None:
            errors.append(f"'{key}' is required.")
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            errors.append(f"'{key}' must be a numeric value.")
            continue
        if val < 0:
            errors.append(f"'{key}' must be non-negative (got {val}).")
            continue
        values[key] = val

    if errors:
        return jsonify({"success": False, "message": " | ".join(errors)}), 400

    # ── Calculate sub-index for every pollutant (CPCB linear interpolation) ──
    sub_indices = {
        k: int(round(_sub_index(k, v)))
        for k, v in values.items()
    }
    log.info("AQI sub-indices: %s", sub_indices)

    # ── Overall AQI = maximum sub-index (CPCB rule) ─────────────────────────
    dominant_key = max(sub_indices, key=sub_indices.get)
    overall_aqi  = sub_indices[dominant_key]
    category     = _aqi_category(overall_aqi)

    # Only include pollutants with a non-zero sub-index in the breakdown
    active_sub_indices = {k: v for k, v in sub_indices.items() if v > 0}

    log.info("AQI=%d  category=%s  dominant=%s", overall_aqi, category, _LABELS[dominant_key])

    return jsonify({
        "success":            True,
        "aqi":                overall_aqi,
        "category":           category,
        "dominant_pollutant": _LABELS[dominant_key],
        "health_advice":      _HEALTH[category],
        "sub_indices":        active_sub_indices,   # short keys: pm25, pm10 …
    }), 200


@app.route("/api/aqi-calculate", methods=["POST"])
def aqi_calculate():
    """
    Calculate CPCB AQI from manually entered pollutant concentrations.

    Body: { pm25, pm10, no2, so2, co, o3 }  — all numeric, non-negative.

    Returns:
    {
      "success": true,
      "aqi": 312,
      "category": "Very Poor",
      "dominant_pollutant": "PM2.5",
      "health_advice": "...",
      "sub_indices": { "pm25": 312, "pm10": 180, ... }
    }
    """
    _HEALTH_ADVICE = {
        "Good":        "Air quality is satisfactory. Enjoy outdoor activities.",
        "Satisfactory":"Air quality is acceptable. Unusually sensitive people should consider reducing prolonged outdoor exertion.",
        "Moderate":    "Members of sensitive groups may experience health effects. The general public is less likely to be affected.",
        "Poor":        "Everyone may begin to experience health effects. Members of sensitive groups may experience more serious effects.",
        "Very Poor":   "Health alert: everyone may experience more serious health effects. Avoid prolonged outdoor exertion.",
        "Severe":      "Health warning of emergency conditions. The entire population is likely to be affected. Stay indoors.",
    }

    body = request.get_json(silent=True)
    if not body:
        return jsonify({"success": False, "message": "JSON body required."}), 400

    required = ["pm25", "pm10", "no2", "so2", "co", "o3"]
    errors = []
    values = {}

    for key in required:
        val = body.get(key)
        if val is None:
            errors.append(f"'{key}' is required.")
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            errors.append(f"'{key}' must be a numeric value.")
            continue
        if val < 0:
            errors.append(f"'{key}' must be non-negative (got {val}).")
            continue
        values[key] = val

    if errors:
        return jsonify({"success": False, "message": " | ".join(errors)}), 400

    # Calculate sub-index for every pollutant using CPCB linear interpolation
    sub_indices = {
        k: int(round(_sub_index(k, v)))
        for k, v in values.items()
    }
    log.info("AQI sub-indices (aqi-calculate): %s", sub_indices)

    # Overall AQI = maximum sub-index (CPCB rule)
    dominant_key = max(sub_indices, key=sub_indices.get)
    overall_aqi  = sub_indices[dominant_key]
    category     = _aqi_category(overall_aqi)

    log.info("AQI=%d  category=%s  dominant=%s", overall_aqi, category, _LABELS[dominant_key])

    return jsonify({
        "success":            True,
        "aqi":                overall_aqi,
        "category":           category,
        "dominant_pollutant": _LABELS[dominant_key],
        "health_advice":      _HEALTH_ADVICE[category],
        "sub_indices":        sub_indices,
    }), 200


# ── Air Quality (Open-Meteo) ──────────────────────────────────────────────────
OPEN_METEO_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

# Pollutants to request from Open-Meteo
_OPEN_METEO_POLLUTANTS = [
    "pm10", "pm2_5", "carbon_monoxide", "nitrogen_dioxide",
    "sulphur_dioxide", "ozone", "ammonia", "uv_index",
    "uv_index_clear_sky", "dust",
]


@app.route("/api/air-quality", methods=["GET"])
def get_air_quality():
    """
    Fetch live air quality data from Open-Meteo for a given location.

    Query params:
      lat  (float, required) — latitude
      lon  (float, required) — longitude
      city (str,   optional) — city name label for the response

    Returns current pollutant readings and hourly trend data.
    AQI is calculated using the CPCB standard via calculate_aqi().
    """
    # ── 1. Parse & validate query params ─────────────────────────────────────
    lat_str  = request.args.get("lat")
    lon_str  = request.args.get("lon")
    city     = request.args.get("city", "Unknown")

    if not lat_str or not lon_str:
        return jsonify({
            "success": False,
            "message": "Both 'lat' and 'lon' query parameters are required.",
        }), 400

    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except ValueError:
        return jsonify({
            "success": False,
            "message": "'lat' and 'lon' must be valid numbers.",
        }), 400

    if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return jsonify({
            "success": False,
            "message": "Latitude must be in [-90, 90] and longitude in [-180, 180].",
        }), 400

    # ── 2. Call Open-Meteo API ────────────────────────────────────────────────
    pollutants_csv = ",".join(_OPEN_METEO_POLLUTANTS)
    params = {
        "latitude":  lat,
        "longitude": lon,
        "current":   pollutants_csv,
        "hourly":    pollutants_csv,
        "timezone":  "auto",
    }

    try:
        resp = http_requests.get(OPEN_METEO_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except http_requests.exceptions.Timeout:
        log.error("Open-Meteo request timed out for lat=%s lon=%s", lat, lon)
        return jsonify({
            "success": False,
            "message": "Request to Open-Meteo timed out. Please try again.",
        }), 504
    except http_requests.exceptions.ConnectionError as exc:
        log.error("Open-Meteo connection error: %s", exc)
        return jsonify({
            "success": False,
            "message": "Could not connect to Open-Meteo API.",
        }), 502
    except http_requests.exceptions.HTTPError as exc:
        log.error("Open-Meteo HTTP error: %s", exc)
        return jsonify({
            "success": False,
            "message": f"Open-Meteo API returned an error: {resp.status_code}",
        }), 502
    except Exception as exc:
        log.exception("Unexpected error calling Open-Meteo")
        return jsonify({
            "success": False,
            "message": f"Unexpected error fetching air quality data: {exc}",
        }), 500

    # ── 3. Extract current readings ───────────────────────────────────────────
    current_raw = data.get("current", {})

    def _safe_float(val):
        """Return float or None for missing/NaN values."""
        if val is None:
            return None
        try:
            f = float(val)
            return None if math.isnan(f) or math.isinf(f) else round(f, 4)
        except (TypeError, ValueError):
            return None

    current = {
        "pm2_5":             _safe_float(current_raw.get("pm2_5")),
        "pm10":              _safe_float(current_raw.get("pm10")),
        "nitrogen_dioxide":  _safe_float(current_raw.get("nitrogen_dioxide")),
        "sulphur_dioxide":   _safe_float(current_raw.get("sulphur_dioxide")),
        "carbon_monoxide":   _safe_float(current_raw.get("carbon_monoxide")),
        "ozone":             _safe_float(current_raw.get("ozone")),
        "ammonia":           _safe_float(current_raw.get("ammonia")),
        "uv_index":          _safe_float(current_raw.get("uv_index")),
        "uv_index_clear_sky":_safe_float(current_raw.get("uv_index_clear_sky")),
        "dust":              _safe_float(current_raw.get("dust")),
    }

    # ── 4. Extract hourly data ────────────────────────────────────────────────
    hourly_raw = data.get("hourly", {})
    hourly_times = hourly_raw.get("time", [])

    hourly = {"time": hourly_times}
    for pollutant in _OPEN_METEO_POLLUTANTS:
        raw_values = hourly_raw.get(pollutant, [])
        hourly[pollutant] = [_safe_float(v) for v in raw_values]

    # ── 5. Calculate CPCB AQI from current pollutant readings ────────────────
    aqi_result = calculate_aqi(current)
    log.info(
        "Air quality fetched for %s (lat=%.4f, lon=%.4f): PM2.5=%.2f, PM10=%.2f, AQI=%d (%s)",
        city, lat, lon,
        current.get("pm2_5") or 0,
        current.get("pm10") or 0,
        aqi_result["aqi"],
        aqi_result["aqi_category"],
    )

    return jsonify({
        "success":            True,
        "city":               city,
        "latitude":           lat,
        "longitude":          lon,
        "current":            current,
        "aqi":                aqi_result["aqi"],
        "aqi_category":       aqi_result["aqi_category"],
        "dominant_pollutant": aqi_result["dominant_pollutant"],
        "sub_indices":        aqi_result["sub_indices"],
        "hourly":             hourly,
    }), 200


# ── Cities ───────────────────────────────────────────────────────────────────
# 30 major Indian cities with lat/lon within India's geographic bounds
# (lat: 8–37°N, lon: 68–97°E) per CPCB/CP-2 correctness property.
INDIAN_CITIES = [
    {"name": "Dharwad",        "lat": 15.4589, "lon": 75.0078, "state": "Karnataka"},
    {"name": "Delhi",          "lat": 28.6139, "lon": 77.2090, "state": "Delhi"},
    {"name": "Mumbai",         "lat": 19.0760, "lon": 72.8777, "state": "Maharashtra"},
    {"name": "Bangalore",      "lat": 12.9716, "lon": 77.5946, "state": "Karnataka"},
    {"name": "Chennai",        "lat": 13.0827, "lon": 80.2707, "state": "Tamil Nadu"},
    {"name": "Kolkata",        "lat": 22.5726, "lon": 88.3639, "state": "West Bengal"},
    {"name": "Hyderabad",      "lat": 17.3850, "lon": 78.4867, "state": "Telangana"},
    {"name": "Pune",           "lat": 18.5204, "lon": 73.8567, "state": "Maharashtra"},
    {"name": "Ahmedabad",      "lat": 23.0225, "lon": 72.5714, "state": "Gujarat"},
    {"name": "Jaipur",         "lat": 26.9124, "lon": 75.7873, "state": "Rajasthan"},
    {"name": "Lucknow",        "lat": 26.8467, "lon": 80.9462, "state": "Uttar Pradesh"},
    {"name": "Kanpur",         "lat": 26.4499, "lon": 80.3319, "state": "Uttar Pradesh"},
    {"name": "Nagpur",         "lat": 21.1458, "lon": 79.0882, "state": "Maharashtra"},
    {"name": "Indore",         "lat": 22.7196, "lon": 75.8577, "state": "Madhya Pradesh"},
    {"name": "Bhopal",         "lat": 23.2599, "lon": 77.4126, "state": "Madhya Pradesh"},
    {"name": "Patna",          "lat": 25.5941, "lon": 85.1376, "state": "Bihar"},
    {"name": "Surat",          "lat": 21.1702, "lon": 72.8311, "state": "Gujarat"},
    {"name": "Vadodara",       "lat": 22.3072, "lon": 73.1812, "state": "Gujarat"},
    {"name": "Coimbatore",     "lat": 11.0168, "lon": 76.9558, "state": "Tamil Nadu"},
    {"name": "Kochi",          "lat": 9.9312,  "lon": 76.2673, "state": "Kerala"},
    {"name": "Visakhapatnam",  "lat": 17.6868, "lon": 83.2185, "state": "Andhra Pradesh"},
    {"name": "Agra",           "lat": 27.1767, "lon": 78.0081, "state": "Uttar Pradesh"},
    {"name": "Varanasi",       "lat": 25.3176, "lon": 82.9739, "state": "Uttar Pradesh"},
    {"name": "Meerut",         "lat": 28.9845, "lon": 77.7064, "state": "Uttar Pradesh"},
    {"name": "Rajkot",         "lat": 22.3039, "lon": 70.8022, "state": "Gujarat"},
    {"name": "Amritsar",       "lat": 31.6340, "lon": 74.8723, "state": "Punjab"},
    {"name": "Chandigarh",     "lat": 30.7333, "lon": 76.7794, "state": "Chandigarh"},
    {"name": "Guwahati",       "lat": 26.1445, "lon": 91.7362, "state": "Assam"},
    {"name": "Bhubaneswar",    "lat": 20.2961, "lon": 85.8245, "state": "Odisha"},
    {"name": "Thiruvananthapuram", "lat": 8.5241, "lon": 76.9366, "state": "Kerala"},
    {"name": "Dehradun",       "lat": 30.3165, "lon": 78.0322, "state": "Uttarakhand"},
]


@app.route("/api/cities", methods=["GET"])
def get_cities():
    """
    Return a list of major Indian cities with their lat/lon coordinates.
    All coordinates are within India's geographic bounds (lat: 8–37°N, lon: 68–97°E).
    Returns a plain array so the frontend can use it directly.
    """
    return jsonify(INDIAN_CITIES), 200


# ── Chat (RAG) ────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    """
    RAG-powered health advisory chatbot endpoint.

    Request JSON:
      {
        "message":  str  (required) — user's question
        "city":     str  (optional) — city name for context
        "aqi_data": dict (optional) — live AQI data dict
      }

    Response JSON:
      {
        "success": true,
        "answer":  str,
        "sources": [str]
      }
    """
    global _rag_index_built

    # ── Check RAG availability ────────────────────────────────────────────────
    if not RAG_AVAILABLE:
        return jsonify({
            "success": False,
            "message": (
                "The RAG chatbot is not available because required dependencies "
                "(sentence-transformers, faiss-cpu, PyMuPDF) are not installed. "
                "Run: pip install sentence-transformers faiss-cpu PyMuPDF"
            ),
        }), 503

    # ── Parse request body ────────────────────────────────────────────────────
    body = request.get_json(force=True, silent=True) or {}
    message  = body.get("message", "").strip()
    aqi_data = body.get("aqi_data") or {}

    # Validate required field
    if not message:
        return jsonify({
            "success": False,
            "message": "'message' is required and must be a non-empty string.",
        }), 400

    # ── Lazy-build FAISS index on first request (task 2.6) ───────────────────
    if not _rag_index_built:
        log.info("Building FAISS index for the first time (lazy-load) …")
        try:
            build_index()
            _rag_index_built = True
            log.info("FAISS index built successfully.")
        except Exception as exc:
            log.error("Failed to build FAISS index: %s", exc)
            return jsonify({
                "success": False,
                "message": f"Failed to build knowledge-base index: {exc}",
            }), 500

    # ── Retrieve relevant chunks ──────────────────────────────────────────────
    try:
        chunks = retrieve_chunks(message, k=5)
    except Exception as exc:
        log.error("retrieve_chunks error: %s", exc)
        chunks = []

    # ── Generate answer ───────────────────────────────────────────────────────
    try:
        result = generate_answer(message, aqi_data, chunks)
    except Exception as exc:
        log.error("generate_answer error: %s", exc)
        return jsonify({
            "success": False,
            "message": f"Error generating answer: {exc}",
        }), 500

    return jsonify({
        "success": True,
        "answer":  result.get("answer", ""),
        "sources": result.get("sources", []),
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# Anomaly Detection Routes
# ─────────────────────────────────────────────────────────────────────────────
try:
    from anomaly_detector import detect_anomaly, train_anomaly_model, load_anomaly_model
    from anomaly_db import (
        init_db, insert_anomaly, resolve_anomaly, mark_false_positive,
        get_recent_anomalies, get_active_anomalies, resolve_city_anomalies,
        upsert_fcm_token, get_tokens_for_city,
    )
    from fcm_notifier import send_anomaly_alert
    init_db()
    load_anomaly_model()
    ANOMALY_AVAILABLE = True
    log.info("Anomaly detection module loaded.")
except Exception as _anom_err:
    ANOMALY_AVAILABLE = False
    log.warning("Anomaly module unavailable: %s", _anom_err)


def _anomaly_unavailable():
    return jsonify({"success": False, "message": "Anomaly module not available."}), 503


@app.route("/api/anomalies/train", methods=["POST"])
def anomaly_train():
    """Train the anomaly detection model on the latest uploaded CSV."""
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()
    csv_path = _latest_csv()
    if not csv_path:
        return jsonify({"success": False, "message": "No dataset found."}), 404
    try:
        df = pd.read_csv(csv_path)
        # Normalise column names to what anomaly_detector expects
        raw_pm25 = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
        raw_date = _detect_col(df.columns.tolist(), DATE_CANDIDATES)
        if not raw_pm25 or not raw_date:
            return jsonify({"success": False, "message": "Cannot detect PM2.5 or datetime column."}), 400
        df = df.rename(columns={raw_pm25: "PM2.5", raw_date: "datetime"})
        summary = train_anomaly_model(df)
        return jsonify({"success": True, **summary}), 200
    except Exception as exc:
        log.exception("Anomaly training error")
        return jsonify({"success": False, "message": str(exc)}), 500


@app.route("/api/anomalies", methods=["GET"])
def anomalies_list():
    """GET /api/anomalies?city=Delhi&days=7"""
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()
    city = request.args.get("city", "Delhi")
    days = int(request.args.get("days", 7))
    events = get_recent_anomalies(city=city, days=days)
    return jsonify({"success": True, "count": len(events), "anomalies": events}), 200


@app.route("/api/anomalies/active", methods=["GET"])
def anomalies_active():
    """GET /api/anomalies/active?city=Delhi"""
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()
    city   = request.args.get("city") or None
    events = get_active_anomalies(city=city)
    return jsonify({"success": True, "count": len(events), "anomalies": events}), 200


@app.route("/api/anomalies/check", methods=["POST"])
def anomalies_check():
    """
    POST /api/anomalies/check
    Body: {
      "city": "Delhi",
      "pm25": 340,
      "datetime": "2024-11-12T20:00:00Z",   // optional, defaults to now
      "PM10": 420, "NO2": 95, "SO2": 45,
      "wind_speed": 1.2, "wind_direction": 310, "humidity": 85
    }
    """
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()

    body = request.get_json(force=True, silent=True) or {}
    city = body.get("city", "Delhi")

    pm25_val = body.get("pm25") or body.get("PM2.5")
    if pm25_val is None:
        return jsonify({"success": False, "message": "'pm25' is required."}), 400
    pm25_val = float(pm25_val)

    dt_str = body.get("datetime")
    from datetime import datetime, timezone
    dt = pd.to_datetime(dt_str, utc=True).to_pydatetime() if dt_str else datetime.now(timezone.utc)

    extra = {
        k: body.get(k)
        for k in ("PM10", "NO2", "SO2", "CO", "wind_speed", "wind_direction", "humidity", "temperature")
    }

    result = detect_anomaly(pm25_val, dt, extra)

    event_id = None
    if result["is_anomaly"]:
        event_id = insert_anomaly(
            city=city,
            pollutant="PM2.5",
            observed_value=pm25_val,
            expected_value=result["expected_value"],
            anomaly_score=result["anomaly_score"],
            cause_label=result["cause_label"],
            cause_confidence=result["cause_confidence"],
            explanation=result["explanation"],
        )
        # Push notification
        tokens = get_tokens_for_city(city)
        if tokens:
            send_anomaly_alert(
                tokens=tokens,
                city=city,
                cause_label=result["cause_label"],
                cause_confidence=result["cause_confidence"],
                observed_aqi=pm25_val,
                expected_aqi=result["expected_value"],
            )
    else:
        # Resolve any open anomalies if values are back to normal
        resolve_city_anomalies(city)

    return jsonify({"success": True, "event_id": event_id, **result}), 200


@app.route("/api/anomalies/<int:anomaly_id>/resolve", methods=["POST"])
def anomaly_resolve(anomaly_id):
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()
    resolve_anomaly(anomaly_id)
    return jsonify({"success": True}), 200


@app.route("/api/anomalies/<int:anomaly_id>/false-positive", methods=["POST"])
def anomaly_false_positive(anomaly_id):
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()
    mark_false_positive(anomaly_id)
    return jsonify({"success": True}), 200


@app.route("/api/fcm-token", methods=["POST"])
def register_fcm_token():
    """POST /api/fcm-token  Body: {user_id, city, token}"""
    if not ANOMALY_AVAILABLE:
        return _anomaly_unavailable()
    body = request.get_json(force=True, silent=True) or {}
    user_id = body.get("user_id", "anonymous")
    city    = body.get("city", "Delhi")
    token   = body.get("token", "")
    if not token:
        return jsonify({"success": False, "message": "'token' is required."}), 400
    upsert_fcm_token(user_id, city, token)
    return jsonify({"success": True}), 200


# ── Error handlers ────────────────────────────────────────────────────────────
@app.errorhandler(413)
def request_entity_too_large(_):
    return jsonify({"success": False,
                    "message": f"File too large. Max {MAX_UPLOAD_MB} MB."}), 413


if __name__ == "__main__":
    from reports_db import run_migrations
    run_migrations()
    init_scheduler()
    app.run(debug=True, host="0.0.0.0", port=5000)

