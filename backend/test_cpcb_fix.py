"""Test that _fix_cpcb_csv properly handles CPCB-format CSV files."""
import pandas as pd
import os
import sys

sys.path.insert(0, '.')

# Create a fake CPCB CSV that mimics the structure (16 metadata rows, then header)
lines = [
    'CENTRAL POLLUTION CONTROL BOARD,',
    'CONTINUOUS AMBIENT AIR QUALITY,',
    'Date: Tuesday May 19 2026,',
    'Time: 09:56:00 PM,',
    'State,Karnataka',
    'City,Dharwad',
    'Station,Kalabhavan Dharwad - KSPCB',
    'Parameter,"PM2.5,PM10,NO,NO2,NOx,NH3,SO2,CO,Ozone"',
    'AvgPeriod,1 Hours',
    'From,18-05-2026T00:00:00Z 00:00',
    'To,19-05-2026T21:16:59Z 00:00',
    ',',
    'Kalabhavan Dharwad - KSPCB,',
    'Prescribed Standards,,0-60,0-100,0-80,0-80',
    'Exceeding Standards,,NA,NA,NA,NA',
    'Remarks,',
    'From Date,To Date,PM2.5,PM10,NO,NO2,NOx,NH3,SO2,CO,Ozone',
    '18-05-2026 00:00,18-05-2026 01:00,38.21,65.4,13.67,20.72,34.48,24.33,6.11,0.5,26.84',
    '18-05-2026 01:00,18-05-2026 02:00,34.76,58.2,13.70,20.80,34.47,24.29,6.07,0.4,26.93',
    '18-05-2026 02:00,18-05-2026 03:00,35.55,61.1,13.62,20.78,34.45,24.27,6.07,0.3,26.67',
]

os.makedirs('uploads', exist_ok=True)
with open('uploads/fake_cpcb.csv', 'w') as f:
    f.write('\n'.join(lines))

print("Created fake CPCB CSV with 16 metadata rows + header + 3 data rows")
print()

# Now test the fix
from app import _fix_cpcb_csv, _detect_col, PM25_CANDIDATES, DATE_CANDIDATES

result = _fix_cpcb_csv('uploads/fake_cpcb.csv')
df = pd.read_csv(result)
print(f"Shape after fix: {df.shape}")
print(f"Columns: {df.columns.tolist()}")

pm25 = _detect_col(df.columns.tolist(), PM25_CANDIDATES)
date = _detect_col(df.columns.tolist(), DATE_CANDIDATES)
print(f"PM2.5 col detected: {pm25}")
print(f"Date col detected: {date}")

if pm25:
    print(f"PM2.5 values: {df[pm25].tolist()}")
    print("\n✅ SUCCESS - CPCB CSV fix works!")
else:
    print("\n❌ FAILED - PM2.5 column not found!")

# Cleanup
os.remove(result)
