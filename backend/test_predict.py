
from app import app

client = app.test_client()

for h in (1, 6, 24):
    r = client.post("/api/predict",
        json={"hours_ahead": h},
        content_type="application/json")
    d = r.get_json()
    if d["success"]:
        print(f"{h:2d}h  PM2.5={d['predicted_pm25']:6.2f}  AQI={d['aqi_status']:<14}  model={d['model']}")
    else:
        print(f"{h:2d}h  ERROR: {d['message']}")
