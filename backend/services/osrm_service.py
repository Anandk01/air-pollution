"""
OSRM Integration Service
Fetches alternative routes from OSRM API
"""
import requests
from typing import List, Dict, Tuple

class OSRMService:
    """Handles OSRM API calls for route alternatives"""
    
    OSRM_BASE_URL = "http://router.project-osrm.org/route/v1"
    
    TRANSPORT_PROFILES = {
        'car': 'driving',
        'bike': 'cycling',
        'walk': 'foot',
        'driving': 'driving',
        'cycling': 'cycling',
        'foot': 'foot'
    }
    
    @staticmethod
    def get_alternative_routes(source_lat: float, source_lon: float, 
                               dest_lat: float, dest_lon: float,
                               transport_mode: str = 'driving',
                               alternatives: int = 3) -> List[Dict]:
        """Fetch alternative routes from OSRM"""
        
        profile = OSRMService.TRANSPORT_PROFILES.get(transport_mode, 'driving')
        
        url = f"{OSRMService.OSRM_BASE_URL}/{profile}/{source_lon},{source_lat};{dest_lon},{dest_lat}"
        
        params = {
            'alternatives': alternatives,
            'steps': 'false',
            'geometries': 'geojson',
            'overview': 'full'
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            if data.get('code') != 'Ok':
                return []
            
            routes = []
            for idx, route in enumerate(data.get('routes', [])):
                geometry = route.get('geometry', {})
                coordinates = geometry.get('coordinates', [])
                
                # Convert [lon, lat] to [lat, lon]
                lat_lon_coords = [(coord[1], coord[0]) for coord in coordinates]
                
                routes.append({
                    'route_id': idx,
                    'coordinates': lat_lon_coords,
                    'distance_m': route.get('distance', 0),
                    'duration_s': route.get('duration', 0),
                    'distance_km': round(route.get('distance', 0) / 1000, 2),
                    'duration_min': round(route.get('duration', 0) / 60, 1)
                })
            
            return routes
        
        except Exception as e:
            print(f"OSRM API Error: {e}")
            return []
