import os
import json
import uuid
import logging
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from werkzeug.security import generate_password_hash, check_password_hash
from itsdangerous import URLSafeTimedSerializer

from reports_db import get_db

log = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

# Config from .env
MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")

def send_otp_email(target_email, otp):
    if not MAIL_USERNAME or not MAIL_PASSWORD:
        log.warning("Mail credentials not set in .env. Skipping real email.")
        return False
        
    try:
        msg = MIMEMultipart()
        msg['From'] = MAIL_USERNAME
        msg['To'] = target_email
        msg['Subject'] = "AirSight - Your Verification Code"
        
        body = f"Your verification code is: {otp}\n\nThis code expires in 15 minutes."
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(MAIL_SERVER, MAIL_PORT)
        server.starttls()
        server.login(MAIL_USERNAME, MAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        log.error(f"Failed to send email: {e}")
        return False

# Very basic secret key handling. In production, use a secure env var.
SECRET_KEY = os.environ.get("SECRET_KEY", "super-secret-dev-key")
serializer = URLSafeTimedSerializer(SECRET_KEY)

def generate_otp():
    """Generates a 6-digit OTP."""
    import random
    return str(random.randint(100000, 999999))

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
        
    try:
        with get_db() as conn:
            # Check if user exists
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if existing:
                return jsonify({"error": "Email already registered"}), 409
                
            user_id = str(uuid.uuid4())
            pw_hash = generate_password_hash(password)
            otp = generate_otp()
            otp_expiry = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
            
            conn.execute(
                """INSERT INTO users (id, email, password_hash, otp, otp_expiry) 
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, email, pw_hash, otp, otp_expiry)
            )
            
            # If mail is configured, it MUST succeed
            email_sent = send_otp_email(email, otp)
            
            if MAIL_USERNAME and not email_sent:
                # If credentials exist but sending failed, we should probably rollback or warn
                return jsonify({"error": "Failed to send verification email. Please check server logs or mail credentials."}), 500
            
            # For development, we'll log it (if email fails)
            log.info(f"Generated OTP for {email}: {otp}")
            
            return jsonify({
                "message": "Registration successful. Please verify OTP.",
                "user_id": user_id,
                "email_sent": email_sent,
                "dev_otp": otp if not email_sent else None 
            }), 201
    except Exception as e:
        log.error(f"Registration error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data = request.json
    user_id = data.get("user_id")
    otp = data.get("otp")
    
    if not user_id or not otp:
        return jsonify({"error": "User ID and OTP required"}), 400
        
    try:
        with get_db() as conn:
            user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if not user:
                return jsonify({"error": "User not found"}), 404
                
            now = datetime.now(timezone.utc).isoformat()
            
            if user["otp"] != otp:
                return jsonify({"error": "Invalid OTP"}), 401
                
            if user["otp_expiry"] < now:
                return jsonify({"error": "OTP expired"}), 401
                
            # Valid OTP, mark verified
            conn.execute(
                "UPDATE users SET is_verified = 1, otp = NULL, otp_expiry = NULL WHERE id = ?",
                (user_id,)
            )
            
            # Generate a session token
            token = serializer.dumps(user_id, salt="auth-salt")
            
            return jsonify({
                "message": "Account verified",
                "token": token
            })
    except Exception as e:
        log.error(f"OTP verification error: {e}")
        return jsonify({"error": "Internal server error"}), 500

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email")
    password = data.get("password")
    
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials"}), 401
            
        if not user["is_verified"]:
            return jsonify({"error": "Please verify your account first", "user_id": user["id"], "needs_verification": True}), 403
            
        token = serializer.dumps(user["id"], salt="auth-salt")
        
        # Check if profile exists
        profile = conn.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user["id"],)).fetchone()
        
        return jsonify({
            "message": "Login successful",
            "token": token,
            "has_profile": bool(profile),
            "user_id": user["id"]
        })

@auth_bp.route("/profile", methods=["POST", "GET"])
def handle_profile():
    # In a real app, you would extract the user_id from the authorization token header
    # For simplicity, we are expecting it in the body/args for now, or you can pass token
    token = request.headers.get("Authorization")
    if not token:
        return jsonify({"error": "Missing token"}), 401
        
    try:
        token = token.replace("Bearer ", "")
        user_id = serializer.loads(token, salt="auth-salt", max_age=86400 * 30) # 30 days
    except Exception:
        return jsonify({"error": "Invalid or expired token"}), 401

    if request.method == "GET":
        with get_db() as conn:
            profile = conn.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)).fetchone()
            if not profile:
                return jsonify({"error": "Profile not found"}), 404
            
            p_dict = dict(profile)
            p_dict["health_conditions"] = json.loads(p_dict["health_conditions"])
            p_dict["home_location"] = json.loads(p_dict["home_location"]) if p_dict["home_location"] else None
            p_dict["saved_locations"] = json.loads(p_dict["saved_locations"])
            
            return jsonify(p_dict)
            
    elif request.method == "POST":
        data = request.json
        name = data.get("name")
        age = data.get("age")
        gender = data.get("gender")
        weight_kg = data.get("weight_kg")
        height_cm = data.get("height_cm")
        smoker = data.get("smoker", False)
        conditions = json.dumps(data.get("health_conditions", []))
        home_loc = json.dumps(data.get("home_location", {}))
        saved_locs = json.dumps(data.get("saved_locations", []))
        
        # Calculate AQI threshold based on conditions
        threshold = 150
        cond_list = data.get("health_conditions", [])
        if "Asthma" in cond_list or "Heart disease" in cond_list or "COPD" in cond_list:
            threshold = 85
        elif "Pregnant" in cond_list or "Allergies" in cond_list:
            threshold = 100
            
        with get_db() as conn:
            # Upsert
            existing = conn.execute("SELECT 1 FROM user_profiles WHERE user_id = ?", (user_id,)).fetchone()
            if existing:
                conn.execute("""
                    UPDATE user_profiles 
                    SET name=?, age=?, gender=?, weight_kg=?, height_cm=?, smoker=?, 
                        health_conditions=?, home_location=?, saved_locations=?, calculated_aqi_threshold=?, updated_at=?
                    WHERE user_id=?
                """, (name, age, gender, weight_kg, height_cm, smoker, conditions, home_loc, saved_locs, threshold, datetime.now(timezone.utc).isoformat(), user_id))
            else:
                conn.execute("""
                    INSERT INTO user_profiles 
                    (user_id, name, age, gender, weight_kg, height_cm, smoker, health_conditions, home_location, saved_locations, calculated_aqi_threshold)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, name, age, gender, weight_kg, height_cm, smoker, conditions, home_loc, saved_locs, threshold))
                
        return jsonify({"message": "Profile saved successfully", "threshold": threshold})
