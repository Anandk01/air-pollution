from apscheduler.schedulers.background import BackgroundScheduler
from report_card_generator import generate_report_card
from reports_db import get_db
from datetime import datetime
import os
import logging

log = logging.getLogger(__name__)

def generate_daily_reports():
    """Run every morning at 7 AM to generate report cards for all users."""
    log.info("Starting daily report card generation...")
    try:
        with get_db() as conn:
            users = conn.execute("SELECT id FROM users").fetchall()
            
        for user in users:
            user_id = user['id']
            # Dummy AQI for scheduled job (real app would fetch per city)
            aqi = 135.0 
            
            image_bytes = generate_report_card(user_id, aqi)
            if image_bytes:
                # Save to disk for history/caching
                os.makedirs('reports', exist_ok=True)
                filename = f"reports/user_{user_id}_{datetime.now().strftime('%Y%m%d')}.png"
                with open(filename, 'wb') as f:
                    f.write(image_bytes)
                log.info(f"Report generated for user {user_id}")
                
    except Exception as e:
        log.error(f"Daily report generation failed: {e}")

def init_scheduler():
    scheduler = BackgroundScheduler()
    # Runs at 7:00 AM daily
    scheduler.add_job(generate_daily_reports, 'cron', hour=7, minute=0)
    scheduler.start()
    log.info("Background scheduler started (7 AM Daily Reports)")
