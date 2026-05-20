import unittest
import sqlite3
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

import trust_engine

class TestTrustEngine(unittest.TestCase):

    def setUp(self):
        # Create an in-memory database for testing
        self.conn = sqlite3.connect(':memory:')
        self.conn.row_factory = sqlite3.Row
        
        # Setup schema
        self.conn.execute('''
            CREATE TABLE pollution_reports (
                id INTEGER PRIMARY KEY,
                user_id TEXT,
                reported_at TEXT,
                verified BOOLEAN,
                upvote_count INTEGER
            )
        ''')
        self.conn.execute('''
            CREATE TABLE user_trust_scores (
                user_id TEXT PRIMARY KEY,
                score REAL,
                accuracy_rate REAL,
                report_count INTEGER,
                confirmed_count INTEGER,
                flagged_spam INTEGER,
                first_report_at TEXT,
                updated_at TEXT
            )
        ''')
        
        # Patch get_db to return our in-memory db
        self.patcher = patch('trust_engine.get_db')
        self.mock_get_db = self.patcher.start()
        
        # Create a mock context manager
        self.mock_ctx = MagicMock()
        self.mock_ctx.__enter__.return_value = self.conn
        self.mock_get_db.return_value = self.mock_ctx

    def tearDown(self):
        self.patcher.stop()
        self.conn.close()

    def test_anonymous_user(self):
        score = trust_engine.calculate_trust_score("anonymous")
        self.assertEqual(score, 0.3)

    def test_new_user_score(self):
        score = trust_engine.calculate_trust_score("user_123")
        self.assertEqual(score, 0.5)

    def test_spam_detection(self):
        user_id = "spammer"
        now = datetime.now(timezone.utc)
        # Insert 6 reports within the last hour
        for i in range(6):
            dt = (now - timedelta(minutes=i)).isoformat()
            self.conn.execute(
                "INSERT INTO pollution_reports (user_id, reported_at, verified, upvote_count) VALUES (?, ?, ?, ?)",
                (user_id, dt, False, 0)
            )
        
        score = trust_engine.calculate_trust_score(user_id)
        self.assertEqual(score, 0.0)
        
        # Check if flagged
        trust_info = trust_engine.get_user_trust(user_id)
        self.assertEqual(trust_info["flagged_spam"], 1)

    def test_good_reputation_score(self):
        user_id = "good_user"
        now = datetime.now(timezone.utc)
        
        # Account older than 30 days (+0.1)
        old_dt = (now - timedelta(days=40)).isoformat()
        
        # 1st report (old, verified, 4 upvotes)
        self.conn.execute(
            "INSERT INTO pollution_reports (user_id, reported_at, verified, upvote_count) VALUES (?, ?, ?, ?)",
            (user_id, old_dt, True, 4)
        )
        # 2nd report (recent, verified, 2 upvotes)
        self.conn.execute(
            "INSERT INTO pollution_reports (user_id, reported_at, verified, upvote_count) VALUES (?, ?, ?, ?)",
            (user_id, now.isoformat(), True, 2)
        )
        
        # Base: 0.5
        # Age bonus: +0.1 (>30 days)
        # Accuracy bonus: 2 confirmed * 0.1 = +0.2
        # Upvote ratio: (6 upvotes / 2 reports) = 3 avg * 0.05 = +0.15
        # Total = 0.5 + 0.1 + 0.2 + 0.15 = 0.95
        
        score = trust_engine.calculate_trust_score(user_id)
        self.assertAlmostEqual(score, 0.95, places=2)

if __name__ == "__main__":
    unittest.main()
