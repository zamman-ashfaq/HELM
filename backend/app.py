import sys
import sqlite3
from pathlib import Path
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score

DB = str(Path(__file__).resolve().parent / "helm_offline.db")
app = FastAPI(title="HELM Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
def init_db():
    conn = sqlite3.connect(DB)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS checkins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            astronaut_id TEXT,
            heart_rate REAL,
            blood_pressure_sys REAL,
            blood_pressure_dia REAL,
                        temperature REAL,
            blood_sugar REAL,
            exercise_min REAL,
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
        temperature: Optional[float] = None
      blood_sugar: Optional[float] = None
      exercise_min: Optional[float] = None
    distance_from_earth_km: float

@app.get("/api/status")
def get_status():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM checkins ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    if not row:
        return {"status": "NO DATA"}
    skip = {"id", "astronaut_id", "wellness_score", "autonomy_level", "created_at"}
    vitals = {k: row[k] for k in row.keys() if k not in skip and row[k] is not None}
    return score.compute(vitals)
@app.post("/api/checkin")
def process_checkin(payload: CheckInPayload):
    vitals = payload.model_dump(exclude_none=True)
    result = score.compute(vitals)
    columns = list(vitals.keys()) + ["wellness_score", "autonomy_level"]
    values = list(vitals.values()) + [result["wellness"], result["autonomy"]]
    conn = sqlite3.connect(DB)
    conn.execute(
        f"INSERT INTO checkins ({','.join(columns)}) VALUES ({','.join('?' * len(values))})",
        values,
    )
    conn.commit()
    conn.close()
    return {"status": "success", **result}
