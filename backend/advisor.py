"""
backend/advisor.py  -- AI advisor (Ollama + rule-based fallback)

The rest of the app only ever calls:
    advise(status: dict, question: str | None = None)
        -> {"answer": str, "source": "llm" | "fallback", "notes_used": [str, ...]}

`status` is exactly what score.compute(...) returns:
    {"wellness": 58,
     "systems":    {"life_support": {"label", "score", "status"}, ...},
     "indicators": {"sleep_hours": {"label", "value", "unit", "drift_pct", "score", "status"}, ...},
     "autonomy": 71, "signal_delay_s": 750.0}

Uses only the Python standard library (no pip install needed).
"""

import json
import os
import re
import urllib.request
from pathlib import Path

# ---------- settings you can change ----------
def ollama_base(url=None):
    """Ollama base URL, from OLLAMA_URL or the local default.

    A full endpoint (/api/chat, /api/tags) is accepted as well, so an old value
    from another machine still works.
    """
    base = (url if url is not None else os.environ.get("OLLAMA_URL") or "").strip()
    base = (base or "http://127.0.0.1:11434").rstrip("/")
    for suffix in ("/api/chat", "/api/tags"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
    return base.rstrip("/")

OLLAMA_BASE = ollama_base()      # set OLLAMA_URL to point at another machine
OLLAMA_CHAT_URL = OLLAMA_BASE + "/api/chat"
OLLAMA_TAGS_URL = OLLAMA_BASE + "/api/tags"
MODEL = os.environ.get("OLLAMA_MODEL") or "llama3.2:3b"   # or "qwen2.5:3b"
TIMEOUT_SECONDS = 30             # first call after a cold start can be slow on a laptop; later calls take ~1-5 s
NOMINAL_MIN = 70                 # same as score.py: below this = CAUTION / WARNING
HIGH_DELAY_S = 60                # above this, remind the astronaut Earth can't help in real time
ESCALATE = ("One or more values are outside the safe band: contact the flight surgeon "
            "or the ground medical team now.")
MODE_LABEL = {"iss": "ISS / LEO", "moon": "Moon / lunar vicinity", "mars": "Mars transit"}
MAX_NOTES = 3                    # small models cope badly with long prompts
MAX_NOTE_CHARS = 1500
MAX_ANSWER_CHARS = 700
KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"

DISCLAIMER = "Not medical advice. This is a wellness aid only."
NOT_COVERED = "That isn't covered in my notes, so I can't answer it reliably. " + DISCLAIMER

# Copy of the system -> indicators map in score.py (keep in sync if the logic lead changes it).
SYSTEM_INDICATORS = {
    "structure":       ["exercise_min"],
    "life_support":    ["heart_rate", "blood_pressure_sys", "blood_pressure_dia", "spo2", "co2_mmhg", "o2_partial_pressure_mmhg"],
    "shielding":       ["radiation_total_msv", "radiation_event_msv", "temperature"],
    "power":           ["blood_sugar"],
    "flight_computer": ["sleep_hours", "stress_score", "mood_score", "fatigue_score"],
}

# Words in a question -> which indicator it is about.
KEYWORDS = {
    "exercise_min":             ["exercise", "workout", "fitness", "muscle", "bone"],
    "heart_rate":               ["heart", "pulse", "heart rate"],
    "blood_pressure_sys":       ["blood pressure", "bp", "systolic"],
    "blood_pressure_dia":       ["blood pressure", "bp", "diastolic"],
    "co2_mmhg":                 ["co2", "carbon dioxide"],
    "o2_partial_pressure_mmhg": ["oxygen", "o2"],
    "radiation_total_msv":      ["radiation", "dose", "msv"],
    "radiation_event_msv":      ["radiation", "solar", "flare", "storm"],
    "temperature":              ["temperature", "temp", "heat", "cold"],
    "blood_sugar":              ["blood sugar", "glucose", "sugar", "food", "energy"],
    "sleep_hours":              ["sleep", "insomnia", "rest", "tired", "fatigue"],
    "stress_score":             ["stress", "anxiety", "mood", "calm"],
    "spo2":                     ["oxygen saturation", "spo2", "saturation", "breathing"],
    "mood_score":               ["mood", "moral", "motivation", "down", "low"],
    "fatigue_score":            ["fatigue", "exhausted", "worn out", "energy"],
}
SYSTEM_KEYWORDS = {
    "structure": ["structure"], "life_support": ["life support"], "shielding": ["shielding"],
    "power": ["power"], "flight_computer": ["flight computer"],
}
# Questions with none of the words above are only allowed if they are general wellness questions.
GENERIC_WORDS = ["wellness", "health", "status", "advice", "advise", "recommend", "overall",
                 "how am i", "what should i", "autonomy", "delay", "signal", "risk", "mission", "crew"]

# Extra note-file names to look for, besides the indicator key and system id
# (e.g. knowledge/sleep.md is found for sleep_hours). Edit to match the research lead's file names.
NOTE_ALIASES = {
    "o2_partial_pressure_mmhg": ["oxygen"],
    "spo2": ["oxygen"],
    "co2_mmhg": ["carbon_dioxide", "oxygen_co2", "co2"],
    "blood_sugar": ["glucose", "nutrition", "common_conditions"],
    "stress_score": ["psych", "mental"],
    "mood_score": ["mental", "stress"],
    "fatigue_score": ["sleep", "fatigue"],
    # the note files are named by topic, not by column: map the common ones
    "sleep_hours": ["sleep", "fatigue"],
    "exercise_min": ["fitness", "heart"],
    "heart_rate": ["heart"],
    "blood_pressure_sys": ["common_conditions", "blood"],
    "blood_pressure_dia": ["common_conditions", "blood"],
    "temperature": ["common_conditions"],
}

# ---------- rule-based fallback (research lead: replace with the 'actions' column of the indicator table) ----------
FALLBACK_ACTIONS = {
    "exercise_min":             "Do a scheduled exercise session to keep muscles and bones conditioned.",
    "heart_rate":               "Rest, breathe slowly, and re-check your heart rate in a few minutes.",
    "blood_pressure_sys":       "Rest, avoid caffeine and salty food, and re-check your blood pressure later.",
    "blood_pressure_dia":       "Rest, avoid caffeine and salty food, and re-check your blood pressure later.",
    "co2_mmhg":                 "Check cabin ventilation and CO2 scrubbers, and reduce strenuous activity until it improves.",
    "o2_partial_pressure_mmhg": "Check the oxygen supply and cabin pressure, and follow the oxygen-low procedure.",
    "radiation_total_msv":      "Limit time in high-radiation areas and log your cumulative dose.",
    "radiation_event_msv":      "Move to the best-shielded area of the spacecraft until the event passes.",
    "temperature":              "Check cabin temperature controls and adjust clothing or ventilation.",
    "blood_sugar":              "Eat a balanced meal at a regular time and drink water.",
    "sleep_hours":              "Protect a fixed sleep window, dim lights before bed, and avoid screens late.",
    "stress_score":             "Try 5 minutes of slow breathing, take a short break, and talk to the crew or ground.",
    "spo2":                     "Sit still, breathe normally and re-check the sensor; report a persistent drop to the crew medical officer.",
    "mood_score":               "Schedule a call with crew or family, keep your daily routine, and tell the commander how you feel.",
    "fatigue_score":            "Shorten today's strenuous tasks, hydrate, and protect the next sleep window.",
}

DEFAULT_SYSTEM_PROMPT = """You are a spacecraft wellness advisor.
Rules:
- Answer ONLY using the NOTES provided. If the notes don't cover the question, reply exactly: "Not in my notes."
- Never give a medical diagnosis.
- Be short: 3-4 sentences max.
- End with: Source: <note name>
- Suggest ONLY actions that are written in the notes. Do not add any other advice, numbers, devices or tips.
- Do not invent facts. Only use numbers that appear in STATUS or NOTES."""


# ---------- small helpers ----------
def _norm(text):
    """Lowercase, punctuation -> spaces, padded so ' sleep ' matches whole words only."""
    return " " + re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip() + " "


def _system_of(key):
    for sid, keys in SYSTEM_INDICATORS.items():
        if key in keys:
            return sid
    return ""


def question_indicators(question):
    q = _norm(question)
    hits = [k for k, words in KEYWORDS.items() if any(_norm(w) in q for w in words)]
    for sid, words in SYSTEM_KEYWORDS.items():
        if any(_norm(w) in q for w in words):
            hits += [k for k in SYSTEM_INDICATORS[sid] if k not in hits]
    return hits


def is_generic(question):
    q = _norm(question)
    return any(_norm(w) in q for w in GENERIC_WORDS)


def critical_indicators(status):
    """Indicator keys scored WARNING by score.py (the lowest band)."""
    return [k for k, v in status.get("indicators", {}).items()
            if str(v.get("status", "")).upper() == "WARNING"]


def _mission_block(status, context):
    """The real mission facts the prompt is built from (never guessed by the model)."""
    ctx = context or {}
    mode_key = str(ctx.get("mode") or "").strip().lower()
    mode = MODE_LABEL.get(mode_key) or (ctx.get("mode") or None)
    lines = []
    if ctx.get("mission_day") is not None:
        lines.append("Mission day: " + str(ctx.get("mission_day")))
    if mode:
        lines.append("Location mode: " + str(mode))
    km = ctx.get("distance_km")
    if isinstance(km, (int, float)):
        lines.append("Distance from Earth: " + format(round(km), ",") + " km")
    delay = status.get("signal_delay_s")
    if isinstance(delay, (int, float)):
        lines.append("Signal delay: " + str(round(delay, 1)) + " s (one way)")
    checkin = ctx.get("checkin")
    if isinstance(checkin, dict) and checkin:
        clean = {k: v for k, v in checkin.items() if v is not None and k not in ("_api", "events")}
        if clean:
            lines.append("Latest check-in: " + json.dumps(clean, sort_keys=True))
    return "\n".join(lines) or "No mission context was supplied."


def low_indicators(status):
    """Indicator keys whose score is below NOMINAL_MIN, worst first."""
    low = [(k, v) for k, v in status.get("indicators", {}).items()
           if isinstance(v.get("score"), (int, float)) and v["score"] < NOMINAL_MIN]
    low.sort(key=lambda kv: kv[1]["score"])
    return [k for k, _ in low]


# ---------- notes ----------
def load_notes():
    """{note_name: text} for every knowledge/*.md file (skips the prompt file)."""
    notes = {}
    if KNOWLEDGE_DIR.exists():
        for p in sorted(KNOWLEDGE_DIR.glob("*.md")):
            if p.stem.lower() not in ("advisor_prompt", "readme"):
                notes[p.stem.lower()] = p.read_text(encoding="utf-8")
    return notes


def load_system_prompt():
    p = KNOWLEDGE_DIR / "advisor_prompt.md"
    return p.read_text(encoding="utf-8") if p.exists() else DEFAULT_SYSTEM_PROMPT


def find_notes(keys, notes):
    """Pick the few notes that match these indicators (by indicator key, system id or alias)."""
    found = []
    for key in keys:
        cands = [key, _system_of(key)] + NOTE_ALIASES.get(key, [])
        for stem in notes:
            if stem in found or len(stem) < 3:
                continue
            if any(c and (stem == c or stem in c or c in stem) for c in cands):
                found.append(stem)
    return found[:MAX_NOTES]


# ---------- fallback ----------
def _describe(status, key):
    ind = status.get("indicators", {}).get(key)
    if not ind:
        return None
    label, value, unit = ind.get("label", key), ind.get("value"), ind.get("unit", "")
    score = ind.get("score")
    if isinstance(score, (int, float)) and score < NOMINAL_MIN:
        return f"{label} is {str(ind.get('status', 'low')).lower()} ({value} {unit}). {FALLBACK_ACTIONS.get(key, '')}".strip()
    return f"{label} is within its normal range ({value} {unit})."


def fallback_answer(status, asked=()):
    wellness = status.get("wellness", "n/a")
    low = low_indicators(status)
    parts = [f"Wellness is {wellness}/100."]
    if critical_indicators(status):
        parts.append(ESCALATE)

    shown = []
    for key in list(asked) + low:          # what they asked about first, then the worst problems
        if key not in shown:
            shown.append(key)
    shown = shown[:3]

    if not shown:
        parts.append("All indicators look nominal. Keep up your routines.")
    for key in shown:
        line = _describe(status, key)
        if line:
            parts.append(line)

    delay = status.get("signal_delay_s") or 0
    if low and delay > HIGH_DELAY_S:
        parts.append(f"Signal delay is about {round(delay / 60)} min, so don't count on real-time help from Earth; "
                     f"use your own judgement (autonomy {status.get('autonomy', 'n/a')}/100).")
    parts.append(DISCLAIMER)
    return {"answer": " ".join(parts), "source": "fallback", "notes_used": []}


# ---------- Ollama ----------
def call_ollama(system_prompt, user_message):
    body = json.dumps({
        "model": MODEL,
        "stream": False,
        "keep_alive": "30m",             # keep the model loaded between questions
        "options": {"temperature": 0.1},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    }).encode("utf-8")
    req = urllib.request.Request(OLLAMA_CHAT_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        return json.loads(resp.read())["message"]["content"].strip()


def _compact_status(status, keys):
    """Only what the model needs, to keep the prompt short."""
    ind = status.get("indicators", {})
    return {
        "wellness": status.get("wellness"),
        "autonomy": status.get("autonomy"),
        "signal_delay_s": status.get("signal_delay_s"),
        "systems": {k: {"score": v.get("score"), "status": v.get("status")}
                    for k, v in status.get("systems", {}).items()},
        # drift_pct is left out on purpose: the small model misread it (e.g. "hours are lower than reported").
        "indicators": {k: {f: ind[k].get(f) for f in ("label", "value", "unit", "score", "status")}
                       for k in keys if k in ind},
    }


def ping(timeout=2.0):
    """True when the Ollama server answers. Used by GET /api/health."""
    try:
        with urllib.request.urlopen(OLLAMA_TAGS_URL, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def model_ready(timeout=2.0):
    """True only when the local server answers AND it has the configured model pulled.

    GET /api/health reports `llm` from this, so a running Ollama without
    llama3.2:3b is reported honestly as llm: false.
    """
    try:
        with urllib.request.urlopen(OLLAMA_TAGS_URL, timeout=timeout) as resp:
            if resp.status != 200:
                return False
            tags = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return False
    base = MODEL.split(":")[0]
    for m in tags.get("models", []):
        name = str(m.get("name") or m.get("model") or "")
        if name == MODEL or name.startswith(base):
            return True
    return False


# ---------- the one function everyone calls ----------
def advise(status, question=None, context=None):
    q = (question or "").strip() or None
    asked = question_indicators(q) if q else []

    # Off-topic question -> don't let the model invent anything.
    if q and not asked and not is_generic(q):
        return {"answer": NOT_COVERED, "source": "fallback", "notes_used": []}

    # No measurements at all: say so instead of letting the model guess.
    if not status.get("indicators"):
        return {"answer": "not enough data: no check-in has been recorded yet. " + DISCLAIMER,
                "source": "fallback", "notes_used": []}

    low = low_indicators(status)
    if not q and not low:                      # nothing wrong and nothing asked: no need for the LLM
        return fallback_answer(status)

    keys = asked + [k for k in low if k not in asked]
    if not keys:                               # general question, everything nominal: still use the model
        keys = ["sleep_hours", "stress_score", "heart_rate"]
    notes = load_notes()
    used = find_notes(keys, notes)
    if not used:                               # no matching notes yet -> rule-based answer
        return fallback_answer(status, asked)

    notes_text = "\n\n".join(f"### NOTE: {n}\n{notes[n][:MAX_NOTE_CHARS]}" for n in used)
    critical = critical_indicators(status)
    user_message = (
        f"MISSION:\n{_mission_block(status, context)}\n\n"
        f"STATUS:\n{json.dumps(_compact_status(status, keys[:6]))}\n\n"
        f"NOTES:\n{notes_text}\n\n"
        + (f"CRITICAL: {', '.join(critical)} scored WARNING. {ESCALATE}\n\n" if critical else "")
        + f"QUESTION: {q or 'Give me advice based on my current status.'}"
    )

    try:
        answer = call_ollama(load_system_prompt(), user_message)
    except Exception:                          # Ollama off, too slow, or errored
        return fallback_answer(status, asked)

    # Reject empty answers, or answers that cite none of the notes we sent.
    low_answer = answer.lower()
    cited = any(n in low_answer or n.replace("_", " ") in low_answer for n in used) or "not in my notes" in low_answer
    if not answer or not cited:
        return fallback_answer(status, asked)

    return {"answer": f"{answer[:MAX_ANSWER_CHARS]}\n\n{DISCLAIMER}", "source": "llm", "notes_used": used}


if __name__ == "__main__":
    # Hand-made sample in the same shape score.compute() returns.
    demo = {
        "wellness": 58, "autonomy": 71, "signal_delay_s": 750.0,
        "systems": {"life_support": {"label": "Life support", "score": 55, "status": "CAUTION"},
                    "flight_computer": {"label": "Flight computer", "score": 55, "status": "CAUTION"}},
        "indicators": {
            "sleep_hours":        {"label": "Sleep", "value": 4.5, "unit": "h", "drift_pct": -35.0, "score": 55, "status": "CAUTION"},
            "blood_pressure_sys": {"label": "Systolic BP", "value": 150, "unit": "mmHg", "drift_pct": 20.0, "score": 55, "status": "CAUTION"},
            "heart_rate":         {"label": "Heart rate", "value": 72, "unit": "bpm", "drift_pct": 0.0, "score": 100, "status": "NOMINAL"},
        },
    }
    for question in [None, "Why is my sleep score low?", "Who won the cricket match?"]:
        print("Q:", question)
        print(advise(demo, question), "\n")