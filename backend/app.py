from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3
import score

app = FastAPI(title="HELM Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    conn = sqlite3.connect("helm_offline.db")
    cursor = conn.cursor()
    # Updated schema to include the Research Lead's new metrics
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            astronaut_id TEXT,
            heart_rate REAL,
            blood_pressure_sys REAL,
            blood_pressure_dia REAL,
            sleep_hours REAL,
            co2_mmhg REAL,
            o2_partial_pressure_mmhg REAL,
            radiation_total_msv REAL,
            radiation_event_msv REAL,
            stress_score REAL,
            distance_from_earth_km REAL,
            wellness_score REAL,
            autonomy_level REAL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# Updated Payload to match the new medical_thresholds.json keys
class CheckInPayload(BaseModel):
    astronaut_id: str
    heart_rate: Optional[float] = None
    blood_pressure_sys: Optional[float] = None
    blood_pressure_dia: Optional[float] = None
    sleep_hours: Optional[float] = None
    co2_mmhg: Optional[float] = None
    o2_partial_pressure_mmhg: Optional[float] = None
    radiation_total_msv: Optional[float] = None
    radiation_event_msv: Optional[float] = None
    stress_score: Optional[float] = None
    distance_from_earth_km: float

@app.get("/api/status")
def get_status():
    conn = sqlite3.connect("helm_offline.db")
    cursor = conn.cursor()
    cursor.execute("SELECT wellness_score, autonomy_level FROM checkins ORDER BY id DESC LIMIT 1")
    result = cursor.fetchone()
    conn.close()
    
    if result:
        return {"status": "nominal", "overall_wellness": result[0], "autonomy_meter": result[1]}
    return {"status": "no data", "overall_wellness": 100, "autonomy_meter": 0}

@app.post("/api/checkin")
def process_checkin(payload: CheckInPayload):
    vitals = payload.model_dump(exclude_none=True) 
    
    wellness, autonomy = score.calculate_wellness(vitals)
    
    conn = sqlite3.connect("helm_offline.db")
    cursor = conn.cursor()
    
    # Dynamically build the insert query based on what vitals were provided
    columns = list(vitals.keys()) + ["wellness_score", "autonomy_level"]
    values = list(vitals.values()) + [wellness, autonomy]
    placeholders = ",".join(["?"] * len(values))
    
    cursor.execute(f'''
        INSERT INTO checkins ({",".join(columns)}) 
        VALUES ({placeholders})
    ''', values)
    
    conn.commit()
    conn.close()
    
    return {
        "status": "success",
        "saved_wellness_score": wellness,
        "saved_autonomy_level": autonomy
    }