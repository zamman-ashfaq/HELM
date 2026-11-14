/* ==========================================================================
   HELM · vision
   Local body-movement analysis for the physical assessment page.

   Two honest modes:
     1. POSE   — MediaPipe PoseLandmarker, loaded from ./vendor/mediapipe/.
                 Gives real 33-point landmarks, joint angles and a skeleton.
     2. MOTION — no model installed. Frame differencing on a downscaled copy of
                 the video. Measures motion energy, active time, centroid sway
                 and trace jitter. It does NOT detect landmarks, joints or
                 posture, and the UI must say so.

   Nothing here downloads from a CDN and nothing is uploaded. A missing model
   is reported as missing instead of being simulated.
   ========================================================================== */
(function () {
  "use strict";

  const MODEL = {
    // Resolved against this script (frontend/js/), so the bundle lives in
    // frontend/vendor/mediapipe/ and never touches a CDN.
    dir: "../vendor/mediapipe/",
    module: "vision_bundle.mjs",              // ESM bundle, vendored locally
    wasm: "../vendor/mediapipe/wasm/",
    task: "../vendor/mediapipe/pose_landmarker_lite.task",
    delegate: "GPU",
  };

  // Subset of the MediaPipe pose topology that reads well as a body outline.
  const LINKS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [27, 29], [29, 31], [28, 30], [30, 32],
    [0, 11], [0, 12], [8, 12], [7, 11], [7, 8],
  ];

  const state = {
    tried: false,
    ready: false,
    reason: "not-probed",     // not-probed | ready | missing | error
    detail: "",
    landmarker: null,
  };

  /* --------------------------------------------------------------- loading */
  async function probe() {
    if (state.tried) return state;
    state.tried = true;

    // Browser support guard first, so the message is accurate.
    if (typeof window.VideoDecoder === "undefined" && typeof OffscreenCanvas === "undefined") {
      state.reason = "error";
      state.detail = "This browser lacks the codecs the pose runtime needs.";
      return state;
    }

    try {
      const mod = await import("./" + MODEL.dir + MODEL.module);
      const FilesetResolver = mod.FilesetResolver;
      const PoseLandmarker = mod.PoseLandmarker;
      if (!FilesetResolver || !PoseLandmarker) throw new Error("bundle loaded but exports are missing");

      const fileset = await FilesetResolver.forVisionTasks(MODEL.wasm);
      state.landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL.task, delegate: MODEL.delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      state.ready = true;
      state.reason = "ready";
      state.detail = "PoseLandmarker on " + MODEL.delegate;
    } catch (err) {
      state.ready = false;
      state.landmarker = null;
      const msg = String((err && err.message) || err);
      // A 404 on the local bundle is the expected case until the model is added.
      if (/404|Failed to fetch|dynamically imported module|Cannot find module/i.test(msg)) {
        state.reason = "missing";
        state.detail = "Pose bundle not installed";
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
      model: MODEL,
      mode: state.ready ? "pose" : "motion",
    };
  }

  /* ---------------------------------------------------------------- tracker */
  function create(opts) {
    const video = opts.video;
    const canvas = opts.canvas;
    const onTick = opts.onTick || function () {};
    const ctx = canvas.getContext("2d");

    const W = 96, H = 54;
    const small = document.createElement("canvas");
    small.width = W; small.height = H;
    const sctx = small.getContext("2d", { willReadFrequently: true });

    let prev = null;
    let raf = 0;
    let running = false;
    let lastVideoTime = -1;
    const frames = [];
    let t0 = 0;
    let poseFrames = 0;
    let jointSamples = {};

    function resize() {
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 360;
      canvas.width = w;
      canvas.height = h;
    }

    function frameMotion() {
      sctx.drawImage(video, 0, 0, W, H);
      const now = sctx.getImageData(0, 0, W, H).data;
      if (!prev) {
        prev = now;
        return { motion: 0, cx: 0.5, cy: 0.5, changed: 0 };
      }
      let changed = 0, sx = 0, sy = 0;
      for (let i = 0, p = 0; i < now.length; i += 4, p++) {
        const d = Math.abs(now[i] - prev[i]) + Math.abs(now[i + 1] - prev[i + 1]) + Math.abs(now[i + 2] - prev[i + 2]);
        if (d > 42) {
          changed++;
          sx += p % W;
          sy += (p / W) | 0;
        }
      }
      prev = now;
      const total = W * H;
      return {
        motion: changed / total,
        cx: changed ? (sx / changed) / W : 0.5,
        cy: changed ? (sy / changed) / H : 0.5,
        changed,
      };
    }

    function paintMotion(now, m) {
      if (!m.motion) return;
      ctx.globalAlpha = 0.5;
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // centroid trail = where the movement is happening over time
      const px = now.cx * canvas.width;
      const py = now.cy * canvas.height;
      ctx.strokeStyle = "rgba(34,211,238,.8)";
      ctx.fillStyle = "rgba(34,211,238,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px - 12, py); ctx.lineTo(px + 12, py);
      ctx.moveTo(px, py - 12); ctx.lineTo(px, py + 12);
      ctx.stroke();
    }

    function paintPose(lm) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const P = (i) => lm[i] ? [lm[i].x * canvas.width, lm[i].y * canvas.height, lm[i].visibility || 1] : null;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(34,211,238,.85)";
      ctx.shadowColor = "rgba(34,211,238,.55)";
      ctx.shadowBlur = 8;
      LINKS.forEach(([a, b]) => {
        const A = P(a), B = P(b);
        if (!A || !B || A[2] < 0.4 || B[2] < 0.4) return;
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.lineTo(B[0], B[1]);
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#7de9f7";
      lm.forEach((p) => {
        if ((p.visibility || 1) < 0.4) return;
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function angle(a, b, c) {
      if (!a || !b || !c) return null;
      const A = [a.x, a.y], B = [b.x, b.y], C = [c.x, c.y];
      const v1 = [A[0] - B[0], A[1] - B[1]];
      const v2 = [C[0] - B[0], C[1] - B[1]];
      const dot = v1[0] * v2[0] + v1[1] * v2[1];
      const n = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1;
      return (Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180) / Math.PI;
    }

    function sampleJoints(lm) {
      const J = {
        left_knee: angle(lm[23], lm[25], lm[27]),
        right_knee: angle(lm[24], lm[26], lm[28]),
        left_hip: angle(lm[11], lm[23], lm[25]),
        right_hip: angle(lm[12], lm[24], lm[26]),
        left_elbow: angle(lm[11], lm[13], lm[15]),
        right_elbow: angle(lm[12], lm[14], lm[16]),
        left_shoulder: angle(lm[23], lm[11], lm[13]),
        right_shoulder: angle(lm[24], lm[12], lm[14]),
      };
      Object.keys(J).forEach((k) => {
        if (J[k] == null) return;
        (jointSamples[k] = jointSamples[k] || []).push(J[k]);
      });
    }

    async function tick(now) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (video.readyState < 2 || video.videoWidth === 0) return;

      const t = now - t0;
      let poseUsed = false;

      if (state.ready && state.landmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
          const out = state.landmarker.detectForVideo(video, now);
          const lm = out && out.landmarks && out.landmarks[0];
          if (lm) {
            poseFrames++;
            paintPose(lm);
            sampleJoints(lm);
            poseUsed = true;
          }
        } catch (e) {
          /* a dropped frame must not kill the session */
        }
      }

      if (!poseUsed) {
        const m = frameMotion();
        paintMotion(m, m);
        frames.push({ t, motion: m.motion, cx: m.cx, cy: m.cy });
      } else {
        frames.push({ t, motion: null, cx: 0.5, cy: 0.5 });
      }

      if (frames.length % 4 === 0) onTick({ t, frames: frames.length, poseUsed });
    }

    async function start() {
      await probe();
      resize();
      frames.length = 0;
      poseFrames = 0;
      jointSamples = {};
      prev = null;
      lastVideoTime = -1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
      return status();
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function stdev(a) {
      if (a.length < 2) return 0;
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length);
    }

    function report() {
      stop();
      const withMotion = frames.filter((f) => f.motion != null);
      const motions = withMotion.map((f) => f.motion);
      const duration = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;

      const mean = motions.length ? motions.reduce((a, b) => a + b, 0) / motions.length : 0;
      const peak = motions.length ? Math.max.apply(null, motions) : 0;
      const gate = Math.max(0.0025, mean * 0.6);
      const active = withMotion.filter((f) => f.motion >= gate);
      const activeRatio = withMotion.length ? active.length / withMotion.length : 0;

      let jitter = 0;
      if (motions.length > 2) {
        let d = 0;
        for (let i = 1; i < motions.length; i++) d += Math.abs(motions[i] - motions[i - 1]);
        jitter = mean > 0 ? d / (motions.length - 1) / mean : 0;
      }

      const swayX = stdev(active.map((f) => f.cx));
      const swayY = stdev(active.map((f) => f.cy));

      const joints = {};
      Object.keys(jointSamples).forEach((k) => {
        const v = jointSamples[k];
        if (v.length < 5) return;
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        joints[k] = { mean: Math.round(m), min: Math.round(Math.min.apply(null, v)), max: Math.round(Math.max.apply(null, v)), rom: Math.round(Math.max.apply(null, v) - Math.min.apply(null, v)) };
      });

      const enough = duration >= 2 && (state.ready ? poseFrames > 10 : motions.length > 20);

      // Downsampled trace (60 buckets) so the page can draw the actual signal.
      const series = [];
      const buckets = 60;
      if (motions.length) {
        const size = Math.max(1, Math.floor(motions.length / buckets));
        for (let i = 0; i < motions.length; i += size) {
          const chunk = motions.slice(i, i + size);
          series.push((chunk.reduce((a, b) => a + b, 0) / chunk.length) * 1000);
        }
      }

      // Derived indices. Both are heuristics over what was actually measured and
      // are labelled as such in the UI — never presented as clinical results.
      const mobility = enough && !state.ready
        ? Math.round(100 * Math.min(1, 0.6 * activeRatio + 0.4 * Math.max(0, 1 - Math.min(1, jitter))))
        : null;

      return {
        mode: state.ready ? "pose" : "motion",
        ready: state.ready,
        reason: state.reason,
        detail: state.detail,
        enough,
        duration: Math.round(duration * 10) / 10,
        frames: frames.length,
        fps: duration > 0 ? Math.round(frames.length / duration) : 0,
        resolution: (video.videoWidth || 0) + "×" + (video.videoHeight || 0),
        motion: {
          mean: Math.round(mean * 1000) / 10,
          peak: Math.round(peak * 1000) / 10,
          activeRatio: Math.round(activeRatio * 100),
          jitter: Math.round(jitter * 100) / 100,
          swayX: Math.round(swayX * 1000) / 10,
          swayY: Math.round(swayY * 1000) / 10,
          series,
        },
        pose: state.ready ? { frames: poseFrames, joints } : null,
        mobility,
      };
    }

    return { start, stop, report, isRunning: () => running };
  }

  /* ------------------------------------------------------------ fusion math */
  // Combines movement observations with the measurements the crew already has.
  // Video alone is not enough for a fatigue judgement, so the self-report carries
  // the largest weight and the parts are all returned for transparency.
  function fatigueScreen(input) {
    const parts = [];
    let wsum = 0, sum = 0;

    const add = (label, value, weight, note) => {
      if (value == null || Number.isNaN(value)) return;
      parts.push({ label, value: Math.round(value), weight, note });
      sum += value * weight;
      wsum += weight;
    };

    if (input.selfFatigue != null) {
      add("Self-reported fatigue", input.selfFatigue, 0.4, "0-100 scale entered on this page");
    }
    if (input.sleepHours != null) {
      const deficit = Math.max(0, Math.min(100, (7 - input.sleepHours) / 3 * 100));
      add("Sleep deficit", deficit, 0.25, input.sleepHours + " h last night against a 7 h need");
    }
    if (input.jitter != null) {
      add("Movement irregularity", Math.min(100, input.jitter * 100), 0.2, "frame-to-frame change in the motion trace");
    }
    if (input.restingHr != null) {
      add("Resting heart rate", Math.max(0, Math.min(100, (input.restingHr - 60) / 40 * 100)), 0.15, input.restingHr + " bpm");
    }

    if (!wsum) return null;
    return { score: Math.round(sum / wsum), parts, coverage: Math.round(wsum * 100) };
  }

  window.HELMVision = { MODEL, probe, status, create, fatigueScreen, state };
})();
