import ee
import os
import logging
import numpy as np
from datetime import datetime, timedelta

log = logging.getLogger(__name__)
# Add file handler for GEE errors
file_handler = logging.FileHandler(os.path.join(os.path.dirname(__file__), "gee_errors.log"))
file_handler.setLevel(logging.ERROR)
formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
file_handler.setFormatter(formatter)
log.addHandler(file_handler)

class GEEService:
    def __init__(self):
        self.initialized = False
        self.service_account = os.getenv("GEE_SERVICE_ACCOUNT")
        self.key_file = os.getenv("GEE_SERVICE_ACCOUNT_FILE")
        self.project = os.getenv("GEE_PROJECT")
        
    def authenticate(self):
        if self.initialized:
            return True
        
        try:
            if self.key_file and os.path.exists(self.key_file):
                log.info(f"Authenticating GEE with service account file: {self.key_file} for project: {self.project}")
                credentials = ee.ServiceAccountCredentials(self.service_account, self.key_file)
                ee.Initialize(credentials, project=self.project)
                self.initialized = True
                return True
            else:
                log.error("GEE_SERVICE_ACCOUNT_FILE not found or not set.")
                return False
        except Exception as e:
            log.error(f"GEE Authentication failed: {e}")
            return False

    def fetch_no2_data(self, lat=28.6139, lon=77.2090, date_str=None):
        """
        Fetches Sentinel-5P NO2 data for a region around the given lat/lon.
        """
        if not self.authenticate():
            return None

        # Create a bounding box around the given lat/lon (approx 50x50 km)
        delta = 0.25
        region = ee.Geometry.Rectangle([lon - delta, lat - delta, lon + delta, lat + delta])
        
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d")
        else:
            target_date = datetime.now()

        start_date = (target_date - timedelta(days=3)).strftime("%Y-%m-%d")
        end_date = (target_date + timedelta(days=1)).strftime("%Y-%m-%d")

        try:
            collection = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2') \
                .filterBounds(region) \
                .filterDate(start_date, end_date) \
                .select('NO2_column_number_density')

            if collection.size().getInfo() == 0:
                log.warning(f"No satellite data found for {start_date} to {end_date}")
                return None

            # Get the mean image for the period and explicitly reproject to get a reasonable grid (e.g., 2km resolution)
            image = collection.mean().reproject(crs='EPSG:4326', scale=2000).clip(region)
            
            data = image.sampleRectangle(region=region, defaultValue=0).getInfo()
            
            no2_array = np.array(data['properties']['NO2_column_number_density'])
            
            # Build lat/lon grids from the known bounding box
            rows, cols = no2_array.shape
            lon_min, lat_min, lon_max, lat_max = lon - delta, lat - delta, lon + delta, lat + delta
            lons = np.linspace(lon_min, lon_max, cols).tolist()
            lats = np.linspace(lat_max, lat_min, rows).tolist()  # top-to-bottom (north-to-south)

            log.info(f"Fetched NO2 grid {rows}x{cols} for bbox [{lat_min},{lon_min}]-[{lat_max},{lon_max}]")
            
            return {
                "no2": no2_array.tolist(),
                "lats": lats,
                "lons": lons,
                "units": "mol/m^2"
            }
        except Exception as e:
            log.error(f"Error fetching GEE data: {e}")
            return None

def idw_interpolation(x, y, grid_lons, grid_lats, grid_values, p=2):
    """
    Inverse Distance Weighting interpolation.
    x, y: target coordinates (lon, lat)
    grid_lons, grid_lats: 1D arrays of grid coordinates
    grid_values: 2D array of values
    """
    weights_sum = 0
    values_sum = 0
    
    # Flatten grid for easier calculation
    # Only consider points within a reasonable distance if possible, 
    # but for Delhi box we can just use all.
    
    for i, lat in enumerate(grid_lats):
        for j, lon in enumerate(grid_lons):
            val = grid_values[i][j]
            if val == 0 or np.isnan(val): continue
            
            # Simple Euclidean distance (fine for small areas)
            d = np.sqrt((x - lon)**2 + (y - lat)**2)
            
            if d == 0:
                return val
                
            w = 1.0 / (d ** p)
            weights_sum += w
            values_sum += w * val
            
    if weights_sum == 0:
        return 0
        
    return values_sum / weights_sum
