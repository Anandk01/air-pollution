"""
app_render.py
=============
Render-compatible entry point.

Differences from app.py:
  - Reads GEE and FCM credentials from environment variable JSON strings
    instead of file paths (Render has no persistent disk on free plan).
  - Writes credential JSON to /tmp at startup so existing code works unchanged.
  - DATABASE_URL env var is used if set (for future PostgreSQL upgrade).
"""

import os
import json
import tempfile

# ── Write GEE service account JSON from env var ───────────────────────────────
_gee_json_str = os.getenv("GEE_SERVICE_ACCOUNT_JSON")
if _gee_json_str:
    _gee_tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(json.loads(_gee_json_str), _gee_tmp)
    _gee_tmp.close()
    os.environ["GEE_SERVICE_ACCOUNT_FILE"] = _gee_tmp.name

# ── Write FCM service account JSON from env var ───────────────────────────────
_fcm_json_str = os.getenv("FCM_SERVICE_ACCOUNT_JSON")
if _fcm_json_str:
    _fcm_tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(json.loads(_fcm_json_str), _fcm_tmp)
    _fcm_tmp.close()
    os.environ["FCM_SERVICE_ACCOUNT_PATH"] = _fcm_tmp.name

# ── Now import the real app ───────────────────────────────────────────────────
from app import app  # noqa: F401  (re-exported for gunicorn)
