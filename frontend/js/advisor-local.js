/* ==========================================================================
   HELM · local advisor (offline fallback)
   Used only when backend /api/ask is unreachable (no server, or Ollama down).
   Mirrors backend/advisor.py: pick the indicators the question is about, read
   them from the computed status, quote the note file and suggest only actions
   that already exist in the team's system descriptions.
   ========================================================================== */
(function () {
  "use strict";

  const DISCLAIMER = "Not medical advice. This is a wellness aid only.";
  const NOT_COVERED = "That isn't covered in my notes, so I can't answer it reliably. " + DISCLAIMER;

  const KEYWORDS = {
    heart_rate: ["heart", "pulse", "palpitation"],
    blood_pressure_sys: ["blood pressure", "bp", "systolic"],
    blood_pressure_dia: ["blood pressure", "bp", "diastolic"],
    spo2: ["oxygen", "spo2", "saturation", "breath"],
    co2_mmhg: ["co2", "carbon dioxide", "scrubber", "air"],
    o2_partial_pressure_mmhg: ["oxygen supply", "cabin oxygen", "o2 partial"],
    temperature: ["temperature", "fever", "hot", "chills", "infection"],
    radiation_total_msv: ["radiation", "dose", "msv", "career"],
    radiation_event_msv: ["solar", "flare", "storm", "event"],
    exercise_min: ["exercise", "workout", "training", "muscle", "bone", "mobility"],
    blood_sugar: ["sugar", "glucose", "food", "meal", "energy", "nutrition", "hydration", "calorie"],
    sleep_hours: ["sleep", "insomnia", "rest", "tired"],
    stress_score: ["stress", "anxious", "anxiety", "calm"],
    mood_score: ["mood", "motivation", "down", "lonely", "isolat"],
    fatigue_score: ["fatigue", "exhausted", "worn out", "drained"],
  };

  const SYSTEM_WORDS = {
    life_support: ["cardiovascular", "life support", "heart", "circulation"],
    structure: ["musculoskeletal", "structure", "bones"],
    shielding: ["shielding", "radiation", "immune"],
    power: ["metabolic", "nutrition", "power"],
    flight_computer: ["psychological", "flight computer", "mental", "behavioural", "behavioral"],
  };

  const NOTES = {
    heart_rate: "heart_fitness.md", blood_pressure_sys: "heart_fitness.md", blood_pressure_dia: "heart_fitness.md",
    spo2: "oxygen_co2.md", co2_mmhg: "oxygen_co2.md", o2_partial_pressure_mmhg: "oxygen_co2.md",
    temperature: "common_conditions.md",
    radiation_total_msv: "radiation.md", radiation_event_msv: "radiation.md",
    exercise_min: "heart_fitness.md", blood_sugar: "indicator_table.md",
    sleep_hours: "sleep_fatigue.md", fatigue_score: "sleep_fatigue.md",
    stress_score: "mental_stress.md", mood_score: "mental_stress.md",
  };

  const GENERIC = ["wellness", "health", "status", "advice", "recommend", "overall", "how am i",
    "what should i", "autonomy", "signal", "delay", "mission", "crew", "summary"];

  const norm = (s) => " " + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";

  function indicatorsFor(question, status) {
    const q = norm(question);
    const hits = [];
    Object.keys(KEYWORDS).forEach((k) => {
      if (KEYWORDS[k].some((w) => q.indexOf(norm(w)) > -1) && hits.indexOf(k) < 0) hits.push(k);
    });
    Object.keys(SYSTEM_WORDS).forEach((sid) => {
      if (SYSTEM_WORDS[sid].some((w) => q.indexOf(norm(w)) > -1)) {
        Object.keys(KEYWORDS).forEach((k) => {
          if (window.HELM.systemOf(k) === sid && hits.indexOf(k) < 0) hits.push(k);
        });
      }
    });
    // only keep what we actually have a reading for
    return hits.filter((k) => status.indicators && status.indicators[k]);
  }

  function describe(status, key) {
    const ind = status.indicators[key];
    if (!ind) return "";
    const value = window.HELM.num ? window.HELM.num(ind.value) : ind.value;
    const unit = ind.unit || "";
    if (ind.status === "NOMINAL") {
      return ind.label + " is within its normal range (" + value + " " + unit + ").";
    }
    const sid = window.HELM.systemOf(key);
    const action = (window.HELM.SYS[sid] && window.HELM.SYS[sid].actions[0]) || "";
    return ind.label + " is " + ind.status.toLowerCase() + " (" + value + " " + unit + "). " + action;
  }

  function answer(question, status) {
    const q = String(question || "").trim();
    const asked = indicatorsFor(q, status);
    const generic = GENERIC.some((w) => norm(q).indexOf(norm(w)) > -1);

    if (q && !asked.length && !generic) {
      return { answer: NOT_COVERED, source: "offline", notes_used: [] };
    }

    const low = Object.keys(status.indicators || {})
      .filter((k) => (status.indicators[k].score || 100) < 70)
      .sort((a, b) => status.indicators[a].score - status.indicators[b].score);

    const keys = (asked.length ? asked : low).slice(0, 3);
    const parts = [];
    parts.push("Wellness is " + (status.wellness == null ? "unknown" : status.wellness + "/100") +
      " with autonomy " + status.autonomy + "/100.");

    if (!keys.length) {
      parts.push("Every logged indicator is in its normal range. Keep your exercise, sleep and meal schedule as planned.");
    } else {
      keys.forEach((k) => parts.push(describe(status, k)));
    }

    const delay = status.signal_delay_s || 0;
    if (low.length && delay > 60) {
      parts.push("One-way signal delay is about " + Math.round(delay / 60) +
        " minutes, so Earth cannot answer in real time - act on your own protocol first (distance_autonomy.md).");
    }

    const notes = keys.map((k) => NOTES[k]).filter((v, i, a) => v && a.indexOf(v) === i);
    const src = notes.length ? "\n\nSource: " + notes.join(", ") : "";
    return { answer: parts.join(" ") + src + "\n\n" + DISCLAIMER, source: "offline", notes_used: notes };
  }

  window.HELMLocalAdvisor = { answer, NOT_COVERED, DISCLAIMER };
})();
