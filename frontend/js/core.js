/* ==========================================================================
   HELM · core
   Shared state, scoring (mirrors backend/score.py), API bridge and app shell.
   Everything here runs from static files, so the crew UI keeps working with
   the backend switched off. No third-party libraries, no network assets.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- config */
  const CFG = {
    // Same-origin first (when uvicorn serves the app), then the local API port.
    apiBases: (function () {
      const list = [""];
      const host = typeof location !== "undefined" ? location.hostname : "";
      if (host === "localhost" || host === "127.0.0.1") {
        list.push("http://" + host + ":8001");
        list.push("http://127.0.0.1:8001");
      }
      return list.filter((v, i, a) => a.indexOf(v) === i);
    })(),
    probeTimeout: 3000,
    requestTimeout: 45000, // the local LLM can be slow on a cold start
    storagePrefix: "helm.v1.",
    driftPct: 20,
    nominalMin: 70,
    cautionMin: 40,
    wellnessCap: 60,
    maxDelayS: 1200,
    lightKmPerS: 299792.458,
    astronautId: "crew-b",
  };

  const ICON = {
    helm: '<path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z"/><path d="M12 7v6M9 10h6"/>',
    crosshair: '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    clipboard: '<path d="M9 3h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M9 12h6M9 16h4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 4-6"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 3 3"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-3 3"/><path d="M12 4v16"/>',
    scan: '<path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3"/><circle cx="12" cy="11" r="2.4"/><path d="M8.5 20c.6-2.3 1.9-3.6 3.5-3.6s2.9 1.3 3.5 3.6"/>',
    heart: '<path d="M12 20s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.7-7 9-7 9Z"/>',
    muscle: '<path d="M5 14c0-3 2-5 5-5h3a4 4 0 0 1 4 4v1"/><path d="M5 14v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-2"/><path d="M9 9V6"/>',
    radiation: '<circle cx="12" cy="12" r="2"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><path d="M6.3 6.3 9 9M15 15l2.7 2.7M17.7 6.3 15 9M9 15l-2.7 2.7"/>',
    leaf: '<path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14"/><path d="M5 19c3-4 6-6.5 9-8"/>',
    thermometer: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v6"/>',
    droplet: '<path d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z"/>',
    activity: '<path d="M3 12h4l2.5-6 4 12L16 12h5"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    signal: '<path d="M5 18v-4M10 18v-8M15 18V6M20 18v-2"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
    micOff: '<path d="M4 4l16 16"/><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 11 5.5"/><path d="M12 18v3"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>',
    volumeOff: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M4 4l16 16"/>',
    send: '<path d="M4 12 20 4l-7 16-2.5-6.5L4 12Z"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3h16v-3"/>',
    camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13" r="3.4"/><path d="M8 7l1.4-2h5.2L16 7"/>',
    play: '<path d="M8 5l11 7-11 7V5Z"/>',
    check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
    alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    offline: '<path d="M2 3l19 19"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M5 12a10 10 0 0 1 4-2.4"/><path d="M15 9.6A10 10 0 0 1 19 12"/><path d="M12 19h.01"/>',
    shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.5 6.4"/><path d="M20 4v7h-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
    lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
    download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
    chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
    chevronRight: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
  };

  function icon(name, cls) {
    const body = ICON[name] || ICON.info;
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" class="ico' + (cls ? " " + cls : "") + '"' +
      ' aria-hidden="true">' + body + "</svg>"
    );
  }

  /* ------------------------------------------------------------- knowledge */
  // System descriptions and sources were already written by the team in the
  // original panel. Kept verbatim: they cite the NASA HRP/CSA material.
  const SYS = {
    life_support: {
      label: "Cardiovascular",
      body: "Heart, circulation & oxygen",
      icon: "heart",
      why: "Weightlessness alters blood circulation and how the heart and blood vessels work. Low oxygen and high carbon dioxide are also flagged risks.",
      src: "NASA HRP: Cardiovascular Adaptations; Hypoxia",
      actions: [
        "Stop strenuous activity and rest, then re-check.",
        "Check cabin air readouts if breathing feels harder than usual.",
        "Report persistent changes to the flight surgeon.",
      ],
    },
    structure: {
      label: "Musculoskeletal",
      body: "Bones, muscle & mobility",
      icon: "muscle",
      why: "Without gravity, bones break down and become more brittle. Exercise counteracts losses in bone density, muscle strength and heart performance.",
      src: "NASA HRP: Spaceflight-Induced Bone Changes; Reduced Cardiorespiratory and Musculoskeletal Fitness",
      actions: [
        "Complete your scheduled exercise session today.",
        "If short on time, shorten the session rather than skipping it.",
        "Report new pain or weakness at your next contact with the flight surgeon.",
      ],
    },
    shielding: {
      label: "Radiation & Immune",
      body: "Dose exposure & immune response",
      icon: "radiation",
      why: "Spaceflight stress can awaken dormant viruses and change microbiomes. Radiation adds up over the whole mission, and neutrons are about 30% of radiation on the ISS.",
      src: "NASA HRP: Altered Immune System Responses; Host-Microorganism Interactions; CSA: Monitoring Radiation for Astronaut Health",
      actions: [
        "Rest and re-check temperature after a while.",
        "If you have a fever, limit close contact with crewmates as your protocol directs.",
        "Stay hydrated as your protocol advises, and report to the flight surgeon.",
      ],
    },
    power: {
      label: "Nutrition & Metabolic",
      body: "Energy, glucose & hydration",
      icon: "leaf",
      why: "A healthy, balanced diet is essential to crew health and performance on long missions.",
      src: "NASA HRP: Inadequate Food and Nutrition",
      actions: [
        "Eat your scheduled meals even if appetite is low.",
        "Log intake so trends are visible.",
        "Report sustained appetite loss to the flight surgeon.",
      ],
    },
    flight_computer: {
      label: "Psychological",
      body: "Sleep, stress, mood & fatigue",
      icon: "brain",
      why: "Isolation, confinement and disrupted light cycles affect sleep and behavioral health. NASA tracks sleep and activity with wearables on Artemis II.",
      src: "NASA HRP: Sensorimotor and Vestibular Function; ARCHeR study; CSA: Preparing for deep-space destinations",
      actions: [
        "Protect a consistent sleep window and keep the cabin calm before it.",
        "Talk to crewmates or Earth support about mood.",
        "Report any vision change promptly.",
      ],
    },
  };

  // Assessment tabs. Each maps 1:1 onto a scoring system (cardio also carries
  // the cabin-environment readings, which belong to life support).
  const CATEGORIES = [
    {
      id: "cardio", sys: "life_support", name: "Cardiovascular", icon: "heart",
      short: "Heart & oxygen",
      blurb: "Resting vitals and oxygen delivery. Take readings seated, after five minutes of rest.",
      keys: ["heart_rate", "blood_pressure_sys", "blood_pressure_dia", "spo2"],
      env: ["co2_mmhg", "o2_partial_pressure_mmhg"],
      notInstrumented: [],
    },
    {
      id: "musculo", sys: "structure", name: "Musculoskeletal", icon: "muscle",
      short: "Bones & mobility",
      blurb: "Daily exercise load protects bone density and muscle strength in microgravity.",
      keys: ["exercise_min"],
      notInstrumented: [
        ["Muscle strength (grip / leg press)", "Needs a dynamometer or the ARED force log. Not instrumented yet."],
        ["Mobility screen", "Computed from the movement scan when a pose model is installed on the physical assessment page."],
      ],
    },
    {
      id: "radiation", sys: "shielding", name: "Radiation & Immune", icon: "radiation",
      short: "Dose & immune",
      blurb: "Cumulative and single-event dose, plus body temperature as the available immune signal.",
      keys: ["radiation_total_msv", "radiation_event_msv", "temperature"],
      notInstrumented: [
        ["Immune panel (cytokines, latent virus reactivation)", "Requires in-flight blood and saliva analysis. Not instrumented yet."],
      ],
    },
    {
      id: "nutrition", sys: "power", name: "Nutrition & Metabolic", icon: "leaf",
      short: "Energy & glucose",
      blurb: "Metabolic measurements currently logged by the crew. Hydration and intake are hand-entered.",
      keys: ["blood_sugar"],
      notInstrumented: [
        ["Hydration index", "Needs the water-recovery log. Field reserved in the data contract."],
        ["Calorie intake", "Needs the galley intake tracker. Field reserved in the data contract."],
      ],
    },
    {
      id: "psych", sys: "flight_computer", name: "Psychological", icon: "brain",
      short: "Sleep & stress",
      blurb: "Self-reported state plus sleep duration. Used by the AI assistant and the movement fatigue index.",
      keys: ["sleep_hours", "stress_score", "mood_score", "fatigue_score"],
      notInstrumented: [],
    },
  ];

  const MODES = {
    iss: { label: "ISS / LEO", km: 400, note: "Low Earth orbit" },
    moon: { label: "Lunar", km: 384400, note: "Lunar vicinity" },
    mars: { label: "Mars transit", km: 225000000, note: "Deep space" },
  };

  /* --------------------------------------------------------------- helpers */
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

  function num(v, digits) {
    if (v == null || Number.isNaN(v)) return "--";
    const d = digits == null ? 1 : digits;
    return Math.abs(v) >= 100 ? String(Math.round(v)) : String(round(v, d));
  }

  function statusOf(score) {
    if (score == null) return "NO DATA";
    if (score >= CFG.nominalMin) return "NOMINAL";
    if (score >= CFG.cautionMin) return "CAUTION";
    return "WARNING";
  }
  const clsOf = (st) => "is-" + String(st || "NO DATA").toLowerCase().replace(/\s+/g, "");
  const labelOf = (v) => {
    const t = THRESHOLDS[v];
    return t ? t.label : v;
  };

  function fmtDelay(s) {
    if (s == null) return "--";
    if (s < 1) return "under 1 s";
    if (s < 90) return round(s, 1) + " s";
    return Math.round(s / 60) + " min";
  }

  function fmtDate(iso) {
    if (!iso) return "--";
    const d = new Date(iso.replace(" ", "T") + (iso.length <= 19 ? "Z" : ""));
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function daysAgo(iso) {
    if (!iso) return null;
    const d = new Date(iso.replace(" ", "T") + (iso.length <= 19 ? "Z" : ""));
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
  }

  /* ---------------------------------------------------------------- storage */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(CFG.storagePrefix + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(CFG.storagePrefix + key, JSON.stringify(value));
      } catch (e) {
        /* storage full or blocked: the app still works for this session */
      }
    },
    del(key) {
      try { localStorage.removeItem(CFG.storagePrefix + key); } catch (e) {}
    },
  };

  /* ------------------------------------------------------------------ state */
  let THRESHOLDS = {};
  let DEMO = { astronaut: "Crew member", readings: [] };
  let LOCAL = [];          // locally saved check-ins (offline record)
  let API_LOG = [];        // check-ins pulled from the backend
  let state = {
    mode: "mars",
    apiBase: null,
    online: false,
    llm: false,
    llmModel: null,
    loaded: false,
    lastSync: null,
  };

  const listeners = [];
  const on = (fn) => listeners.push(fn);
  const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

  /* -------------------------------------------------------------- scoring */
  // Byte-for-byte logic of backend/score.py so the UI agrees with the API.
  function indicatorScore(value, t) {
    const ch = t.critical_high, cl = t.critical_low, wh = t.warning_high, wl = t.warning_low;
    if ((ch != null && value >= ch) || (cl != null && value <= cl)) return 20;
    if ((wh != null && value >= wh) || (wl != null && value <= wl)) return 55;
    return 100;
  }

  function delaySeconds(km) { return (km || 0) / CFG.lightKmPerS; }

  function autonomy(distanceKm, worst) {
    const delayFactor = Math.min(1, delaySeconds(distanceKm) / CFG.maxDelayS);
    const severity = (100 - worst) / 100;
    return Math.round(100 * (0.4 * delayFactor + 0.6 * severity));
  }

  const CUMULATIVE = ["radiation_total_msv", "radiation_event_msv"];

  function compute(vitals, baselines) {
    const ind = {};
    Object.keys(THRESHOLDS).forEach((key) => {
      const v = vitals[key];
      if (v == null) return;
      const t = THRESHOLDS[key];
      let sc = indicatorScore(v, t);
      const b = baselines ? baselines[key] : null;
      const d = b ? ((v - b) / b) * 100 : null;
      if (d != null && Math.abs(d) >= CFG.driftPct) sc = Math.min(sc, 60);
      ind[key] = {
        label: t.label || key, value: v, unit: t.unit || "",
        drift_pct: d == null ? null : round(d, 1), score: sc, status: statusOf(sc),
      };
    });

    const systems = {};
    Object.keys(SYS).forEach((sid) => {
      const keys = Object.keys(THRESHOLDS).filter((k) => systemOf(k) === sid);
      const scores = keys.filter((k) => ind[k]).map((k) => ind[k].score);
      const sc = scores.length ? Math.min.apply(null, scores) : null;
      systems[sid] = { label: SYS[sid].label, score: sc, status: statusOf(sc) };
    });

    const scored = Object.values(systems).map((s) => s.score).filter((x) => x != null);
    let wellness = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 100;
    const worst = scored.length ? Math.min.apply(null, scored) : 100;
    if (worst < CFG.cautionMin) wellness = Math.min(wellness, CFG.wellnessCap);

    const dist = vitals.distance_from_earth_km || 0;
    return {
      wellness, systems, indicators: ind,
      autonomy: autonomy(dist, worst), worst,
      signal_delay_s: round(delaySeconds(dist), 1),
    };
  }

  // indicator -> scoring system (mirror of score.SYSTEMS, built from CATEGORIES)
  const SYS_KEYS = {};
  CATEGORIES.forEach((c) => {
    SYS_KEYS[c.sys] = SYS_KEYS[c.sys] || [];
    c.keys.concat(c.env || []).forEach((k) => SYS_KEYS[c.sys].push(k));
  });
  function systemOf(key) {
    for (const sid in SYS_KEYS) if (SYS_KEYS[sid].indexOf(key) > -1) return sid;
    return null;
  }

  function baselines() {
    const src = DEMO.readings.slice(0, 3);
    const out = {};
    Object.keys(THRESHOLDS).forEach((k) => {
      if (CUMULATIVE.indexOf(k) > -1) return;
      const vals = src.map((r) => r[k]).filter((v) => v != null);
      if (!vals.length) return;
      const sum = vals.reduce((a, b) => a + b, 0);
      if (sum !== 0) out[k] = sum / vals.length;
    });
    return out;
  }
  let BASE = {};

  /* ------------------------------------------------------------------ data */
  function mergeTimeline() {
    // Demo days first, then this device's check-ins, then any backend rows that
    // are not already in the local record (the same check-in is pushed and stored).
    const demo = DEMO.readings.slice();
    const lastDemoDay = demo.length ? demo[demo.length - 1].day || 0 : 0;
    const local = LOCAL.slice().sort((a, b) => (a.day || 0) - (b.day || 0));

    const min = (iso) => {
      const t = Date.parse(String(iso || "").replace(" ", "T"));
      return Number.isNaN(t) ? null : t;
    };
    const localTimes = local.map((l) => min(l.created_at)).filter((x) => x != null);

    const apiRows = API_LOG.filter((c) => {
      const t = min(c.created_at);
      if (t == null) return false;
      // same measurement already recorded offline?
      return !localTimes.some((lt) => Math.abs(lt - t) < 180000);
    }).sort((a, b) => (min(a.created_at) || 0) - (min(b.created_at) || 0));

    let nextDay = Math.max(lastDemoDay, local.length ? (local[local.length - 1].day || 0) : 0);
    const api = apiRows.map((c) => {
      nextDay += 1;
      return Object.assign({}, c, { day: nextDay, _api: true });
    });

    return demo.concat(local, api).sort((a, b) => (a.day || 0) - (b.day || 0));
  }

  function timeline() { return mergeTimeline(); }

  function latest() {
    const t = timeline();
    return t.length ? t[t.length - 1] : {};
  }

  function currentStatus() {
    const v = Object.assign({}, latest());
    if (v.distance_from_earth_km == null) v.distance_from_earth_km = MODES[state.mode].km;
    return compute(v, BASE);
  }

  function withMode(v, mode) {
    const o = Object.assign({}, v);
    o.distance_from_earth_km = MODES[mode || state.mode].km;
    return o;
  }

  function dayLabel(v) {
    if (v.day != null) return "Day " + v.day;
    return v.created_at ? fmtDate(v.created_at) : "Check-in";
  }

  /* ------------------------------------------------------------------- API */
  const api = {
    async request(path, options, timeout) {
      const base = state.apiBase;
      if (base == null && path !== "/api/health") throw new Error("offline");
      const url = (base == null ? "" : base) + path;
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), timeout || CFG.requestTimeout);
      try {
        const res = await fetch(url, Object.assign({ signal: ctrl ? ctrl.signal : undefined }, options));
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },

    async probe() {
      for (const base of CFG.apiBases) {
        try {
          const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
          const timer = setTimeout(() => ctrl && ctrl.abort(), CFG.probeTimeout);
          const res = await fetch(base + "/api/health", { signal: ctrl ? ctrl.signal : undefined });
          clearTimeout(timer);
          if (!res.ok) continue;
          const body = await res.json();
          state.apiBase = base;
          state.online = body.status === "ok";
          state.llm = !!body.llm;
          state.llmModel = body.model || null;
          return body;
        } catch (e) {
          /* try the next base */
        }
      }
      state.online = false;
      state.llm = false;
      state.apiBase = null;
      return null;
    },

    async status() {
      if (!state.online) return null;
      try { return await api.request("/api/status", {}, 4000); } catch (e) { return null; }
    },

    async history(limit) {
      if (!state.online) return [];
      try {
        const body = await api.request("/api/history?limit=" + (limit || 90), {}, 5000);
        return (body.checkins || []);
      } catch (e) { return []; }
    },

    async ask(question, vitals) {
      if (!state.online) throw new Error("offline");
      return api.request("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, vitals: vitals || null, astronaut_id: CFG.astronautId }),
      });
    },

    async checkin(vitals) {
      if (!state.online) throw new Error("offline");
      return api.request("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ astronaut_id: CFG.astronautId }, vitals)),
      }, 8000);
    },
  };

  /* --------------------------------------------------------------- offline */
  // Check-ins are written locally first (the record must survive with no link),
  // then pushed to the backend when it is reachable.
  let queue = [];

  function loadLocal() {
    LOCAL = store.get("checkins", []);
    queue = store.get("queue", []);
  }

  function saveLocal(entry) {
    LOCAL.push(entry);
    LOCAL = LOCAL.slice(-400);
    store.set("checkins", LOCAL);
    queue.push(entry);
    store.set("queue", queue);
    emit("data");
  }

  async function sync() {
    if (!queue.length) {
      state.lastSync = store.get("lastSync", null);
      return { pushed: 0 };
    }
    if (!state.online) return { pushed: 0, deferred: queue.length };
    const rest = [];
    let pushed = 0;
    for (const entry of queue) {
      try {
        await api.checkin(entry);
        pushed++;
      } catch (e) {
        rest.push(entry);
      }
    }
    queue = rest;
    store.set("queue", queue);
    if (pushed) {
      state.lastSync = new Date().toISOString();
      store.set("lastSync", state.lastSync);
      emit("sync");
    }
    return { pushed, deferred: queue.length };
  }

  const pending = () => queue.length;

  /* --------------------------------------------------------------- toasts */
  function toast(msg, kind) {
    let host = $(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " is-" + kind : "");
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(6px)"; }, 3600);
    setTimeout(() => el.remove(), 4000);
  }

  /* ----------------------------------------------------------------- shell */
  const NAV = [
    { href: "index.html", id: "mission", label: "Mission Control", icon: "crosshair" },
    { href: "assessment.html", id: "assessment", label: "Health Assessment", icon: "clipboard" },
    { href: "analytics.html", id: "analytics", label: "Health Analytics", icon: "chart" },
    { href: "assistant.html", id: "assistant", label: "AI Assistant", icon: "brain", tag: "LOCAL" },
    { href: "scanning.html", id: "scanning", label: "Physical Scan", icon: "scan" },
  ];

  function mountShell() {
    const shell = $(".shell");
    if (!shell) return;
    const page = shell.dataset.page || "mission";
    const crumb = shell.dataset.crumb || "";
    const title = shell.dataset.title || "";

    const sidebar = $(".sidebar");
    if (sidebar) {
      sidebar.innerHTML =
        '<a class="brand" href="index.html">' +
          '<span class="brand-mark">' + icon("helm") + "</span>" +
          '<span class="brand-text"><b>HELM</b><span>Astronaut health</span></span>' +
        "</a>" +
        '<nav class="nav" aria-label="Primary">' +
          '<div class="nav-group">Crew systems</div>' +
          NAV.map((n) =>
            '<a class="nav-link' + (n.id === page ? " active" : "") + '" href="' + n.href + '"' +
            (n.id === page ? ' aria-current="page"' : "") + ">" +
              icon(n.icon) + '<span class="nav-label">' + n.label + "</span>" +
              (n.tag ? '<span class="nav-tag">' + n.tag + "</span>" : "") +
            "</a>"
          ).join("") +
        "</nav>" +
        '<div class="side-foot">' +
          '<div class="side-card"><b>Link status</b>' +
            '<div class="dot-row"><span class="dot pulse" id="linkDot"></span><span id="linkText">Checking…</span></div>' +
            '<div class="dot-row"><span class="dot" id="llmDot"></span><span id="llmText">Advisor idle</span></div>' +
          "</div>" +
          '<div class="side-card"><b>Offline record</b>' +
            '<span id="offlineCount">0 check-ins stored</span>' +
            '<div class="dot-row"><span class="dot" id="queueDot"></span><span id="queueText">Sync idle</span></div>' +
          "</div>" +
        "</div>";
    }

    const topbar = $(".topbar");
    if (topbar) {
      topbar.innerHTML =
        '<div class="topbar-left">' +
          '<span class="crumb">HELM <span class="sep">/</span> <b>' + esc(crumb || title) + "</b></span>" +
        "</div>" +
        '<div class="topbar-right">' +
          '<span class="pill" id="pillDay">' + icon("clock") + 'Mission day <b>--</b></span>' +
          '<span class="pill" id="pillMode">' + icon("globe") + '<b>--</b></span>' +
          '<span class="pill" id="pillLink">' + icon("offline") + "<span>Local record</span></span>" +
          '<a class="btn btn-sm btn-primary" href="assessment.html">' + icon("plus") + "New check-in</a>" +
        "</div>";
    }
    document.title = (title ? title + " · " : "") + "HELM Astronaut Health";
  }

  function paintShell() {
    const linkDot = $("#linkDot"), linkText = $("#linkText");
    const llmDot = $("#llmDot"), llmText = $("#llmText");
    const offCount = $("#offlineCount"), qDot = $("#queueDot"), qText = $("#queueText");
    const pillDay = $("#pillDay"), pillMode = $("#pillMode"), pillLink = $("#pillLink");

    const st = currentStatus();
    const day = latest().day;
    const offline = !state.online;

    if (linkDot) {
      linkDot.style.color = offline ? "var(--warn)" : "var(--ok)";
      linkDot.className = "dot" + (offline ? "" : " pulse");
    }
    if (linkText) linkText.textContent = offline ? "No backend · local mode" : "Backend connected";
    if (llmDot) {
      llmDot.style.color = state.llm ? "var(--ok)" : "var(--ink-3)";
    }
    if (llmText) llmText.textContent = state.llm ? "LLM ready · " + (state.llmModel || "local") : "Rule-based fallback";
    if (offCount) offCount.textContent = LOCAL.length + " check-in" + (LOCAL.length === 1 ? "" : "s") + " stored";
    if (qDot) qDot.style.color = queue.length ? "var(--warn)" : "var(--ok)";
    if (qText) qText.textContent = queue.length ? queue.length + " waiting to sync" : (state.lastSync ? "Synced " + fmtDate(state.lastSync) : "Nothing queued");

    if (pillDay) pillDay.innerHTML = icon("clock") + "Mission day <b>" + (day == null ? "--" : day) + "</b>";
    if (pillMode) {
      const m = MODES[state.mode] || MODES.mars;
      pillMode.innerHTML = icon("globe") + "<b>" + m.label + "</b> · " + fmtDelay(delaySeconds(m.km));
    }
    if (pillLink) {
      pillLink.className = "pill " + (offline ? "is-warn" : "is-live");
      pillLink.innerHTML = icon(offline ? "offline" : "signal") +
        "<span>" + (offline ? "Offline record" : "Live backend") + "</span>";
    }
    const meta = $("#wellnessMeta");
    if (meta) meta.textContent = st.wellness + "/100";
  }

  /* ---------------------------------------------------------------- logger */
  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  /* ------------------------------------------------------------------ boot */
  async function boot(render) {
    loadLocal();
    state.mode = store.get("mode", DEMO_MODE_DEFAULT());
    mountShell();

    try {
      const [tRes, dRes] = await Promise.all([
        fetch("../data/medical_thresholds.json", { cache: "no-store" }),
        fetch("../data/demo_readings.json", { cache: "no-store" }),
      ]);
      if (!tRes.ok) throw new Error("thresholds " + tRes.status);
      if (!dRes.ok) throw new Error("readings " + dRes.status);
      const [t, d] = await Promise.all([tRes.json(), dRes.json()]);
      THRESHOLDS = t.indicators || {};
      DEMO = {
        astronaut: (d.astronaut && d.astronaut.name) || "Crew member",
        readings: (d.readings || []).slice(),
      };
      BASE = baselines();
      state.loaded = true;
    } catch (err) {
      const host = $("[data-boot-error]") || $(".page");
      if (host) {
        host.innerHTML =
          '<div class="panel"><div class="empty"><b>Could not load local data</b>' +
          esc(err.message) + '<br><br>Serve the repo root with <span class="mono">python -m http.server 8000</span> ' +
          'and open <span class="mono">http://localhost:8000/frontend/</span>.</div></div>';
      }
      return;
    }

    // Backend is a bonus, never a requirement.
    await api.probe();
    if (state.online) {
      // Only complete check-ins take part in the overview: a row with a heart rate
      // but no blood pressure or SpO2 cannot stand in for a full assessment.
      const complete = (c) => c.heart_rate != null && (c.spo2 != null || c.blood_pressure_dia != null);
      API_LOG = (await api.history(180)).filter(complete);
      const live = await api.status();
      if (live && live.wellness != null) state.liveStatus = live;
      await sync();
    }
    paintShell();
    on(() => paintShell());
    document.addEventListener("click", (e) => {
      const modeBtn = e.target.closest("[data-mode]");
      if (modeBtn) {
        state.mode = modeBtn.dataset.mode;
        store.set("mode", state.mode);
        $$("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === state.mode));
        paintShell();
        emit("mode");
      }
    });
    if (render) await render({ thresholds: THRESHOLDS, status: currentStatus(), timeline: timeline() });
  }

  function DEMO_MODE_DEFAULT() {
    // demo readings are a Mars-transit profile (225 million km)
    return "mars";
  }

  /* --------------------------------------------------------------- exports */
  window.HELM = {
    CFG, ICON, icon, SYS, CATEGORIES, MODES, store, state, api,
    $, $$, esc, num, clamp, round, statusOf, clsOf, labelOf, fmtDelay, fmtDate, daysAgo,
    compute, currentStatus, latest, timeline, withMode, dayLabel, baselines,
    systemOf: (k) => systemOf(k),
    delaySeconds, CUMULATIVE,
    saveLocal, sync, pending, toast, boot, ready, on,
    mountShell, paintShell,
    get THRESHOLDS() { return THRESHOLDS; },
    get DEMO() { return DEMO; },
    get LOCAL() { return LOCAL; },
    get QUEUE() { return queue; },
    get BASE() { return BASE; },
  };
})();
