import os
import requests
import polyline
import googlemaps
import logging
from flask import Blueprint, request, jsonify
from utils.haversine import haversine
from reports_db import get_db
from profile_service import get_user_id
from threshold_calculator import calculate_personal_threshold

log = logging.getLogger(__name__)

route_bp = Blueprint("route", __name__)

# Initialize Google Maps client (fallback to mock if no key provided)
GMAPS_API_KEY = os.environ.get("GMAPS_API_KEY")
gmaps = googlemaps.Client(key=GMAPS_API_KEY) if GMAPS_API_KEY else None

# ─────────────────────────────────────────────────────────────────────────────
# HAZARD ANALYSIS UTILS
# ─────────────────────────────────────────────────────────────────────────────

def get_cached_satellite_aqi(lat: float, lon: float) -> dict:
    """Mock fetching satellite pollutant data for a coordinate."""
    # Deterministic mock based on coordinates
    base_pm25 = 35.0
    base_no2 = 20.0
    
    if lat > 28.62 and lon < 77.22:
        base_pm25 += 40.0 # Simulate heavy traffic zone
        base_no2 += 30.0
    
    return {
        "pm25": base_pm25,
        "no2": base_no2,
        "aqi": max(base_pm25 * 2.1, base_no2 * 1.5) # Simplified AQI
    }

def get_hazards_near(lat: float, lon: float, radius_m: int = 300) -> dict:
    """Fetch reports and anomalies within a radius."""
    reports = []
    anomalies = []
    
    with get_db() as conn:
        # Community Reports
        rep_rows = conn.execute("""
            SELECT id, incident_type, severity, verified, lat, lon 
            FROM pollution_reports 
            WHERE verified IN (0, 1)
        """).fetchall()
        
        for r in rep_rows:
            dist = haversine(lat, lon, r['lat'], r['lon'])
            if dist <= radius_m:
                reports.append({
                    "id": r['id'],
                    "type": r['incident_type'],
                    "severity": r['severity'],
                    "verified": bool(r['verified']),
                    "distance_m": dist
                })
        
        # System Anomalies
        anom_rows = conn.execute("""
            SELECT id, type, severity, latitude, longitude 
            FROM pollution_anomalies
        """).fetchall()
        
        for a in anom_rows:
            dist = haversine(lat, lon, a['latitude'], a['longitude'])
            if dist <= radius_m:
                anomalies.append({
                    "id": a['id'],
                    "type": a['type'],
                    "severity": a['severity'],
                    "distance_m": dist
                })
                
    return {
        "reports": reports,
        "anomalies": anomalies
    }

# ─────────────────────────────────────────────────────────────────────────────
# ROUTE SCORING LOGIC
# ─────────────────────────────────────────────────────────────────────────────

def get_user_weights(user_id: str) -> dict:
    """Determine scoring weights based on user health profile."""
    weights = {
        "pm25": 0.35,
        "no2": 0.20,
        "reports": 0.25,
        "anomalies": 0.20
    }
    
    if user_id == "guest_user":
        return weights
        
    with get_db() as conn:
        conditions = conn.execute("""
            SELECT hc.condition_name 
            FROM user_health_conditions uhc
            JOIN health_conditions hc ON uhc.condition_id = hc.id
            WHERE uhc.user_id = ?
        """, (user_id,)).fetchall()
        
        cond_names = [c['condition_name'].lower() for c in conditions]
        
        if 'asthma' in cond_names or 'copd' in cond_names:
            weights = {"pm25": 0.50, "no2": 0.10, "reports": 0.30, "anomalies": 0.10}
        elif 'heart disease' in cond_names:
            weights = {"pm25": 0.30, "no2": 0.45, "reports": 0.15, "anomalies": 0.10}
            
    return weights

def calculate_segment_score(lat: float, lon: float, weights: dict) -> dict:
    """Calculate personalized exposure score for a segment."""
    pollutants = get_cached_satellite_aqi(lat, lon)
    hazards = get_hazards_near(lat, lon)
    
    # Normalize PM2.5 (0-150 range)
    pm25_score = min(pollutants['pm25'], 150) / 1.5
    # Normalize NO2 (0-100 range)
    no2_score = min(pollutants['no2'], 100)
    
    # Reports penalty
    report_penalty = sum(r['severity'] * 20 * (1.5 if r['verified'] else 1.0) for r in hazards['reports'])
    report_penalty = min(report_penalty, 100)
    
    # Anomalies penalty
    anomaly_penalty = sum(a['severity'] * 25 for a in hazards['anomalies'])
    anomaly_penalty = min(anomaly_penalty, 100)
    
    total_score = (
        (pm25_score * weights['pm25']) +
        (no2_score * weights['no2']) +
        (report_penalty * weights['reports']) +
        (anomaly_penalty * weights['anomalies'])
    )
    
    return {
        "score": total_score,
        "pm25": pollutants['pm25'],
        "no2": pollutants['no2'],
        "aqi": pollutants['aqi'],
        "hazards": hazards
    }

# ─────────────────────────────────────────────────────────────────────────────
# SEGMENTATION
# ─────────────────────────────────────────────────────────────────────────────

def segment_route(poly_str: str, duration_min: float) -> list:
    """Split route into ~100m segments for high-resolution analysis."""
    coords = polyline.decode(poly_str)
    if not coords: return []
    
    segments = []
    total_dist = 0
    for i in range(len(coords)-1):
        total_dist += haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
        
    if total_dist == 0:
        return [{"lat": coords[0][0], "lon": coords[0][1], "time_spent": duration_min}]
        
    # Walk the polyline and sample every ~100m
    step_m = 100
    accumulated_dist = 0
    
    for i in range(len(coords)-1):
        lat1, lon1 = coords[i]
        lat2, lon2 = coords[i+1]
        dist = haversine(lat1, lon1, lat2, lon2)
        
        time_for_edge = duration_min * (dist / total_dist)
        
        if dist < step_m:
            segments.append({"lat": lat1, "lon": lon1, "time_spent": time_for_edge})
        else:
            chunks = max(1, int(dist / step_m))
            for j in range(chunks):
                f = j / chunks
                segments.append({
                    "lat": lat1 + (lat2 - lat1) * f,
                    "lon": lon1 + (lon2 - lon1) * f,
                    "time_spent": time_for_edge / chunks
                })
    return segments

# ─────────────────────────────────────────────────────────────────────────────
# MAIN API
# ─────────────────────────────────────────────────────────────────────────────

@route_bp.route("/analyze", methods=["POST"])
def analyze_routes():
    """
    POST /api/routes/analyze
    Body: { "source": {lat, lon}, "destination_id": 5, "mode": "bike" }
    """
    user_id = get_user_id(request)
    data = request.json
    source = data.get("source")
    dest_id = data.get("destination_id")
    mode = data.get("mode", "driving")
    
    if not source:
        return jsonify({"error": "Source coordinates required"}), 400
        
    # 1. Fetch Destination
    dest_coords = None
    dest_name = "Selected Destination"
    
    with get_db() as conn:
        dest = conn.execute("""
            SELECT activity_name, latitude, longitude 
            FROM user_saved_locations 
            WHERE id = ? AND user_id = ?
        """, (dest_id, user_id)).fetchone()
        
        if not dest and user_id != "guest_user":
             return jsonify({"error": "Destination not found"}), 404
             
        if dest:
            dest_coords = {"lat": dest['latitude'], "lon": dest['longitude']}
            dest_name = dest['activity_name']
        else:
            # Fallback for manual selection or guest
            dest_coords = data.get("destination")
            if not dest_coords:
                return jsonify({"error": "Destination required"}), 400

    # 2. Setup Weights & Threshold
    weights = get_user_weights(user_id)
    threshold = calculate_personal_threshold(user_id)

    # 3. Fetch Alternative Routes from OSRM
    routes_data = []
    osrm_mode = "driving"
    if mode == "walking": osrm_mode = "foot"
    elif mode in ["bike", "bicycling"]: osrm_mode = "bicycle"
    
    try:
        url = f"http://router.project-osrm.org/route/v1/{osrm_mode}/{source['lon']},{source['lat']};{dest_coords['lon']},{dest_coords['lat']}?overview=full&geometries=polyline&alternatives=true"
        res = requests.get(url)
        if res.status_code != 200:
            return jsonify({"error": "OSRM routing failed"}), 500
            
        osrm_results = res.json().get('routes', [])
        for i, r in enumerate(osrm_results):
            routes_data.append({
                "id": i + 1,
                "polyline": r['geometry'],
                "distance_km": r['distance'] / 1000.0,
                "duration_min": r['duration'] / 60.0
            })
    except Exception as e:
        log.error(f"Routing error: {e}")
        return jsonify({"error": "Routing service unavailable"}), 500

    # 4. Analyze each route
    analyzed_routes = []
    for r in routes_data:
        segments = segment_route(r['polyline'], r['duration_min'])
        total_exposure = 0
        hazards_count = 0
        high_risk_zones = 0
        
        processed_segments = []
        for seg in segments:
            analysis = calculate_segment_score(seg['lat'], seg['lon'], weights)
            total_exposure += analysis['score'] * seg['time_spent']
            
            seg_hazards = len(analysis['hazards']['reports']) + len(analysis['hazards']['anomalies'])
            hazards_count += seg_hazards
            
            if analysis['aqi'] > threshold:
                high_risk_zones += 1
            
            processed_segments.append({
                **seg,
                "score": analysis['score'],
                "aqi": analysis['aqi'],
                "hazards": analysis['hazards']
            })

        # Final metrics
        exposure_index = total_exposure / r['duration_min'] if r['duration_min'] > 0 else 0
        rating = "Safe" if exposure_index < 30 else "Moderate" if exposure_index < 60 else "Unsafe"
        
        analyzed_routes.append({
            "id": r['id'],
            "polyline": r['polyline'],
            "distance_km": round(r['distance_km'], 2),
            "duration_min": int(r['duration_min']),
            "exposure_score": round(total_exposure, 1),
            "exposure_index": round(exposure_index, 1),
            "rating": rating,
            "hazards_avoided": hazards_count,
            "high_risk_count": high_risk_zones,
            "segments": processed_segments
        })

    # 5. Identify Safest, Fastest, Balanced
    analyzed_routes.sort(key=lambda x: x['exposure_score'])
    for i, r in enumerate(analyzed_routes):
        r['is_safest'] = (i == 0)
        
    fastest = min(analyzed_routes, key=lambda x: x['duration_min'])
    fastest['is_fastest'] = True
    
    # Balanced = good mix of score and time (heuristic)
    balanced = min(analyzed_routes, key=lambda x: (x['exposure_score'] * 0.7 + x['duration_min'] * 10))
    balanced['is_balanced'] = True

    return jsonify({
        "destination_name": dest_name,
        "user_threshold": threshold,
        "routes": analyzed_routes,
        "weights_used": weights
    })
