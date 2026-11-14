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

# SpO2, mood and fatigue were added with the 5-category assessment. A separate
# RNG keeps every value generated above byte-identical to the original demo file.
r2 = random.Random(9)
for r in readings:
    t = r["day"] / 30
    r["spo2"] = round(min(99, max(94, 98 - 1.2 * t + r2.uniform(-0.6, 0.6))), 1)
    r["mood_score"] = round(min(96, max(22, 100 - r["stress_score"] + r2.uniform(-4, 4))), 1)
    r["fatigue_score"] = round(min(88, max(10, 22 + 48 * t + r2.uniform(-4, 4))), 1)
readings[-1]["spo2"] = 94.0
readings[-1]["fatigue_score"] = 76.0

out = Path(__file__).resolve().parent.parent / "data" / "demo_readings.json"
out.write_text(json.dumps({"astronaut": {"name": "Demo Astronaut"}, "readings": readings}, indent=2))
print("wrote", out)
