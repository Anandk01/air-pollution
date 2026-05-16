from reports_db import get_db

def calculate_personal_threshold(user_id: str) -> float:
    """
    Calculate the user's personal AQI threshold based on their health conditions.
    
    Args:
        user_id: The user's ID
        
    Returns:
        float: The AQI value above which alerts should fire for this user.
               Returns 150.0 if user has no conditions.
    """
    with get_db() as conn:
        # 1 & 2. Query user_health_conditions JOIN with health_conditions
        query = """
            SELECT SUM(hc.risk_multiplier) as total_multiplier
            FROM user_health_conditions uhc
            JOIN health_conditions hc ON uhc.condition_id = hc.id
            WHERE uhc.user_id = ?
        """
        row = conn.execute(query, (user_id,)).fetchone()
        
        # 3. SUM all multipliers
        sum_multipliers = row['total_multiplier'] if row and row['total_multiplier'] else 0.0
        
        # 4. Apply formula: 150 / (1 + sum_of_multipliers)
        base_threshold = 150.0
        final_threshold = base_threshold / (1.0 + sum_multipliers)
        
        # 5. Return the result rounded to 1 decimal place
        return round(final_threshold, 1)
