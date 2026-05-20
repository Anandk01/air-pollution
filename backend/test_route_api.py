from app import app
from flask import json

with app.test_client() as client:
    response = client.post('/api/routes/analyze', json={
        "start": {"lat": 28.6, "lon": 77.2},
        "end": {"lat": 28.5, "lon": 77.1},
        "mode": "driving"
    })
    print(response.status_code)
    print(response.get_data(as_text=True))
