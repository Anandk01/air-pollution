import json
import logging
import io
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_file
from auth_api import serializer
from reports_db import get_db
from threshold_calculator import calculate_personal_threshold
from report_card_generator import generate_report_card

log = logging.getLogger(__name__)

profile_bp = Blueprint("profile", __name__)

def get_user_id(req):
    token = req.headers.get("Authorization")
    if not token:
        return "guest_user" # Temporarily returning guest user
    try:
        token = token.replace("Bearer ", "")
        if token == "null" or token == "undefined": return "guest_user"
        return serializer.loads(token, salt="auth-salt", max_age=86400 * 30)
    except Exception:
        return "guest_user"

@profile_bp.route("/", methods=["GET"])
def get_profile():
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    with get_db() as conn:
        # Fetch basic profile
        profile = conn.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)).fetchone()
        
        if not profile and user_id == "guest_user":
            # Return a default guest profile
            return jsonify({
                "profile": {"full_name": "Guest User", "age": 25, "gender": "Other", "weight_kg": 70, "height_cm": 170, "bmi": 24.2, "is_smoker": False},
                "health_conditions": [],
                "locations": {"home": {"address": "Delhi", "lat": 28.6139, "lon": 77.2090, "city": "Delhi"}},
                "activities": [],
                "personal_aqi_threshold": 150.0
            })
            
        if not profile:
            return jsonify({"error": "Profile not found"}), 404
        
        # Fetch health conditions
        conditions = conn.execute("""
            SELECT hc.id, hc.condition_name as name, hc.icon_name as icon
            FROM user_health_conditions uhc
            JOIN health_conditions hc ON uhc.condition_id = hc.id
            WHERE uhc.user_id = ?
        """, (user_id,)).fetchall()
        
        # Fetch locations
        loc_rows = conn.execute("SELECT * FROM user_locations WHERE user_id = ?", (user_id,)).fetchall()
        locations = {row['location_type']: {
            "address": row['address'],
            "lat": row['latitude'],
            "lon": row['longitude'],
            "city": row['city']
        } for row in loc_rows}
        
        # Fetch activities
        act_rows = conn.execute("SELECT * FROM user_activities WHERE user_id = ? AND is_active = 1", (user_id,)).fetchall()
        activities = [{
            "id": row['id'],
            "name": row['activity_name'],
            "start_time": row['start_time'],
            "end_time": row['end_time'],
            "days": json.loads(row['days_of_week'])
        } for row in act_rows]

        threshold = calculate_personal_threshold(user_id)

        return jsonify({
            "profile": {
                "full_name": profile['full_name'],
                "age": profile['age'],
                "gender": profile['gender'],
                "weight_kg": profile['weight_kg'],
                "height_cm": profile['height_cm'],
                "bmi": profile['bmi'],
                "is_smoker": bool(profile['is_smoker'])
            },
            "health_conditions": [dict(c) for c in conditions],
            "locations": locations,
            "activities": activities,
            "personal_aqi_threshold": threshold
        })

@profile_bp.route("/", methods=["PUT"])
def update_profile():
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    weight = data.get("weight_kg")
    height = data.get("height_cm")
    bmi = None
    if weight and height:
        bmi = round(weight / ((height/100) ** 2), 2)

    with get_db() as conn:
        existing = conn.execute("SELECT 1 FROM user_profiles WHERE user_id = ?", (user_id,)).fetchone()
        if existing:
            conn.execute("""
                UPDATE user_profiles 
                SET full_name=?, age=?, gender=?, weight_kg=?, height_cm=?, bmi=?, is_smoker=?, updated_at=?
                WHERE user_id=?
            """, (data['full_name'], data['age'], data['gender'], weight, height, bmi, data.get('is_smoker', False), datetime.now(timezone.utc).isoformat(), user_id))
        else:
            conn.execute("""
                INSERT INTO user_profiles (user_id, full_name, age, gender, weight_kg, height_cm, bmi, is_smoker)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, data['full_name'], data['age'], data['gender'], weight, height, bmi, data.get('is_smoker', False)))

    return get_profile()

@profile_bp.route("/conditions", methods=["POST"])
def manage_conditions():
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    cond_id = data.get("condition_id")
    action = data.get("action") # "add" or "remove"

    with get_db() as conn:
        if action == "add":
            conn.execute("INSERT OR IGNORE INTO user_health_conditions (user_id, condition_id) VALUES (?, ?)", (user_id, cond_id))
            # Get name for response
            cond = conn.execute("SELECT condition_name FROM health_conditions WHERE id = ?", (cond_id,)).fetchone()
            msg = f"{cond['condition_name']} added to your profile"
        else:
            conn.execute("DELETE FROM user_health_conditions WHERE user_id = ? AND condition_id = ?", (user_id, cond_id))
            msg = "Condition removed"

    new_threshold = calculate_personal_threshold(user_id)
    return jsonify({
        "success": True,
        "new_threshold": new_threshold,
        "message": msg
    })

@profile_bp.route("/locations", methods=["PUT"])
def update_location():
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    loc_type = data.get("type")
    
    with get_db() as conn:
        # UPSERT logic
        existing = conn.execute("SELECT 1 FROM user_locations WHERE user_id = ? AND location_type = ?", (user_id, loc_type)).fetchone()
        if existing:
            conn.execute("""
                UPDATE user_locations 
                SET address=?, latitude=?, longitude=?, city=?, updated_at=?
                WHERE user_id=? AND location_type=?
            """, (data.get('address'), data['latitude'], data['longitude'], data.get('city'), datetime.now(timezone.utc).isoformat(), user_id, loc_type))
        else:
            conn.execute("""
                INSERT INTO user_locations (user_id, location_type, address, latitude, longitude, city)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (user_id, loc_type, data.get('address'), data['latitude'], data['longitude'], data.get('city')))
            
    return jsonify({"success": True})

@profile_bp.route("/activities", methods=["POST"])
def add_activity():
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    with get_db() as conn:
        cur = conn.execute("""
            INSERT INTO user_activities (user_id, activity_name, start_time, end_time, days_of_week)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, data['name'], data['start_time'], data['end_time'], json.dumps(data.get('days_of_week', [1,2,3,4,5,6,7]))))
        act_id = cur.lastrowid
        
    return jsonify({"success": True, "activity_id": act_id})

@profile_bp.route('/report-card', methods=['GET'])
def get_report_card():
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    # Get current AQI (fallback to 120 for demo if not provided)
    aqi = request.args.get('aqi', type=float)
    if not aqi:
        # In a real app, you'd fetch live data for the user's home city
        aqi = 120.0 
    
    image_bytes = generate_report_card(user_id, aqi)
    if not image_bytes:
        return jsonify({"error": "Failed to generate card"}), 500
        
    return send_file(
        io.BytesIO(image_bytes),
        mimetype='image/png',
        as_attachment=True,
        download_name=f'air_quality_report_{datetime.now().strftime("%Y%m%d")}.png'
    )


# ─────────────────────────────────────────────────────────────────────────────
# Activity Saved Locations CRUD
# ─────────────────────────────────────────────────────────────────────────────

VALID_MODES = {'driving', 'walking', 'bicycling', 'transit'}

def _validate_coords(lat, lon):
    """Return True if lat/lon are valid WGS-84 coordinates."""
    try:
        return -90 <= float(lat) <= 90 and -180 <= float(lon) <= 180
    except (TypeError, ValueError):
        return False


@profile_bp.route('/saved-locations', methods=['GET'])
def get_saved_locations():
    """
    GET /api/profile/saved-locations
    Returns all saved activity locations for the current user.
    Each record includes the fields needed for future route-planning
    (lat, lon, transport_mode) so no schema change will be needed later.
    """
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, activity_name, latitude, longitude, address, city,
                      preferred_transport_mode, preferred_time, created_at
               FROM user_saved_locations
               WHERE user_id = ?
               ORDER BY activity_name""",
            (user_id,)
        ).fetchall()

    return jsonify({"locations": [dict(r) for r in rows]})


@profile_bp.route('/saved-locations', methods=['POST'])
def add_saved_location():
    """
    POST /api/profile/saved-locations
    Body: { activity_name, latitude, longitude, address, city?,
            preferred_transport_mode?, preferred_time? }

    Architecture decision: we use INSERT OR IGNORE + check rowcount to give
    a friendly duplicate message instead of a raw 500 from UNIQUE violation.
    """
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}

    # ── Validation ────────────────────────────────────────────────────────────
    name = (data.get('activity_name') or '').strip()
    if not name or len(name) > 80:
        return jsonify({"error": "activity_name is required (max 80 chars)"}), 400

    lat  = data.get('latitude')
    lon  = data.get('longitude')
    if not _validate_coords(lat, lon):
        return jsonify({"error": "Invalid or missing coordinates"}), 400

    address = (data.get('address') or '').strip()
    if not address:
        return jsonify({"error": "address is required"}), 400

    mode = (data.get('preferred_transport_mode') or 'driving').lower()
    if mode not in VALID_MODES:
        return jsonify({"error": f"transport_mode must be one of {VALID_MODES}"}), 400

    preferred_time = data.get('preferred_time')  # optional "HH:MM"
    city           = (data.get('city') or '').strip() or None

    with get_db() as conn:
        # Duplicate check: same user + same activity_name
        existing = conn.execute(
            "SELECT id FROM user_saved_locations WHERE user_id=? AND LOWER(activity_name)=LOWER(?)",
            (user_id, name)
        ).fetchone()
        if existing:
            return jsonify({"error": f"A location named '{name}' already exists. Use PUT to update it."}), 409

        cur = conn.execute(
            """INSERT INTO user_saved_locations
               (user_id, activity_name, latitude, longitude, address, city,
                preferred_transport_mode, preferred_time)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, name, float(lat), float(lon), address, city, mode, preferred_time)
        )
        new_id = cur.lastrowid

    log.info("Saved location '%s' added for user %s (id=%s)", name, user_id, new_id)
    return jsonify({"success": True, "id": new_id, "activity_name": name}), 201


@profile_bp.route('/saved-locations/<int:loc_id>', methods=['PUT'])
def update_saved_location(loc_id):
    """
    PUT /api/profile/saved-locations/<id>
    Updates any subset of fields. Only the owner can update.
    """
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}

    # Ownership check
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM user_saved_locations WHERE id=? AND user_id=?",
            (loc_id, user_id)
        ).fetchone()
        if not row:
            return jsonify({"error": "Location not found or access denied"}), 404

        updates, params = [], []

        if 'activity_name' in data:
            name = data['activity_name'].strip()
            if not name or len(name) > 80:
                return jsonify({"error": "activity_name max 80 chars"}), 400
            updates.append("activity_name=?"); params.append(name)

        if 'latitude' in data or 'longitude' in data:
            lat = data.get('latitude', conn.execute("SELECT latitude FROM user_saved_locations WHERE id=?", (loc_id,)).fetchone()['latitude'])
            lon = data.get('longitude', conn.execute("SELECT longitude FROM user_saved_locations WHERE id=?", (loc_id,)).fetchone()['longitude'])
            if not _validate_coords(lat, lon):
                return jsonify({"error": "Invalid coordinates"}), 400
            updates += ["latitude=?", "longitude=?"]
            params  += [float(lat), float(lon)]

        if 'address' in data:
            updates.append("address=?"); params.append(data['address'].strip())

        if 'city' in data:
            updates.append("city=?"); params.append(data['city'])

        if 'preferred_transport_mode' in data:
            mode = data['preferred_transport_mode'].lower()
            if mode not in VALID_MODES:
                return jsonify({"error": f"Invalid mode"}), 400
            updates.append("preferred_transport_mode=?"); params.append(mode)

        if 'preferred_time' in data:
            updates.append("preferred_time=?"); params.append(data['preferred_time'])

        if not updates:
            return jsonify({"error": "No updatable fields provided"}), 400

        updates.append("updated_at=?")
        params += [datetime.now(timezone.utc).isoformat(), loc_id]

        conn.execute(f"UPDATE user_saved_locations SET {', '.join(updates)} WHERE id=?", params)

    return jsonify({"success": True})


@profile_bp.route('/saved-locations/<int:loc_id>', methods=['DELETE'])
def delete_saved_location(loc_id):
    """
    DELETE /api/profile/saved-locations/<id>
    Hard-deletes the record. Only the owner can delete.
    """
    user_id = get_user_id(request)
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM user_saved_locations WHERE id=? AND user_id=?",
            (loc_id, user_id)
        ).fetchone()
        if not row:
            return jsonify({"error": "Location not found or access denied"}), 404

        conn.execute("DELETE FROM user_saved_locations WHERE id=?", (loc_id,))

    return jsonify({"success": True, "deleted_id": loc_id})

