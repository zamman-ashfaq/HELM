/* ==========================================================================
   HELM · vision
   On-device body tracking for the physical assessment page.

   Two honest modes:
     1. POSE   — MediaPipe PoseLandmarker (vendored in frontend/vendor/mediapipe/).
                 Real 33-point landmarks, 8 joint angles, skeleton overlay,
                 per-joint range of motion and left/right asymmetry.
     2. MOTION — the runtime is not installed. Frame differencing on a small
                 copy of the video only. It does NOT detect landmarks, joints or
                 posture, and the page says so.

   Everything loads from this origin. No CDN, no upload, no round trip: the
   model, the WASM and the task file all live next to the page.
   ========================================================================== */
(function () {
  "use strict";

  /* ---- what is loaded, and from where ------------------------------------ */
  // Resolved against this script (frontend/js/vision.js), so the paths are the
  // same on every page that includes it: frontend/vendor/mediapipe/.
  const SCRIPT = (document.currentScript && document.currentScript.src) || document.baseURI;
  const MP = new URL("../vendor/mediapipe/", SCRIPT).href;
  const MODEL = {
    dir: MP,
    display: "frontend/vendor/mediapipe/",
    modules: ["vision_bundle.mjs", "vision_bundle.js"],
    wasm: MP + "wasm/",
    task: MP + "pose_landmarker_lite.task",
    taskFull: MP + "pose_landmarker_full.task",
    version: "1.2.3",
  };

  const VIS = 0.5;                 // a joint below this is reported, never guessed
  const MAX_FPS = 30;              // hard cap on processed frames
  const MIN_INTERVAL = 1000 / MAX_FPS;
  const EMA = 0.45;                // landmark smoothing
  const MIN_VALID_SEC = 8;         // a report needs this many valid seconds
  const MOTION_EVERY = 3;          // frame differencing runs at ~10 Hz

  /* ---- pose topology ------------------------------------------------------
     side: 0 = midline, 1 = body left (cyan), 2 = body right (violet)
     MediaPipe marks the subject's own left as index 11/13/15/23/25/27. */
  const LINKS = [
    [11, 12, 0], [11, 23, 1], [12, 24, 2], [23, 24, 0],
    [11, 13, 1], [13, 15, 1], [12, 14, 2], [14, 16, 2],
    [23, 25, 1], [25, 27, 1], [24, 26, 2], [26, 28, 2],
    [27, 29, 1], [29, 31, 1], [28, 30, 2], [30, 32, 2],
    [0, 11, 1], [0, 12, 2], [7, 11, 1], [8, 12, 2], [7, 8, 0],
  ];

  // The eight joints the report and the body diagram show.
  const JOINTS = [
    { key: "left_shoulder", label: "Left shoulder", a: 23, b: 11, c: 13 },
    { key: "right_shoulder", label: "Right shoulder", a: 24, b: 12, c: 14 },
    { key: "left_elbow", label: "Left elbow", a: 11, b: 13, c: 15 },
    { key: "right_elbow", label: "Right elbow", a: 12, b: 14, c: 16 },
    { key: "left_hip", label: "Left hip", a: 11, b: 23, c: 25 },
    { key: "right_hip", label: "Right hip", a: 12, b: 24, c: 26 },
    { key: "left_knee", label: "Left knee", a: 23, b: 25, c: 27 },
    { key: "right_knee", label: "Right knee", a: 24, b: 26, c: 28 },
  ];

  const PAIRS = [["knee", "left_knee", "right_knee"], ["hip", "left_hip", "right_hip"],
                 ["elbow", "left_elbow", "right_elbow"], ["shoulder", "left_shoulder", "right_shoulder"]];

  const COL = { mid: "#9fb4cc", left: "#22d3ee", right: "#c084fc", dim: "rgba(148,163,184,.5)" };

  const state = {
    tried: false,
    ready: false,
    reason: "not-probed",     // not-probed | ready | missing | error
    detail: "",
    delegate: null,           // GPU | CPU
    model: null,              // lite | full
    landmarker: null,
    module: null,
  };

  const msgOf = (e) => String((e && e.message) || e);

  function withTimeout(p, ms, what) {
    return Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error((what || "load") + " timed out")), ms)),
    ]);
  }

  /* ------------------------------------------------------------- loading ---
     python -m http.server labels .mjs as text/plain, which browsers refuse to
     import, so pick the first copy the server actually marks as JavaScript
     instead of firing a failing import at the console. */
  async function pickModule() {
    for (const name of MODEL.modules) {
      const url = MODEL.dir + name;
      try {
        const res = await fetch(url, { cache: "force-cache" });
        if (!res.ok) continue;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (!ct || /javascript|ecmascript|octet-stream/.test(ct)) return url;
      } catch (e) {
        /* try the next candidate */
      }
    }
    return MODEL.dir + MODEL.modules[1];
  }

  async function probe() {
    if (state.tried) return state;
    state.tried = true;

    if (typeof WebAssembly === "undefined") {
      state.reason = "error";
      state.detail = "This browser cannot run WebAssembly.";
      return state;
    }

    try {
      const url = await pickModule();
      const mod = await withTimeout(import(url), 15000, "bundle");
      const FilesetResolver = mod.FilesetResolver;
      const PoseLandmarker = mod.PoseLandmarker;
      if (!FilesetResolver || !PoseLandmarker) throw new Error("bundle has no exports");
      state.module = url.split("/").pop();

      const fileset = await withTimeout(FilesetResolver.forVisionTasks(MODEL.wasm), 15000, "wasm");

      // The full model is used whenever someone drops it next to the lite one.
      let task = MODEL.task, which = "lite";
      try {
        const head = await fetch(MODEL.taskFull, { method: "HEAD" });
        if (head.ok) { task = MODEL.taskFull; which = "full"; }
      } catch (e) { /* lite is the default */ }

      const failures = [];
      let lm = null;
      for (const delegate of ["GPU", "CPU"]) {
        try {
          lm = await withTimeout(PoseLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: task, delegate: delegate },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }), 20000, delegate);
          state.delegate = delegate;
          break;
        } catch (e) {
          failures.push(delegate + ": " + msgOf(e));
        }
      }
      if (!lm) throw new Error(failures.join(" · ") || "landmarker could not start");

      state.landmarker = lm;
      state.model = which;
      state.ready = true;
      state.reason = "ready";
      state.detail = "PoseLandmarker " + MODEL.version + " · " + which + " · " + state.delegate;
    } catch (err) {
      state.ready = false;
      state.landmarker = null;
      const msg = msgOf(err);
      if (/404|Failed to fetch|dynamically imported|Cannot find module|timed out|MIME|text\/plain/i.test(msg)) {
        state.reason = "missing";
        state.detail = "Runtime not installed";
      } else {
        state.reason = "error";
        state.detail = msg;
      }
    }
    return state;
  }

  function status() {
    return {
      ready: state.ready,
      reason: state.reason,
      detail: state.detail,
      delegate: state.delegate,
      model: state.model,
      module: state.module,
      mode: state.ready ? "pose" : "motion",
      paths: MODEL,
    };
  }

  /* ------------------------------------------------------------- geometry -- */
  function angleAt(a, b, c) {
    const v1x = a[0] - b[0], v1y = a[1] - b[1];
    const v2x = c[0] - b[0], v2y = c[1] - b[1];
    const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1;
    return (Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / n))) * 180) / Math.PI;
  }

  /* -------------------------------------------------------------- tracker -- */
  function create(opts) {
    const video = opts.video;
    const canvas = opts.canvas;
    const stage = opts.stage || canvas.parentNode;
    const mirrored = !!opts.mirrored;
    const onTick = opts.onTick || function () {};

    const ctx = canvas.getContext("2d");

    /* motion buffer — allocated once, reused forever */
    const MW = 96, MH = 54;
    const small = document.createElement("canvas");
    small.width = MW; small.height = MH;
    const sctx = small.getContext("2d", { willReadFrequently: true });
    let prevPx = null;

    /* landmark smoothing buffers — allocated once */
    const sx = new Float32Array(33), sy = new Float32Array(33), sv = new Float32Array(33);
    let haveSmooth = false;

    /* scan aggregation */
    const samples = {};        // key -> array of angles (scan window only)
    let scan = null;

    let raf = 0, running = false, starting = false;
    let lastProc = 0, frames = 0, poseFrames = 0, validFrames = 0;
    let t0 = 0, lastNow = 0, fps = 0;
    let poseSec = 0, dtAcc = 0, dtN = 0;
    let lost = 0;
    let lastFraming = null;
    let lastAngles = null;
    let conf = 0;
    let trace = [];

    function newScan() {
      scan = { t0: performance.now(), frames: 0, poseFrames: 0, validFrames: 0, poseSec: 0, trace: [] };
      Object.keys(samples).forEach((k) => { samples[k].length = 0; });
      trace = scan.trace;
    }

    function clearCanvas() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /* The video is drawn with object-fit: contain, so the picture occupies a
       letterboxed box inside the stage. Landmarks are normalized to the picture,
       not to the element — map them through this rect. */
    function videoRect() {
      const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
      const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
      const s = Math.min(w / vw, h / vh);
      const dw = vw * s, dh = vh * s;
      return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
    }

    function fitCanvas() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round((stage.clientWidth || 640) * dpr));
      const h = Math.max(1, Math.round((stage.clientHeight || 360) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return dpr;
    }

    /* ---- motion energy (both modes; cheap and it feeds the trace) --------- */
    function sampleMotion() {
      sctx.drawImage(video, 0, 0, MW, MH);
      const px = sctx.getImageData(0, 0, MW, MH).data;
      if (!prevPx) {
        prevPx = new Uint8ClampedArray(px.length);
        prevPx.set(px);
        return 0;
      }
      let changed = 0;
      for (let i = 0, p = 0; i < px.length; i += 4, p++) {
        const d = Math.abs(px[i] - prevPx[i]) + Math.abs(px[i + 1] - prevPx[i + 1]) + Math.abs(px[i + 2] - prevPx[i + 2]);
        if (d > 42) changed++;
      }
      prevPx.set(px);
      return changed / (MW * MH);
    }

    /* ---- landmarks -------------------------------------------------------- */
    function smooth(lm) {
      const a = haveSmooth ? EMA : 1;
      for (let i = 0; i < 33; i++) {
        const p = lm[i];
        if (!p) continue;
        const v = p.visibility == null ? 1 : p.visibility;
        sv[i] = v;
        if (v < 0.15) continue;           // do not drag a hidden joint through noise
        sx[i] += (p.x - sx[i]) * a;
        sy[i] += (p.y - sy[i]) * a;
      }
      haveSmooth = true;
    }

    function pt(i) {
      return [sx[i], sy[i]];
    }

    function jointAngles() {
      const out = {};
      for (let j = 0; j < JOINTS.length; j++) {
        const J = JOINTS[j];
        if (sv[J.a] < VIS || sv[J.b] < VIS || sv[J.c] < VIS) { out[J.key] = null; continue; }
        out[J.key] = angleAt(pt(J.a), pt(J.b), pt(J.c));
      }
      return out;
    }

    function framing(lm) {
      const head = Math.max(sv[0], sv[7], sv[8]);
      const ankles = Math.max(sv[27], sv[28]);
      const hips = Math.max(sv[23], sv[24]);
      const knees = Math.max(sv[25], sv[26]);
      let headY = 1, feetY = 0;
      if (sv[0] >= VIS) headY = Math.min(headY, sy[0]);
      if (sv[7] >= VIS) headY = Math.min(headY, sy[7]);
      if (sv[8] >= VIS) headY = Math.min(headY, sy[8]);
      if (sv[27] >= VIS) feetY = Math.max(feetY, sy[27]);
      if (sv[28] >= VIS) feetY = Math.max(feetY, sy[28]);
      const fill = head >= VIS && ankles >= VIS ? feetY - headY : 0;
      const inside = [0, 27, 28, 23, 24].every((i) => sv[i] < VIS || (sx[i] > 0 && sx[i] < 1 && sy[i] > 0 && sy[i] < 1));
      const ok = head >= VIS && ankles >= VIS && hips >= VIS && knees >= VIS && fill >= 0.5 && fill <= 0.9 && inside;
      let note = "Full body in frame";
      if (!ok) {
        if (head < VIS) note = "Head out of frame";
        else if (ankles < VIS) note = "Ankles out of frame";
        else if (fill > 0.9) note = "Step back";
        else if (fill < 0.5) note = "Move closer";
        else note = "Centre the body";
      }
      return { ok, fill: Math.round(fill * 100), note, head: head >= VIS, ankles: ankles >= VIS };
    }

    /* ---- drawing ---------------------------------------------------------- */
    function drawSkeleton(rect, dpr) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);

      const px = (i) => (mirrored ? rect.x + (1 - sx[i]) * rect.w : rect.x + sx[i] * rect.w);
      const py = (i) => rect.y + sy[i] * rect.h;

      ctx.lineCap = "round";
      ctx.lineWidth = 3;
      for (let k = 0; k < LINKS.length; k++) {
        const L = LINKS[k], a = L[0], b = L[1];
        if (sv[a] < VIS || sv[b] < VIS) continue;
        ctx.strokeStyle = L[2] === 1 ? COL.left : L[2] === 2 ? COL.right : COL.mid;
        ctx.beginPath();
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(b), py(b));
        ctx.stroke();
      }

      ctx.shadowColor = "rgba(125,233,247,.55)";
      ctx.shadowBlur = 10;
      for (let i = 0; i < 33; i++) {
        if (sv[i] < VIS) continue;
        const isJoint = i === 11 || i === 12 || i === 13 || i === 14 || i === 23 || i === 24 || i === 25 || i === 26;
        ctx.fillStyle = i === 11 || i === 13 || i === 23 || i === 25 ? COL.left
          : i === 12 || i === 14 || i === 24 || i === 26 ? COL.right : "#dbeafe";
        ctx.beginPath();
        ctx.arc(px(i), py(i), isJoint ? 4.2 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    function drawMotion(rect, dpr) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(small, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    /* ---- frame loop ------------------------------------------------------- */
    function tick(now) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (video.readyState < 2 || !video.videoWidth) return;

      const dt = now - lastProc;
      if (dt < MIN_INTERVAL) return;           // never above 30 fps
      lastProc = now;

      const dtS = Math.min(1, (lastNow ? now - lastNow : MIN_INTERVAL / 1000) / 1000);
      lastNow = now;
      frames++;
      if (scan) scan.frames++;

      const dpr = fitCanvas();
      const rect = videoRect();
      let lm = null;
      let used = false;

      if (state.ready && state.landmarker) {
        try {
          const out = state.landmarker.detectForVideo(video, now);
          if (out && out.landmarks && out.landmarks[0]) lm = out.landmarks[0];
        } catch (e) {
          /* a dropped frame must never kill the session */
        }
      }

      if (lm) {
        lost = 0;
        poseFrames++;
        if (scan) scan.poseFrames++;
        smooth(lm);

        const angles = jointAngles();
        lastAngles = angles;
        const visCount = JOINTS.reduce((n, J) => n + (angles[J.key] != null ? 1 : 0), 0);
        // A tracked pose is valid time. The joint count only decides whether the
        // report can show angles: a profile view exposes one side and still counts.
        if (scan) scan.poseSec += dtS;
        if (visCount >= 3) {
          validFrames++;
          if (scan) scan.validFrames++;
        }

        for (let j = 0; j < JOINTS.length; j++) {
          const J = JOINTS[j], v = angles[J.key];
          if (v == null) continue;
          const arr = samples[J.key] || (samples[J.key] = []);
          if (scan) arr.push(v);
        }

        lastFraming = framing(lm);
        conf = Math.round(100 * Math.min(1, visCount / 8));
        used = true;
        drawSkeleton(rect, dpr);
      } else {
        lost++;
        if (lost > 5) { haveSmooth = false; }
        if (!state.ready) drawMotion(rect, dpr);
      }

      /* motion energy: ~10 Hz, both modes, so the trace exists even in pose mode */
      if (frames % MOTION_EVERY === 0) {
        const m = sampleMotion();
        if (scan) scan.trace.push(Math.round(m * 1000));
      }

      /* effective rate, refreshed once a second of wall clock */
      const el = (now - t0) / 1000;
      if (el > 0.2) fps = Math.round(frames / el);

      if (scan) {
        const s = (now - scan.t0) / 1000;
        if (s > 0.15) { const f = scan.frames / s; if (f > 0 && f < 200) fps = Math.round(f); }
      }

      onTick({
        t: ((now - t0) / 1000) || 0,
        frames: frames,
        fps: fps,
        confidence: conf,
        framing: lastFraming,
        angles: lastAngles,
        tracking: used,
        scanning: !!scan,
      });
    }

    function start() {
      if (running) return status();
      starting = true;
      frames = 0; poseFrames = 0; validFrames = 0; poseSec = 0;
      haveSmooth = false; lost = 0; lastProc = 0; lastNow = 0;
      prevPx = null;
      conf = 0;
      t0 = performance.now();
      fitCanvas();
      newScan();
      running = true;
      starting = false;
      raf = requestAnimationFrame(tick);
      return status();
    }

    function beginScan() {
      newScan();
      lastAngles = null;
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      prevPx = null;
      haveSmooth = false;
      newScan();
      clearCanvas();
    }

    function resetAggregate() {
      newScan();
    }

    function stdev(a) {
      if (a.length < 2) return 0;
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
    }

    /* Final report. Only what was measured: a joint with no valid samples is
       absent, not zero. */
    function report() {
      const s = scan || { frames: 0, poseFrames: 0, validFrames: 0, poseSec: 0, trace: [], t0: performance.now() };
      const duration = Math.max(0, (lastProc - s.t0) / 1000);
      const motionValues = s.trace;

      const joints = {};
      let romSum = 0, romN = 0;
      for (let j = 0; j < JOINTS.length; j++) {
        const J = JOINTS[j], v = samples[J.key];
        if (!v || v.length < 5) continue;
        let lo = Infinity, hi = -Infinity, sum = 0;
        for (let i = 0; i < v.length; i++) {
          const x = v[i];
          if (x < lo) lo = x;
          if (x > hi) hi = x;
          sum += x;
        }
        const rom = hi - lo;
        joints[J.key] = {
          mean: Math.round(sum / v.length),
          min: Math.round(lo),
          max: Math.round(hi),
          rom: Math.round(rom),
          samples: v.length,
          label: J.label,
        };
        romSum += rom;
        romN++;
      }

      const asym = {};
      let asymSum = 0, asymN = 0;
      for (let p = 0; p < PAIRS.length; p++) {
        const name = PAIRS[p][0], l = joints[PAIRS[p][1]], r = joints[PAIRS[p][2]];
        if (!l || !r) continue;
        const base = Math.max(1, (l.rom + r.rom) / 2);
        const v = Math.abs(l.rom - r.rom) / base * 100;
        asym[name] = Math.round(v);
        asymSum += v;
        asymN++;
      }
      const asymmetry = asymN ? Math.round(asymSum / asymN) : null;

      const mean = motionValues.length ? motionValues.reduce((a, b) => a + b, 0) / motionValues.length : 0;
      const peak = motionValues.length ? Math.max.apply(null, motionValues) : 0;
      const gate = Math.max(2.5, mean * 0.6);
      const active = motionValues.filter((v) => v >= gate).length;
      let jitter = 0;
      if (motionValues.length > 2) {
        let d = 0;
        for (let i = 1; i < motionValues.length; i++) d += Math.abs(motionValues[i] - motionValues[i - 1]);
        jitter = mean > 0 ? d / (motionValues.length - 1) / mean : 0;
      }

      const validSec = state.ready ? s.poseSec : duration;
      const enough = validSec >= MIN_VALID_SEC && (state.ready ? s.validFrames : s.frames) >= 10;

      /* Downsampled copy (max 60 buckets) for the chart in the report. */
      const series = [];
      if (motionValues.length) {
        const step = Math.max(1, Math.floor(motionValues.length / 60));
        for (let i = 0; i < motionValues.length; i += step) {
          let sum2 = 0, n = 0;
          for (let k = i; k < Math.min(motionValues.length, i + step); k++) { sum2 += motionValues[k]; n++; }
          series.push(Math.round(sum2 / n));
        }
      }

      return {
        mode: state.ready ? "pose" : "motion",
        ready: state.ready,
        reason: state.reason,
        detail: state.detail,
        delegate: state.delegate,
        enough,
        minValid: MIN_VALID_SEC,
        duration: Math.round(duration * 10) / 10,
        validSeconds: Math.round(validSec * 10) / 10,
        frames: s.frames,
        fps: fps,
        resolution: (video.videoWidth || 0) + "×" + (video.videoHeight || 0),
        motion: {
          mean: Math.round(mean * 10) / 10,
          peak: Math.round(peak * 10) / 10,
          activeRatio: motionValues.length ? Math.round((active / motionValues.length) * 100) : 0,
          jitter: Math.round(jitter * 100) / 100,
          swayX: Math.round(stdev(motionValues) * 10) / 10,
          series: series,
        },
        trace: motionValues,
        pose: state.ready
          ? { frames: s.poseFrames, validFrames: s.validFrames, joints, asymmetry: asym, asymmetryOverall: asymmetry }
          : null,
        framing: lastFraming,
        // Same formula as before; it is now fed by measured motion in both modes.
        mobility: enough
          ? Math.round(100 * Math.min(1, 0.6 * (motionValues.length ? active / motionValues.length : 0) + 0.4 * Math.max(0, 1 - Math.min(1, jitter))))
          : null,
      };
    }

    return {
      start, stop, beginScan, report,
      isRunning: () => running,
      framing: () => lastFraming,
      angles: () => lastAngles,
    };
  }

  /* ------------------------------------------------------------ fusion math
     Unchanged weights and formula: self-report 40 %, sleep deficit 25 %,
     movement irregularity 20 %, resting heart rate 15 %. A part with no input
     is left out instead of being invented. */
  function fatigueScreen(input) {
    const parts = [];
    let wsum = 0, sum = 0;

    const add = (label, value, weight, note) => {
      if (value == null || Number.isNaN(value)) return;
      parts.push({ label: label, value: Math.round(value), weight: weight, note: note });
      sum += value * weight;
      wsum += weight;
    };

    if (input.selfFatigue != null) add("Self-reported fatigue", input.selfFatigue, 0.4, "entered on this page");
    if (input.sleepHours != null) {
      const deficit = Math.max(0, Math.min(100, ((7 - input.sleepHours) / 3) * 100));
      add("Sleep deficit", deficit, 0.25, input.sleepHours + " h vs 7 h need");
    }
    if (input.jitter != null) add("Movement irregularity", Math.min(100, input.jitter * 100), 0.2, "trace jitter");
    if (input.restingHr != null) {
      add("Resting heart rate", Math.max(0, Math.min(100, ((input.restingHr - 60) / 40) * 100)), 0.15, input.restingHr + " bpm");
    }

    if (!wsum) return null;
    return { score: Math.round(sum / wsum), parts: parts, coverage: Math.round(wsum * 100) };
  }

  window.HELMVision = {
    MODEL, MIN_VALID_SEC, VIS, JOINTS,
    probe, status, create, fatigueScreen, state,
  };
})();
