"""
Route Scoring Service
Calculates pollution exposure scores for route segments
"""
import math
from datetime import datetime
from typing import List, Dict, Tuple

class RouteScorer:
    """Calculates route safety scores based on pollution exposure"""
    
    BASE_WEIGHTS = {
        'pm25': 0.35,
        'no2': 0.20,
        'aqi': 0.15,
        'reports': 0.20,
        'anomalies': 0.10
    }
    
    HEALTH_MODIFIERS = {
        'asthma': {'pm25': 1.5, 'no2': 1.2, 'aqi': 1.3},
        'copd': {'pm25': 1.6, 'no2': 1.4, 'aqi': 1.4},
        'heart_disease': {'no2': 1.8, 'pm25': 1.2, 'aqi': 1.3},
        'diabetes': {'pm25': 1.1, 'no2': 1.3, 'aqi': 1.2},
        'healthy': {'pm25': 1.0, 'no2': 1.0, 'aqi': 1.0}
    }
    
    @staticmethod
    def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        
        a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c
    
    @staticmethod
    def create_route_segments(coordinates: List[Tuple[float, float]], segment_length: float = 100) -> List[Dict]:
        segments = []
        
        for i in range(len(coordinates) - 1):
            lat1, lon1 = coordinates[i]
            lat2, lon2 = coordinates[i + 1]
            
            distance = RouteScorer.haversine_distance(lat1, lon1, lat2, lon2)
            num_segments = max(1, int(distance / segment_length))
            
            for j in range(num_segments):
                progress = j / num_segments
                seg_lat = lat1 + (lat2 - lat1) * progress
                seg_lon = lon1 + (lon2 - lon1) * progress
                
                segments.append({
                    'lat': seg_lat,
                    'lon': seg_lon,
                    'distance': distance / num_segments
                })
        
        return segments
    
    @staticmethod
    def get_nearby_hazards(segment: Dict, hazards: List[Dict], radius: float = 200) -> List[Dict]:
        nearby = []
        seg_lat, seg_lon = segment['lat'], segment['lon']
        
        for hazard in hazards:
            distance = RouteScorer.haversine_distance(
                seg_lat, seg_lon, 
                hazard['latitude'], hazard['longitude']
            )
            
            if distance <= radius:
                hazard_copy = hazard.copy()
                hazard_copy['distance_to_segment'] = distance
                nearby.append(hazard_copy)
        
        return nearby
    
    @staticmethod
    def calculate_segment_score(segment: Dict, nearby_hazards: List[Dict], health_profile: str = 'healthy') -> Dict:
        modifiers = RouteScorer.HEALTH_MODIFIERS.get(health_profile, RouteScorer.HEALTH_MODIFIERS['healthy'])
        
        pm25_total = 0
        no2_total = 0
        aqi_total = 0
        report_count = 0
        anomaly_severity = 0
        
        for hazard in nearby_hazards:
            distance = hazard['distance_to_segment']
            decay = max(0, 1 - (distance / 200))
            
            hazard_type = hazard.get('type', 'report')
            
            if hazard_type in ['garbage_burning', 'industrial_smoke', 'construction_dust']:
                anomaly_severity += hazard.get('severity', 5) * decay
            elif hazard_type == 'report':
                report_count += decay
                pm25_total += hazard.get('pm25', 50) * decay
                no2_total += hazard.get('no2', 40) * decay
                aqi_total += hazard.get('aqi', 100) * decay
            else:
                pm25_total += hazard.get('pm25', 0) * decay
                no2_total += hazard.get('no2', 0) * decay
                aqi_total += hazard.get('aqi', 0) * decay
        
        pm25_score = min(100, pm25_total) * modifiers.get('pm25', 1.0)
        no2_score = min(100, no2_total) * modifiers.get('no2', 1.0)
        aqi_score = min(200, aqi_total) * modifiers.get('aqi', 1.0)
        report_score = min(10, report_count) * 10
        anomaly_score = min(10, anomaly_severity) * 10
        
        weights = RouteScorer.BASE_WEIGHTS
        total_score = (
            (pm25_score * weights['pm25']) +
            (no2_score * weights['no2']) +
            (aqi_score * weights['aqi'] / 2) +
            (report_score * weights['reports']) +
            (anomaly_score * weights['anomalies'])
        )
        
        return {
            'score': round(total_score, 2),
            'pm25': round(pm25_score, 2),
            'no2': round(no2_score, 2),
            'aqi': round(aqi_score, 2),
            'hazard_count': len(nearby_hazards),
            'anomaly_severity': round(anomaly_severity, 2)
        }
    
    @staticmethod
    def score_route(coordinates: List[Tuple[float, float]], hazards: List[Dict], health_profile: str = 'healthy', distance_km: float = 0, duration_min: float = 0) -> Dict:
        segments = RouteScorer.create_route_segments(coordinates, segment_length=100)
        
        total_score = 0
        total_hazards = 0
        max_segment_score = 0
        high_risk_segments = 0
        
        pm25_avg = 0
        no2_avg = 0
        aqi_avg = 0
        
        for segment in segments:
            nearby = RouteScorer.get_nearby_hazards(segment, hazards, radius=200)
            seg_score = RouteScorer.calculate_segment_score(segment, nearby, health_profile)
            
            total_score += seg_score['score']
            total_hazards += seg_score['hazard_count']
            max_segment_score = max(max_segment_score, seg_score['score'])
            
            pm25_avg += seg_score['pm25']
            no2_avg += seg_score['no2']
            aqi_avg += seg_score['aqi']
            
            if seg_score['score'] > 60:
                high_risk_segments += 1
        
        num_segments = len(segments)
        avg_score = total_score / num_segments if num_segments > 0 else 0
        
        if avg_score < 30:
            risk_level = 'low'
        elif avg_score < 60:
            risk_level = 'moderate'
        else:
            risk_level = 'high'
        
        return {
            'total_score': round(avg_score, 2),
            'risk_level': risk_level,
            'distance_km': round(distance_km, 2),
            'duration_min': round(duration_min, 1),
            'hazards_count': total_hazards,
            'high_risk_segments': high_risk_segments,
            'max_exposure': round(max_segment_score, 2),
            'avg_pm25': round(pm25_avg / num_segments, 2) if num_segments > 0 else 0,
            'avg_no2': round(no2_avg / num_segments, 2) if num_segments > 0 else 0,
            'avg_aqi': round(aqi_avg / num_segments, 2) if num_segments > 0 else 0,
            'segments_analyzed': num_segments
        }
