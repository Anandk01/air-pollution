from PIL import Image, ImageDraw, ImageFont
from datetime import datetime
import io
import os
import json
from reports_db import get_db
from threshold_calculator import calculate_personal_threshold

def get_report_profile(user_id: str):
    """Internal helper to fetch data for the report card."""
    with get_db() as conn:
        profile = conn.execute("SELECT * FROM user_profiles WHERE user_id = ?", (user_id,)).fetchone()
        if not profile: return None
        
        conditions = conn.execute("""
            SELECT hc.condition_name as name
            FROM user_health_conditions uhc
            JOIN health_conditions hc ON uhc.condition_id = hc.id
            WHERE uhc.user_id = ?
        """, (user_id,)).fetchall()
        
        location = conn.execute("SELECT city FROM user_locations WHERE user_id = ? AND location_type = 'home'", (user_id,)).fetchone()
        
        return {
            "full_name": profile['full_name'],
            "personal_aqi_threshold": calculate_personal_threshold(user_id),
            "health_conditions": [dict(c) for c in conditions],
            "city": location['city'] if location else "Your City"
        }

def wrap_text(text: str, font, max_width: int) -> list:
    """Word wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current_line = ""
    
    # Create a dummy image for measuring text
    draw = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    
    for word in words:
        test_line = current_line + " " + word if current_line else word
        bbox = draw.textbbox((0, 0), test_line, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    
    if current_line:
        lines.append(current_line)
    
    return lines

def get_health_tip(conditions: list, aqi: float, threshold: float) -> str:
    """Generate a personalized health tip based on conditions and AQI."""
    tips = {
        'Asthma': "Avoid outdoor activities. Keep windows closed and use an air purifier. Take your rescue inhaler if needed.",
        'Heart disease': "Limit physical exertion. Stay indoors in air-conditioned spaces. Monitor for chest discomfort.",
        'COPD': "Use your prescribed medications as directed. Avoid going outside unless necessary.",
        'Diabetes': "Check blood sugar more frequently as pollution can affect glucose levels. Stay hydrated.",
        'Pregnant': "Minimize outdoor exposure. Pollution can affect fetal development. Rest indoors.",
        'Allergies': "Keep antihistamines handy. Pollen and pollution worsen symptoms together."
    }
    
    if aqi <= threshold:
        return "Air quality is safe for you today! Enjoy outdoor activities with caution."
    
    # Priority order
    priority_order = ['Asthma', 'COPD', 'Heart disease', 'Pregnant', 'Diabetes', 'Allergies']
    condition_names = [c['name'] for c in conditions]
    
    for condition in priority_order:
        if condition in condition_names:
            return f"For your {condition.lower()}: {tips[condition]}"
    
    return "Air quality is poor. Limit outdoor activities and stay in well-ventilated indoor spaces."

def generate_report_card(user_id: str, aqi: float) -> bytes:
    profile = get_report_profile(user_id)
    if not profile: return None
    
    threshold = profile['personal_aqi_threshold']
    name = profile['full_name']
    city = profile['city']
    
    # Determine status
    if aqi <= threshold:
        status = "Safe for your profile"
        status_color = (29, 158, 117)  # Green
    elif aqi <= threshold * 1.5:
        status = "Moderate risk"
        status_color = (239, 159, 39)  # Amber
    else:
        status = "Dangerous for your profile"
        status_color = (226, 75, 74)  # Red
        
    tip = get_health_tip(profile['health_conditions'], aqi, threshold)
    
    # Create image (Instagram Story dimensions)
    img = Image.new('RGB', (1080, 1920), color=(12, 68, 124))
    draw = ImageDraw.Draw(img)
    
    # Font Fallback
    def get_font(size, bold=False):
        try:
            # Common paths for Windows/Linux
            paths = [
                "C:/Windows/Fonts/arial.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "arial.ttf"
            ]
            for p in paths:
                if os.path.exists(p):
                    return ImageFont.truetype(p, size)
            return ImageFont.load_default()
        except:
            return ImageFont.load_default()

    font_large = get_font(140, True)
    font_medium = get_font(50)
    font_small = get_font(36)
    
    # Header
    draw.text((60, 80), city, fill=(255, 255, 255), font=font_medium)
    draw.text((60, 150), datetime.now().strftime("%d %B %Y"), fill=(200, 220, 255), font=font_small)
    draw.text((920, 80), "AirSight", fill=(255, 255, 255), font=font_small)
    
    # AQI Center
    aqi_text = str(int(aqi))
    bbox = draw.textbbox((0, 0), aqi_text, font=font_large)
    text_width = bbox[2] - bbox[0]
    draw.text((540 - text_width//2, 400), aqi_text, fill=(255, 255, 255), font=font_large)
    draw.text((540, 570), "Air Quality Index", fill=(200, 220, 255), font=font_medium, anchor="mm")
    
    # Status
    draw.text((540, 680), status, fill=status_color, font=font_small, anchor="mm")
    
    # Boxes
    draw.rectangle([(80, 800), (1000, 1000)], fill=(255, 255, 255, 40)) # Simplified for default PIL
    draw.text((100, 830), f"Your safe limit: {int(threshold)} AQI", fill=(255, 255, 255), font=font_small)
    draw.text((100, 900), f"Current: {int(aqi)} AQI ({aqi/threshold:.1f}x over)", fill=(255, 255, 255), font=font_small)
    
    draw.rectangle([(80, 1050), (1000, 1350)], fill=(255, 255, 255, 40))
    
    # Wrapped Tip
    wrapped_tip = wrap_text(tip, font_small, 880)
    y_offset = 1100
    for line in wrapped_tip:
        draw.text((100, y_offset), line, fill=(255, 255, 255), font=font_small)
        y_offset += 60
        
    # Footer
    footer_text = f"Generated at {datetime.now().strftime('%I:%M %p')} - Personalized for {name}"
    draw.text((540, 1800), footer_text, fill=(200, 220, 255), font=font_small, anchor="mm")
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    return img_byte_arr.getvalue()
