import json, time
from app import app

client = app.test_client()

print("Health:", client.get("/api/health").get_json())

print("\nStarting training...")
t0 = time.time()
r  = client.post("/api/train")
elapsed = round(time.time() - t0, 2)
d = r.get_json()

print(f"Status: {r.status_code}  Time: {elapsed}s")
print("Success:", d.get("success"))
if d.get("success"):
    print("Best model:", d["best_model"])
    print("Best RMSE: ", d["best_rmse"])
    print("Train rows:", d["train_rows"])
    print("Test rows: ", d["test_rows"])
    print()
    for m in d["metrics"]:
        if "error" in m:
            print(f"  {m['model']}: ERROR - {m['error']}")
        else:
            print(f"  {m['model']}: RMSE={m['rmse']}  MAE={m['mae']}  R2={m['r2']}")
else:
    print("Error:", d.get("message"))
