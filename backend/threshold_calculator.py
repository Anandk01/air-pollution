from reports_db import get_db

def calculate_personal_threshold(user_id: str) -> float:
    """
    Calculate the user's personal AQI threshold based on their health conditions.
    
    Uses a gentler formula that scales proportionally:
    - No conditions: threshold = 150 (standard "Unhealthy" level)
    - 1 mild condition (e.g. Diabetes, multiplier 1.3): threshold ≈ 120
    - 1 severe condition (e.g. COPD, multiplier 1.9): threshold ≈ 105
    - Multiple conditions stack but with diminishing impact
    
    Formula: base - (reduction_factor * sum_of_multipliers)
    Capped with a floor of 50 to avoid unrealistically low thresholds.
    
    Args:
        user_id: The user's ID
        
    Returns:
        float: The AQI value above which alerts should fire for this user.
               Returns 150.0 if user has no conditions.
    """
    with get_db() as conn:
        # 1 & 2. Query user_health_conditions JOIN with health_conditions
        query = """
            SELECT SUM(hc.risk_multiplier) as total_multiplier,
                   COUNT(*) as condition_count
            FROM user_health_conditions uhc
            JOIN health_conditions hc ON uhc.condition_id = hc.id
            WHERE uhc.user_id = ?
        """
        row = conn.execute(query, (user_id,)).fetchone()
        
        # 3. SUM all multipliers
        sum_multipliers = row['total_multiplier'] if row and row['total_multiplier'] else 0.0
        condition_count = row['condition_count'] if row and row['condition_count'] else 0
        
        if condition_count == 0:
            return 150.0
        
        # 4. Gentler formula: reduce base by 20 points per multiplier unit
        # Single diabetes (1.3) → 150 - (20 * 1.3) = 124
        # Single asthma (1.8)  → 150 - (20 * 1.8) = 114
        # Asthma + Heart (3.4) → 150 - (20 * 3.4) = 82
        # COPD + Asthma + Heart (5.3) → 150 - (20 * 5.3) = capped at 50
        base_threshold = 150.0
        reduction_per_unit = 20.0
        final_threshold = base_threshold - (reduction_per_unit * sum_multipliers)
        
        # Floor: never go below 50 AQI threshold
        final_threshold = max(final_threshold, 50.0)
        
        # 5. Return the result rounded to 1 decimal place
        return round(final_threshold, 1)
