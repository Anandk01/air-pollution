# gunicorn.conf.py — Render deployment config
import os

# Workers: 2 is safe on Render free (512 MB RAM)
workers = 2
threads = 2
worker_class = "sync"

# Render assigns PORT dynamically
bind = f"0.0.0.0:{os.getenv('PORT', '10000')}"

# Kill worker if it takes > 120s (satellite/OSRM calls can be slow)
timeout = 120
keepalive = 5

# Logging
accesslog = "-"   # stdout
errorlog  = "-"   # stderr
loglevel  = "info"

# Preload app to share memory across workers
preload_app = False
