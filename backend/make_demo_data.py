import json, random
from pathlib import Path

random.seed(7)
readings, rad = [], 0.0
for d in range(1, 31):
    t = d / 30
    rad += random.uniform(0.6, 1.0)
    readings.append({
        "day": d,
        "heart_rate": round(62 + 8 * t + random.uniform(-2, 2)),
        "blood_pressure_sys": round(118 + 10 * t + random.uniform(-3, 3)),
        "blood_pressure_dia": round(76 + 4 * t + random.uniform(-2, 2)),
        "sleep_hours": round(7.5 - 2.5 * t + random.uniform(-0.3, 0.3), 1),
        "exercise_min": round(120 - 80 * t + random.uniform(-8, 8)),
        "temperature": round(36.6 + random.uniform(-0.15, 0.15), 1),
        "blood_sugar": round(90 + random.uniform(-5, 5)),
        "stress_score": round(30 + 35 * t + random.uniform(-4, 4)),
        "radiation_total_msv": round(rad, 1),
        "distance_from_earth_km": 225_000_000,
    })
readings[-1]["temperature"] = 38.4

out = Path(__file__).resolve().parent.parent / "data" / "demo_readings.json"
out.write_text(json.dumps({"astronaut": {"name": "Demo Astronaut"}, "readings": readings}, indent=2))
print("wrote", out)
