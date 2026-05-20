from dotenv import load_dotenv
load_dotenv()

from gee_service import GEEService
import logging

logging.basicConfig(level=logging.INFO)
gee = GEEService()

if gee.authenticate():
    print("GEE Authentication Successful!")
    # Test Delhi
    lat, lon = 28.6139, 77.209
    data = gee.fetch_no2_data(lat, lon, "2023-11-12") 
    if data:
        print("Data fetched successfully!")
        print(f"Lats: {len(data['lats'])}, Lons: {len(data['lons'])}")
        print(f"NO2 Array Shape: {len(data['no2'])}x{len(data['no2'][0])}")
        
        valid_vals = []
        for row in data['no2']:
            for val in row:
                if val > 0:
                    valid_vals.append(val)
        
        print(f"Found {len(valid_vals)} valid NO2 pixels.")
        if valid_vals:
            print(f"Max: {max(valid_vals)}, Min: {min(valid_vals)}, Avg: {sum(valid_vals)/len(valid_vals)}")
    else:
        print("Data fetch returned None. (Check logs/cloud cover)")
else:
    print("GEE Authentication Failed!")
