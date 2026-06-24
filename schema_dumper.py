import sqlite3

def dump_schema(db_path):
    print(f"\n--- Schema for {db_path} ---")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        if not tables:
            print("No tables found.")
            return

        for table in tables:
            table_name = table[0]
            print(f"\nTable: {table_name}")
            print("-" * (7 + len(table_name)))
            
            cursor.execute(f"PRAGMA table_info('{table_name}');")
            columns = cursor.fetchall()
            for col in columns:
                print(f"  - {col[1]} ({col[2]})")
            
            cursor.execute(f"SELECT COUNT(*) FROM '{table_name}';")
            count = cursor.fetchone()[0]
            print(f"  [Total Rows: {count}]")
            
            # Print a few sample rows
            if count > 0:
                print("  Sample Data (first 3 rows):")
                cursor.execute(f"SELECT * FROM '{table_name}' LIMIT 3;")
                rows = cursor.fetchall()
                for i, row in enumerate(rows):
                    print(f"    {i+1}: {row}")
                    
        conn.close()
    except Exception as e:
        print(f"Error reading {db_path}: {e}")

dump_schema('backend/anomalies.db')
dump_schema('backend/data/reports.db')
