import json
import os

def load_thresholds():
    # Go up one level from 'backend' to the 'HELM' root, then into 'data'
    base_dir = os.path.dirname(os.path.dirname(__file__))
    file_path = os.path.join(base_dir, "data", "medical_thresholds.json")
    
    with open(file_path, "r") as f:
        return json.load(f)["indicators"]

def calculate_autonomy(distance_km: float):
    # Earth to Moon is ~384,000 km
    # Earth to Mars is up to ~400,000,000 km
    if distance_km < 500000:
        return 10 
    
    autonomy = (distance_km / 400000000) * 100
    return min(100, max(10, round(autonomy)))

def calculate_wellness(vitals: dict):
    thresholds = load_thresholds()
    wellness = 100
    
    # Loop through every vital sent by the frontend
    for key, value in vitals.items():
        if key not in thresholds:
            continue # Skip things like astronaut_id or distance_from_earth_km
            
        limits = thresholds[key]
        
        # Check Critical Limits (Deducts 20 points)
        if (limits.get("critical_high") is not None and value >= limits["critical_high"]) or \
           (limits.get("critical_low") is not None and value <= limits["critical_low"]):
            wellness -= 20
            continue # Move to next vital so we don't double-penalize
            
        # Check Warning Limits (Deducts 10 points)
        if (limits.get("warning_high") is not None and value >= limits["warning_high"]) or \
           (limits.get("warning_low") is not None and value <= limits["warning_low"]):
            wellness -= 10
            
    # Ensure wellness doesn't drop below 0
    wellness = max(0, wellness)
    autonomy = calculate_autonomy(vitals.get("distance_from_earth_km", 0))
        
    return wellness, autonomy