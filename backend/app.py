import sys
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score

try:
    import advisor  # local Ollama advisor, optional: the API still works without it
except Exception:  # pragma: no cover - advisor is pure stdlib, this is a safety net
    advisor = None

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
    # Additive migration: new optional columns never touch existing rows.
    # (The 5-category assessment added SpO2, mood and fatigue to the original 13 vitals.)
    have = {r[1] for r in conn.execute("PRAGMA table_info(checkins)")}
    for col in ("spo2", "mood_score", "fatigue_score", "mobility_index"):
        if col not in have:
            conn.execute(f"ALTER TABLE checkins ADD COLUMN {col} REAL")
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
    spo2: Optional[float] = None
    mood_score: Optional[float] = None
    fatigue_score: Optional[float] = None
    mobility_index: Optional[float] = None   # written by the physical-scan page
    distance_from_earth_km: float


class AskPayload(BaseModel):
    question: str
    astronaut_id: Optional[str] = None
    vitals: Optional[dict] = None   # optional: compute the status from these instead of the DB row
    mode: Optional[str] = None      # iss | moon | mars, as selected on the page
    mission_day: Optional[int] = None
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


# ---------------------------------------------------------------------------
# Additive endpoints used by the redesigned frontend. The two endpoints above
# keep their original request/response contract.
# ---------------------------------------------------------------------------
HISTORY_SKIP = {"id", "astronaut_id"}


@app.get("/api/history")
def get_history(limit: int = 90):
    """Chronological check-ins for the analytics page (oldest first)."""
    limit = max(1, min(limit, 3650))
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM checkins ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    out = []
    for row in reversed(rows):
        item = {k: row[k] for k in row.keys() if k not in HISTORY_SKIP}
        out.append(item)
    return {"count": len(out), "checkins": out}


@app.post("/api/ask")
def ask(payload: AskPayload):
    """Local-LLM advisor. Uses the request vitals if given, else the newest DB row."""
    try:
        return _ask(payload)
    except Exception as exc:  # the endpoint must never take the server down
        return JSONResponse(status_code=503, content={
            "error": "advisor failed: " + exc.__class__.__name__ + ": " + str(exc)[:200],
            "source": "error",
        })


def _mode_of(km):
    """Same three modes the page offers, derived from the distance when not sent."""
    if not isinstance(km, (int, float)):
        return None
    if km < 1000:
        return "iss"
    if km < 1000000:
        return "moon"
    return "mars"


def _ask(payload: AskPayload):
    vitals = dict(payload.vitals or {})
    if not vitals:
        conn = sqlite3.connect(DB)
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM checkins ORDER BY id DESC LIMIT 1").fetchone()
        conn.close()
        if row:
            skip = {"id", "astronaut_id", "wellness_score", "autonomy_level", "created_at"}
            vitals = {k: row[k] for k in row.keys() if k not in skip and row[k] is not None}
    status = score.compute(vitals) if vitals else {
        "wellness": None, "systems": {}, "indicators": {}, "autonomy": 0, "signal_delay_s": 0
    }

    # Everything the prompt is built from comes from here: real numbers only.
    context = {
        "mode": payload.mode or _mode_of(vitals.get("distance_from_earth_km")),
        "mission_day": payload.mission_day,
        "distance_km": vitals.get("distance_from_earth_km"),
        "checkin": vitals,
    }

    if advisor is None:
        return {"answer": "The local advisor module is not available on this machine.",
                "source": "unavailable", "notes_used": [], "status": status}
    result = advisor.advise(status, payload.question, context)
    return {**result, "status": status}


@app.get("/api/health")
def health():
    """Cheap probe used by the frontend to decide between live and offline mode.

    Calling Ollama directly here blocked for ~4 s on a machine without it (the
    localhost connect attempt retries), which made the frontend probe look like
    a dead backend. The probe therefore answers from a cache and refreshes it in
    the background, so the response stays instant either way.
    """
    if advisor is None:
        return {"status": "ok", "llm": False, "model": None}

    stale = time.time() - _LLM_CACHE["ts"] > LLM_CACHE_TTL_S
    if stale and not _LLM_CACHE["busy"]:
        _LLM_CACHE["busy"] = True
        threading.Thread(target=_refresh_llm, daemon=True).start()

    return {"status": "ok", "llm": _LLM_CACHE["llm"], "model": getattr(advisor, "MODEL", None)}


LLM_CACHE_TTL_S = 15.0
_LLM_CACHE = {"llm": False, "ts": 0.0, "busy": False}


def _refresh_llm():
    try:
        check = getattr(advisor, "model_ready", None) or advisor.ping
        _LLM_CACHE["llm"] = bool(check(timeout=1.5))
    except Exception:
        _LLM_CACHE["llm"] = False
    finally:
        _LLM_CACHE["ts"] = time.time()
        _LLM_CACHE["busy"] = False
