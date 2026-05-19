"""
auth_api.py
===========
Authentication blueprint: register, verify OTP, login, token validation.

Security notes:
- OTP generated with secrets.randbelow (CSPRNG)
- Passwords hashed with werkzeug (bcrypt-backed)
- OTP comparison uses hmac.compare_digest (constant-time)
- Tokens signed with itsdangerous (30-day expiry)
- dev_otp only returned when MAIL_USERNAME is not configured
"""

import os
import json
import uuid
import hmac
import secrets
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from reports_db import get_db

log = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY   = os.environ.get("SECRET_KEY", "")
MAIL_SERVER  = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
MAIL_PORT    = int(os.environ.get("MAIL_PORT", 587))
MAIL_USER    = os.environ.get("MAIL_USERNAME", "")
MAIL_PASS    = os.environ.get("MAIL_PASSWORD", "")
OTP_TTL_MIN  = 15
TOKEN_TTL_S  = 86400 * 30  # 30 days

if not SECRET_KEY:
    log.warning("SECRET_KEY not set in .env — using insecure fallback. Set it in production.")
    SECRET_KEY = "dev-insecure-fallback-key"

_serializer = URLSafeTimedSerializer(SECRET_KEY)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_otp() -> str:
    """6-digit OTP using a cryptographically secure RNG."""
    return f"{secrets.randbelow(900000) + 100000}"


def _make_token(user_id: str) -> str:
    return _serializer.dumps(user_id, salt="auth-token")


def _decode_token(token: str) -> str | None:
    """Returns user_id or None if invalid/expired."""
    try:
        return _serializer.loads(token, salt="auth-token", max_age=TOKEN_TTL_S)
    except (BadSignature, SignatureExpired):
        return None


def _send_otp_email(to: str, otp: str) -> bool:
    if not MAIL_USER or not MAIL_PASS:
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["From"]    = MAIL_USER
        msg["To"]      = to
        msg["Subject"] = "AirSight — Your Verification Code"
        html = f"""
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                    background:#0f172a;color:#f1f5f9;border-radius:16px">
          <h2 style="color:#38bdf8;margin:0 0 8px">AirSight</h2>
          <p style="color:#94a3b8;margin:0 0 24px">Air Quality Intelligence</p>
          <p style="margin:0 0 16px">Your verification code is:</p>
          <div style="font-size:36px;font-weight:900;letter-spacing:12px;
                      color:#38bdf8;background:#1e293b;padding:20px;
                      border-radius:12px;text-align:center">{otp}</div>
          <p style="color:#64748b;font-size:13px;margin:20px 0 0">
            Expires in {OTP_TTL_MIN} minutes. Do not share this code.
          </p>
        </div>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(MAIL_SERVER, MAIL_PORT, timeout=10) as srv:
            srv.starttls()
            srv.login(MAIL_USER, MAIL_PASS)
            srv.send_message(msg)
        return True
    except Exception as exc:
        log.error("OTP email failed to %s: %s", to, exc)
        return False


def _get_token_from_header() -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def _require_auth():
    """Returns (user_id, None) or (None, error_response)."""
    token = _get_token_from_header()
    if not token:
        return None, (jsonify({"error": "Missing Authorization header"}), 401)
    user_id = _decode_token(token)
    if not user_id:
        return None, (jsonify({"error": "Invalid or expired token"}), 401)
    return user_id, None


def _validate_register(email: str, password: str) -> str | None:
    """Returns an error message or None if valid."""
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        return "A valid email address is required."
    if not password or len(password) < 8:
        return "Password must be at least 8 characters."
    if len(password) > 128:
        return "Password is too long."
    return None


# ── Routes ────────────────────────────────────────────────────────────────────

@auth_bp.route("/register", methods=["POST"])
def register():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    err = _validate_register(email, password)
    if err:
        return jsonify({"error": err}), 400

    try:
        with get_db() as conn:
            if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                return jsonify({"error": "An account with this email already exists."}), 409

            user_id    = str(uuid.uuid4())
            pw_hash    = generate_password_hash(password)
            otp        = _generate_otp()
            otp_expiry = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MIN)).isoformat()

            conn.execute(
                "INSERT INTO users (id, email, password_hash, otp, otp_expiry) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, pw_hash, otp, otp_expiry),
            )

        email_sent = _send_otp_email(email, otp)
        if not email_sent:
            log.info("DEV OTP for %s: %s", email, otp)

        resp = {
            "message":    "Registration successful. Please verify your email.",
            "user_id":    user_id,
            "email_sent": email_sent,
        }
        # Only expose OTP in dev mode (no mail configured)
        if not MAIL_USER:
            resp["dev_otp"] = otp

        return jsonify(resp), 201

    except Exception:
        log.exception("Registration error for %s", email)
        return jsonify({"error": "Registration failed. Please try again."}), 500


@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data    = request.get_json(silent=True) or {}
    user_id = (data.get("user_id") or "").strip()
    otp     = (data.get("otp") or "").strip()

    if not user_id or not otp:
        return jsonify({"error": "user_id and otp are required."}), 400

    try:
        with get_db() as conn:
            user = conn.execute(
                "SELECT otp, otp_expiry, is_verified FROM users WHERE id = ?", (user_id,)
            ).fetchone()

            if not user:
                return jsonify({"error": "Account not found."}), 404

            if user["is_verified"]:
                return jsonify({"error": "Account is already verified."}), 409

            if not user["otp"] or not user["otp_expiry"]:
                return jsonify({"error": "No pending verification. Please register again."}), 400

            # Constant-time comparison prevents timing attacks
            if not hmac.compare_digest(user["otp"], otp):
                return jsonify({"error": "Invalid verification code."}), 401

            now = datetime.now(timezone.utc).isoformat()
            if user["otp_expiry"] < now:
                return jsonify({"error": "Verification code has expired. Please register again."}), 401

            conn.execute(
                "UPDATE users SET is_verified = 1, otp = NULL, otp_expiry = NULL WHERE id = ?",
                (user_id,),
            )

        token = _make_token(user_id)
        return jsonify({"message": "Account verified successfully.", "token": token}), 200

    except Exception:
        log.exception("OTP verification error for user_id=%s", user_id)
        return jsonify({"error": "Verification failed. Please try again."}), 500


@auth_bp.route("/login", methods=["POST"])
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    try:
        with get_db() as conn:
            user = conn.execute(
                "SELECT id, password_hash, is_verified FROM users WHERE email = ?", (email,)
            ).fetchone()

            # Always run check_password_hash even on missing user to prevent timing attacks
            dummy_hash = "pbkdf2:sha256:260000$x$" + "a" * 64
            pw_ok = check_password_hash(
                user["password_hash"] if user else dummy_hash, password
            )

            if not user or not pw_ok:
                return jsonify({"error": "Invalid email or password."}), 401

            if not user["is_verified"]:
                return jsonify({
                    "error":            "Please verify your email before logging in.",
                    "needs_verification": True,
                    "user_id":          user["id"],
                }), 403

            has_profile = bool(
                conn.execute(
                    "SELECT 1 FROM user_profiles WHERE user_id = ?", (user["id"],)
                ).fetchone()
            )

        token = _make_token(user["id"])
        return jsonify({
            "message":     "Login successful.",
            "token":       token,
            "user_id":     user["id"],
            "has_profile": has_profile,
        }), 200

    except Exception:
        log.exception("Login error for %s", email)
        return jsonify({"error": "Login failed. Please try again."}), 500


@auth_bp.route("/resend-otp", methods=["POST"])
def resend_otp():
    data    = request.get_json(silent=True) or {}
    user_id = (data.get("user_id") or "").strip()

    if not user_id:
        return jsonify({"error": "user_id is required."}), 400

    try:
        with get_db() as conn:
            user = conn.execute(
                "SELECT email, is_verified FROM users WHERE id = ?", (user_id,)
            ).fetchone()

            if not user:
                return jsonify({"error": "Account not found."}), 404
            if user["is_verified"]:
                return jsonify({"error": "Account is already verified."}), 409

            otp        = _generate_otp()
            otp_expiry = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MIN)).isoformat()
            conn.execute(
                "UPDATE users SET otp = ?, otp_expiry = ? WHERE id = ?",
                (otp, otp_expiry, user_id),
            )

        email_sent = _send_otp_email(user["email"], otp)
        if not email_sent:
            log.info("DEV resend OTP for %s: %s", user["email"], otp)

        resp = {"message": "New verification code sent.", "email_sent": email_sent}
        if not MAIL_USER:
            resp["dev_otp"] = otp
        return jsonify(resp), 200

    except Exception:
        log.exception("Resend OTP error for user_id=%s", user_id)
        return jsonify({"error": "Failed to resend code. Please try again."}), 500


@auth_bp.route("/me", methods=["GET"])
def me():
    """Validate token and return basic user info."""
    user_id, err = _require_auth()
    if err:
        return err

    try:
        with get_db() as conn:
            user = conn.execute(
                "SELECT id, email, is_verified, created_at FROM users WHERE id = ?", (user_id,)
            ).fetchone()
            if not user:
                return jsonify({"error": "User not found."}), 404
            has_profile = bool(
                conn.execute("SELECT 1 FROM user_profiles WHERE user_id = ?", (user_id,)).fetchone()
            )
        return jsonify({
            "id":          user["id"],
            "email":       user["email"],
            "is_verified": bool(user["is_verified"]),
            "has_profile": has_profile,
            "created_at":  user["created_at"],
        }), 200
    except Exception:
        log.exception("me() error for user_id=%s", user_id)
        return jsonify({"error": "Failed to fetch user info."}), 500
