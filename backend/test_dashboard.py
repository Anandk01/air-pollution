from app import app

client = app.test_client()

# Re-train so pkl has all_metrics
print("Re-training models...")
r = client.post("/api/train")
d = r.get_json()
print(f"Train OK: {d.get('success')}  best={d.get('best_model')}  RMSE={d.get('best_rmse')}")
print("Metrics stored:", [m["model"] for m in d.get("metrics", []) if "error" not in m])

# Hit dashboard
print("\nFetching /api/dashboard ...")
r2 = client.get("/api/dashboard")
d2 = r2.get_json()
print(f"Status: {r2.status_code}  success={d2.get('success')}")
if d2.get("success"):
    print(f"  current_pm25 : {d2['current_pm25']}")
    print(f"  aqi_status   : {d2['aqi_status']}")
    print(f"  best_model   : {d2['best_model']}")
    print(f"  best_rmse    : {d2['best_rmse']}")
    print(f"  records_count: {d2['records_count']}")
    print(f"  trend points : {len(d2['recent_trend'])}")
    print(f"  model_metrics: {d2['model_metrics']}")
else:
    print("Error:", d2.get("message"))
