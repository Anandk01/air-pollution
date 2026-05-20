"""
Hazard Aggregation Service
Fetches and aggregates all pollution hazards from multiple sources
"""
import sqlite3
from datetime import datetime
from typing import List, Dict

class HazardAggregator:
    """Aggregates pollution hazards from reports, anomalies, and real-time data"""
    
    def __init__(self, db_path: str = 'data/reports.db'):
        self.db_path = db_path
    
    def get_pollution_reports(self) -> List[Dict]:
        """Fetch verified pollution reports"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT latitude, longitude, pollution_type as type, 
                   severity, pm25, no2, aqi, created_at
            FROM pollution_reports
            WHERE verified = 1 
            AND datetime(created_at) > datetime('now', '-24 hours')
        """)
        
        reports = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        for report in reports:
            report['pm25'] = report.get('pm25') or 50
            report['no2'] = report.get('no2') or 40
            report['aqi'] = report.get('aqi') or 100
        
        return reports
    
    def get_pollution_anomalies(self) -> List[Dict]:
        """Fetch active pollution anomalies"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT latitude, longitude, type, severity, detected_at, expires_at
            FROM pollution_anomalies
            WHERE datetime(expires_at) > datetime('now')
        """)
        
        anomalies = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return anomalies
    
    def get_all_hazards(self) -> List[Dict]:
        """Aggregate all hazards from all sources"""
        hazards = []
        
        reports = self.get_pollution_reports()
        hazards.extend(reports)
        
        anomalies = self.get_pollution_anomalies()
        hazards.extend(anomalies)
        
        return hazards
