import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THRESHOLDS_PATH = os.path.join(BASE, "data", "medical_thresholds.json")


NOMINAL_MIN = 70        
CAUTION_MIN = 40         
SCORE_NORMAL, SCORE_WARN, SCORE_CRIT = 100, 55, 20
DRIFT_CAUTION_PCT = 20   
WELLNESS_CAP = 60     
MAX_DELAY_S = 1200        
LIGHT_KM_PER_S = 299_792.458


SYSTEMS = {
    "structure":       {"label": "Structure",       "indicators": ["exercise_min"]},
    "life_support":    {"label": "Life support",    "indicators": ["heart_rate", "blood_pressure_sys", "blood_pressure_dia", "co2_mmhg", "o2_partial_pressure_mmhg"]},
    "shielding":       {"label": "Shielding",       "indicators": ["radiation_total_msv", "radiation_event_msv", "temperature"]},
    "power":           {"label": "Power",           "indicators": ["blood_sugar"]},
    "flight_computer": {"label": "Flight computer", "indicators": ["sleep_hours", "stress_score"]},
}

def load_thresholds():
    with open(THRESHOLDS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)["indicators"]

def status(score):
    if score >= NOMINAL_MIN:
        return "NOMINAL"
    if score >= CAUTION_MIN:
        return "CAUTION"
    return "WARNING"

def indicator_score(value, t):
    ch, cl = t.get("critical_high"), t.get("critical_low")
    wh, wl = t.get("warning_high"), t.get("warning_low")
    if (ch is not None and value >= ch) or (cl is not None and value <= cl):
        return SCORE_CRIT
    if (wh is not None and value >= wh) or (wl is not None and value <= wl):
        return SCORE_WARN
    return SCORE_NORMAL

def drift_pct(value, baseline):
    if not baseline:          # None or 0 (cumulative values like radiation have no baseline)
        return None
    return round((value - baseline) / baseline * 100, 1)

def delay_seconds(distance_km):
    return distance_km / LIGHT_KM_PER_S

def calculate_autonomy(distance_km, worst_score=100):
    """0-100: how much the astronaut must rely on their own judgement right now.
    Combines signal delay and health severity."""
    delay_factor = min(1.0, delay_seconds(distance_km) / MAX_DELAY_S)
    severity = (100 - worst_score) / 100
    return round(100 * (0.4 * delay_factor + 0.6 * severity))

def compute(vitals, baselines=None):
    thresholds = load_thresholds()
    baselines = baselines or {}
    ind = {}
    for key, t in thresholds.items():
        v = vitals.get(key)
        if v is None:
            continue
        sc = indicator_score(v, t)
        d = drift_pct(v, baselines.get(key))
        if d is not None and abs(d) >= DRIFT_CAUTION_PCT:
            sc = min(sc, 60)  
        ind[key] = {"label": t.get("label", key), "value": v, "unit": t.get("unit", ""),
                    "drift_pct": d, "score": sc, "status": status(sc)}

    systems = {}
    for sid, s in SYSTEMS.items():
        scores = [ind[k]["score"] for k in s["indicators"] if k in ind]
        if scores:
            sc = min(scores)  
            systems[sid] = {"label": s["label"], "score": sc, "status": status(sc)}
        else:
            systems[sid] = {"label": s["label"], "score": None, "status": "NO DATA"}

    scored = [s["score"] for s in systems.values() if s["score"] is not None]
    wellness = round(sum(scored) / len(scored)) if scored else 100
    worst = min(scored) if scored else 100
    if worst < CAUTION_MIN:
        wellness = min(wellness, WELLNESS_CAP)

    dist = vitals.get("distance_from_earth_km") or 0
    return {"wellness": wellness, "systems": systems, "indicators": ind,
            "autonomy": calculate_autonomy(dist, worst),
            "signal_delay_s": round(delay_seconds(dist), 1)}


def calculate_wellness(vitals):
    r = compute(vitals)
    return r["wellness"], r["autonomy"]

if __name__ == "__main__":
    sample = {"heart_rate": 72, "blood_pressure_sys": 150, "sleep_hours": 4.5,
              "radiation_total_msv": 120, "distance_from_earth_km": 225_000_000}
    print(json.dumps(compute(sample), indent=2))
