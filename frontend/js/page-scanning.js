/* ==========================================================================
   HELM · page: Physical Assessment
   Live body scan: the skeleton is drawn over the video while the camera or the
   file plays, the pre-scan gate checks the framing, then a 20 s window is
   aggregated into a report. The page only shows what was measured — a joint
   without landmarks reads "not visible", never a guess.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const V = window.HELMVision;
  const Ch = window.HELMCharts;
  const { $, $$, esc, icon, toast } = H;

  const SCAN_SECONDS = 20;

  let src = null;             // { kind, url, stream }
  let tracker = null;
  let scanning = false;
  let report = null;
  let fatigue = null;
  let selfFatigue = null;
  let selfSleep = null;
  let override = false;
  let gateOpen = true;
  let ringRaf = 0;
  let scanStart = 0;
  let hudAt = 0;
  let vision = { ready: false, reason: "not-probed", detail: "", delegate: null, model: null };
  let liveFraming = null;

  const CIRC = 113.1;        // circumference of the HUD timer ring (r = 18)

  /* One short line per framing problem. vision.js reports the reason; the page
     owns the wording, so the stage stays readable. */
  const FRAME_NOTE = {
    "Head out of frame": "Head out of frame",
    "Ankles out of frame": "Tilt the screen down",
    "Step back": "Step back ~2 m",
    "Move closer": "Move closer",
    "Centre the body": "Centre the body",
  };

  /* Darkness probe: a 32×18 copy of the video, sampled at 2 Hz. A black stage is
     almost always a lens cover, a dark room or a blocked camera — saying so is
     honest; inventing landmarks is not. */
  const DARK_LEVEL = 16;     // mean luminance below this is "very dark"
  const DARK_HOLD = 2000;    // for at least this long
  const DARK_LINE = "Camera image is very dark: check the lens cover or add light";
  const darkCanvas = document.createElement("canvas");
  darkCanvas.width = 32;
  darkCanvas.height = 18;
  const darkCtx = darkCanvas.getContext("2d", { willReadFrequently: true });
  let darkAt = 0, darkSince = 0, darkShown = false;

  /* ------------------------------------------------------------- helpers -- */
  function msg(line) {
    const el = $("#stageMsg");
    if (!line) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = line;
  }

  function setHud(state) { $("#hudState").textContent = state; }

  function setRing(pct) {
    $("#ringFill").style.strokeDashoffset = String(CIRC * (1 - Math.max(0, Math.min(1, pct))));
  }

  function stopTracks() {
    if (src && src.stream) src.stream.getTracks().forEach((t) => t.stop());
    if (src && src.url) URL.revokeObjectURL(src.url);
    if (src) { src.stream = null; src.url = null; }
  }

  function secureCameraOk() {
    if (window.isSecureContext) return true;
    if (location.protocol === "file:") return true;
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname || "");
  }

  /* --------------------------------------------------------------- source -- */
  function setSource(kind, url, stream) {
    if (tracker) { tracker.stop(); tracker = null; }
    stopTracks();

    const vid = $("#vid");
    const stage = $("#stage");
    src = { kind: kind, url: url || null, stream: stream || null };

    if (kind === "camera") {
      vid.srcObject = stream;
      vid.loop = false;
      vid.controls = false;
      stage.classList.add("is-mirror");
    } else {
      vid.srcObject = null;
      vid.loop = true;
      vid.src = url;
      vid.controls = false;
      stage.classList.remove("is-mirror");
    }

    stage.classList.add("has-source");
    darkAt = 0; darkSince = 0; darkShown = false;
    $("#progressText").textContent = kind === "camera" ? "Camera live" : "Video loaded";
    $("#srcFoot").textContent = kind === "camera" ? "Vision: front camera · mirrored" : "Vision: uploaded video";
    msg("");
    setHud("Loading");
    setRing(0);

    vid.onloadedmetadata = () => {
      vid.play().catch(() => {});
      attachTracker();
    };
    vid.play().catch(() => {});

    // a camera stream may already have metadata
    if (vid.readyState >= 1) attachTracker();
  }

  function attachTracker() {
    if (!src || tracker) return;
    const vid = $("#vid");
    if (!vid.videoWidth) return;

    tracker = V.create({
      video: vid,
      canvas: $("#overlay"),
      stage: $("#stage"),
      mirrored: src.kind === "camera",
      onTick: onFrame,
    });
    tracker.start();
    setHud(vision.ready ? "Tracking" : "Motion trace");
  }

  function onFrame(t) {
    liveFraming = t.framing;
    if (t.confidence) $("#hudConf").textContent = t.confidence + "%";
    $("#hudFps").textContent = String(t.fps || 0);

    const now = performance.now();
    if (now - darkAt >= 500) { darkAt = now; checkDark(now); }

    // gate + dots at ~10 Hz, not on every frame
    if (now - hudAt < 100) return;
    hudAt = now;

    if (!scanning) updateGate(t.framing);
    paintLiveDots(t.angles);
  }

  async function useCamera() {
    if (!secureCameraOk()) {
      msg("Camera needs localhost or HTTPS.");
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg("This browser cannot open a camera.");
      return;
    }

    // 1080p first, 720p next, then whatever the camera will give us
    const IDEALS = [
      { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
      { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      { facingMode: "user" },
    ];
    let err = null;
    for (let i = 0; i < IDEALS.length; i++) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: IDEALS[i], audio: false });
        setSource("camera", null, stream);
        return;
      } catch (e) {
        err = e;
        const name = (e && e.name) || "";
        // permission or "no camera" will not improve with a smaller request
        if (name === "NotAllowedError" || name === "SecurityError" || name === "NotFoundError") break;
      }
    }

    const name = (err && err.name) || "blocked";
    msg(name === "NotAllowedError" ? "Camera permission denied — upload a video instead."
      : name === "NotFoundError" ? "No camera found — upload a video instead."
      : "Camera unavailable — upload a video instead.");
  }

  /* Only the level of the picture, nothing else. */
  function checkDark(now) {
    if (!src) return;
    const vid = $("#vid");
    if (vid.readyState < 2 || !vid.videoWidth) return;

    let mean = 0;
    try {
      darkCtx.drawImage(vid, 0, 0, 32, 18);
      const d = darkCtx.getImageData(0, 0, 32, 18).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      mean = sum / (32 * 18);
    } catch (e) {
      return; // a protected frame cannot be read: stay quiet
    }

    if (mean < DARK_LEVEL) {
      if (!darkSince) darkSince = now;
      else if (!darkShown && now - darkSince >= DARK_HOLD) {
        darkShown = true;
        msg(DARK_LINE);
      }
    } else {
      darkSince = 0;
      if (darkShown) { darkShown = false; msg(""); }
    }
  }

  function fileChosen(file) {
    if (!file) return;
    if (!/^video\//.test(file.type || "")) { msg("That file is not a video."); return; }
    setSource("file", URL.createObjectURL(file), null);
  }

  /* ----------------------------------------------------------- framing gate */
  function updateGate(fr) {
    const pill = $("#framePill");
    const text = $("#frameText");

    if (!src) {
      pill.className = "frame-pill is-idle";
      text.textContent = "Framing check";
      gateOpen = false;
    } else if (!vision.ready) {
      pill.className = "frame-pill is-idle";
      text.textContent = "Framing check needs pose";
      gateOpen = true;
    } else if (!fr) {
      pill.className = "frame-pill is-idle";
      text.textContent = "Step into frame";
      gateOpen = false;
    } else {
      pill.className = "frame-pill " + (fr.ok ? "is-ok" : "is-warn");
      // a percentage only means something once head and feet are both visible
      const pct = fr.head && fr.ankles ? " · " + fr.fill + "%" : "";
      text.textContent = fr.ok ? "Full body in frame" + pct : (FRAME_NOTE[fr.note] || fr.note) + pct;
      gateOpen = !!fr.ok;
    }
    syncScanBtn();
  }

  function syncScanBtn() {
    if (scanning) return;
    const has = !!src;
    $("#scanBtn").disabled = !has || !(gateOpen || override);
    $("#forceBtn").hidden = !has || gateOpen || scanning;
  }

  /* ---------------------------------------------------------------- expand --
     Fullscreen API on the stage card (the stage itself cannot hold the control
     bar). A fixed layer is the fallback where the API is blocked. Either way
     the HUD, the framing pill and the countdown live inside #stage and keep
     working, and the tracker re-fits the overlay canvas on its next frame. */
  function stageCard() { return $(".stage-card"); }

  function isExpanded() {
    const card = stageCard();
    return document.fullscreenElement === card || card.classList.contains("is-expanded");
  }

  function syncExpandBtn() {
    const btn = $("#expandBtn");
    if (!btn) return;
    const on = isExpanded();
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.title = on ? "Exit expanded view" : "Expand stage";
    btn.setAttribute("aria-label", btn.title);
  }

  function collapseStage() {
    const card = stageCard();
    if (card.classList.contains("is-expanded")) {
      card.classList.remove("is-expanded");
      document.body.classList.remove("fs-stage");
    }
    if (document.fullscreenElement === card && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    syncExpandBtn();
  }

  async function toggleExpand() {
    const card = stageCard();
    if (isExpanded()) { collapseStage(); return; }
    if (card.requestFullscreen) {
      try {
        await card.requestFullscreen();
        syncExpandBtn();
        return;
      } catch (e) {
        /* blocked or unsupported: use the fixed layer instead */
      }
    }
    card.classList.add("is-expanded");
    document.body.classList.add("fs-stage");
    syncExpandBtn();
  }

  /* ------------------------------------------------------------------ scan */
  function scan() {
    if (!src || scanning || !tracker) return;
    const vid = $("#vid");

    scanning = true;
    report = null;
    override = false;
    $("#stage").classList.add("scanning");
    $("#scanBtn").disabled = true;
    $("#forceBtn").hidden = true;
    $("#uploadBtn").disabled = true;
    $("#cameraBtn").disabled = true;
    $("#resetBtn").disabled = true;
    $("#countdown").hidden = false;
    $("#cdNum").textContent = String(SCAN_SECONDS);
    setHud("Scanning");
    setRing(0);
    renderMetrics(null);

    if (src.kind === "file") { vid.currentTime = 0; vid.play().catch(() => {}); }

    tracker.beginScan();
    scanStart = performance.now();

    const tick = () => {
      if (!scanning) return;
      const el = (performance.now() - scanStart) / 1000;
      const pct = Math.min(1, el / SCAN_SECONDS);
      setRing(pct);
      $("#prog").style.width = (pct * 100).toFixed(0) + "%";
      $("#progressText").textContent = el.toFixed(1) + " / " + SCAN_SECONDS + " s";
      $("#cdNum").textContent = String(Math.max(0, Math.ceil(SCAN_SECONDS - el)));
      if (el >= SCAN_SECONDS) { finish(); return; }
      ringRaf = requestAnimationFrame(tick);
    };
    ringRaf = requestAnimationFrame(tick);
  }

  function finish() {
    if (!scanning) return;
    scanning = false;
    if (ringRaf) cancelAnimationFrame(ringRaf);

    report = tracker ? tracker.report() : null;

    $("#stage").classList.remove("scanning");
    $("#countdown").hidden = true;
    $("#prog").style.width = "100%";
    if (src && src.kind === "file") $("#vid").pause();

    $("#uploadBtn").disabled = false;
    $("#cameraBtn").disabled = false;
    $("#resetBtn").disabled = false;
    syncScanBtn();

    setHud(report && report.enough ? "Complete" : "Sample short");
    if (report) {
      $("#progressText").textContent = report.validSeconds + " / " + SCAN_SECONDS + " s valid";
      $("#srcFoot").textContent = report.ready ? "Vision: pose · " + report.delegate : "Vision: motion";
    }

    renderReport(report);
    if (!report || !report.enough) {
      msg("Needs " + V.MIN_VALID_SEC + " s of valid frames — got " + (report ? report.validSeconds : 0) + " s.");
    } else {
      msg("");
    }
  }

  function reset() {
    scanning = false;
    if (ringRaf) cancelAnimationFrame(ringRaf);
    if (tracker) { tracker.stop(); tracker = null; }

    const vid = $("#vid");
    vid.pause();
    vid.removeAttribute("src");
    vid.srcObject = null;
    vid.onloadedmetadata = null;
    stopTracks();
    src = null;
    report = null;
    fatigue = null;
    liveFraming = null;
    override = false;
    darkAt = 0; darkSince = 0; darkShown = false;

    const cv = $("#overlay");
    cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);

    const stage = $("#stage");
    stage.classList.remove("has-source", "scanning", "is-mirror");
    $("#countdown").hidden = true;
    $("#prog").style.width = "0%";
    $("#progressText").textContent = "No source";
    $("#hudFps").textContent = "—";
    $("#hudConf").textContent = "—";
    $("#srcFoot").textContent = "Vision: on device";
    setHud("Standby");
    setRing(0);
    msg("");
    updateGate(null);
    renderMetrics(null);
    renderReport(null);
    $("#jointOut").textContent = "No joint selected";
    $$(".jdot").forEach((d) => d.setAttribute("class", "jdot is-off"));
  }

  /* --------------------------------------------------------------- metrics */
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

  function card(opts) {
    const pct = opts.pct == null ? 0 : Math.max(0, Math.min(100, opts.pct));
    const dial = opts.dial
      ? '<span class="dial" style="--p:' + pct.toFixed(0) + ";--c:" + (opts.color || "var(--cyan)") + '"></span>'
      : "";
    const bar = opts.dial ? "" : '<span class="mbar"><i style="width:' + pct.toFixed(0) + '%"></i></span>';
    return '<div class="mcard' + (opts.value == null ? " is-empty" : " has") + '">' +
      '<div class="mcard-top"><span class="mico">' + icon(opts.icon) + "</span>" + dial + "</div>" +
      '<b class="mnum">' + (opts.value == null ? "—" : esc(String(opts.value)) + (opts.unit ? "<small>" + esc(opts.unit) + "</small>" : "")) + "</b>" +
      '<span class="mlabel">' + esc(opts.label) + "</span>" + bar +
      "</div>";
  }

  function renderMetrics(rep) {
    const live = rep && rep.enough;
    const pose = rep && rep.pose;
    const joints = pose ? Object.keys(pose.joints) : [];
    const romAvg = joints.length ? Math.round(mean(joints.map((k) => pose.joints[k].rom))) : null;
    const asym = pose ? pose.asymmetryOverall : null;
    const jitter = rep && rep.motion ? rep.motion.jitter : null;

    $("#metrics").innerHTML = [
      card({
        icon: "muscle", label: "Mobility index", value: live && rep.mobility != null ? rep.mobility : null,
        pct: live && rep.mobility != null ? rep.mobility : 0, dial: true, color: "var(--cyan)",
      }),
      card({
        icon: "moon", label: "Fatigue screen", value: live && fatigue ? fatigue.score : null,
        pct: live && fatigue ? fatigue.score : 0, dial: true,
        color: live && fatigue && fatigue.score >= 60 ? "var(--warn)" : "var(--ok)",
      }),
      card({
        icon: "activity", label: "Range of motion", value: live ? romAvg : null, unit: "°",
        pct: live && romAvg != null ? (romAvg / 120) * 100 : 0,
      }),
      card({
        icon: "chart", label: "L/R symmetry", value: live && asym != null ? 100 - asym : null, unit: "%",
        pct: live && asym != null ? 100 - asym : 0,
      }),
      card({
        icon: "spark", label: "Movement quality", value: live && jitter != null ? Math.round(100 * Math.max(0, 1 - Math.min(1, jitter))) : null,
        pct: live && jitter != null ? 100 * Math.max(0, 1 - Math.min(1, jitter)) : 0,
      }),
    ].join("");
  }

  /* -------------------------------------------------------------- body map */
  const DOT_LABEL = {
    left_shoulder: "Left shoulder", right_shoulder: "Right shoulder",
    left_elbow: "Left elbow", right_elbow: "Right elbow",
    left_hip: "Left hip", right_hip: "Right hip",
    left_knee: "Left knee", right_knee: "Right knee",
  };

  function jointStatus(j) {
    if (!j) return "is-off";
    return j.rom >= 30 ? "is-ok" : "is-warn";
  }

  function paintDots(map, sel) {
    $$(".jdot").forEach((d) => {
      const k = d.dataset.joint;
      // SVG className is read-only: set the attribute or the dots never light up.
      d.setAttribute("class", "jdot " + (map[k] || "is-off") + (k === sel ? " sel" : ""));
    });
  }

  function paintLiveDots(angles) {
    if (!angles || report) return;
    const map = {};
    Object.keys(angles).forEach((k) => { map[k] = angles[k] == null ? "is-off" : "is-ok"; });
    paintDots(map, selected);
  }

  let selected = null;

  function jointLine(key) {
    const label = DOT_LABEL[key] || key;
    const j = report && report.pose ? report.pose.joints[key] : null;
    if (j) return label + " · " + j.mean + "° · " + j.min + "–" + j.max + "° · ROM " + j.rom + "°";
    const live = tracker && tracker.angles ? tracker.angles() : null;
    if (live && live[key] != null) return label + " · " + Math.round(live[key]) + "° live";
    return label + " · not visible";
  }

  function selectJoint(key) {
    selected = key;
    const map = {};
    $$(".jdot").forEach((d) => {
      const j = report && report.pose ? report.pose.joints[d.dataset.joint] : null;
      if (report && report.pose) map[d.dataset.joint] = jointStatus(j);
      else {
        const live = tracker && tracker.angles ? tracker.angles() : null;
        map[d.dataset.joint] = live && live[d.dataset.joint] != null ? "is-ok" : "is-off";
      }
    });
    paintDots(map, key);
    $("#jointOut").textContent = jointLine(key);
  }

  function bindDots() {
    $$(".jdot").forEach((d) => {
      d.addEventListener("mouseenter", () => selectJoint(d.dataset.joint));
      d.addEventListener("focus", () => selectJoint(d.dataset.joint));
      d.addEventListener("click", () => selectJoint(d.dataset.joint));
    });
  }

  /* ---------------------------------------------------------------- report */
  function renderReport(rep) {
    if (!rep) {
      renderMetrics(null);
      $("#trace").innerHTML = "";
      $("#traceMeta").textContent = "per-mille of frame change";
      $("#saveRow").hidden = true;
      $$(".jdot").forEach((d) => d.setAttribute("class", "jdot is-off"));
      return;
    }

    // fatigue screen: the fusion maths is unchanged, inputs that were not
    // measured are simply not passed in.
    const hr = ((H.currentStatus().indicators || {}).heart_rate || {}).value;
    fatigue = V.fatigueScreen({
      selfFatigue: selfFatigue,
      sleepHours: selfSleep,
      jitter: rep.ready ? null : rep.motion.jitter,
      restingHr: hr,
    });

    renderMetrics(rep);

    if (rep.pose) {
      const map = {};
      Object.keys(DOT_LABEL).forEach((k) => { map[k] = jointStatus(rep.pose.joints[k]); });
      paintDots(map, selected);
    } else {
      $$(".jdot").forEach((d) => d.setAttribute("class", "jdot is-off"));
    }
    if (selected) $("#jointOut").textContent = jointLine(selected);

    // trace
    const values = rep.motion && rep.motion.series ? rep.motion.series : [];
    if (values.length > 3) {
      Ch.render($("#trace"), Ch.line({
        labels: values.map((_, i) => i),
        height: 110,
        decimals: 1,
        series: [{ name: "Movement", color: "#22d3ee", values: values, area: true }],
      }));
      $("#traceMeta").textContent = values.length + " points · per-mille";
    } else {
      $("#trace").innerHTML = "";
      $("#traceMeta").textContent = "No trace";
    }

    $("#saveRow").hidden = !rep.enough;
  }

  /* ------------------------------------------------------------------ save */
  /* Only the fields this scan measured are written. The day is kept unless the
     crew explicitly asks for a new one. */
  function saveScan(asNewDay) {
    if (!report || !report.enough) return;
    const last = H.latest();
    const entry = Object.assign({}, last);
    delete entry._api;
    delete entry.events;

    entry.source = "physical_scan";
    entry.scan_mode = report.mode;
    entry.scan_valid_s = report.validSeconds;
    entry.created_at = new Date().toISOString();
    entry.distance_from_earth_km = H.MODES[H.state.mode].km;

    if (asNewDay) entry.day = (last.day == null ? 30 : last.day) + 1;
    // otherwise entry.day keeps the saved day untouched

    if (report.mobility != null) entry.mobility_index = report.mobility;
    else delete entry.mobility_index;
    if (fatigue) entry.fatigue_score = fatigue.score;
    else delete entry.fatigue_score;

    H.saveLocal(entry);
    toast(asNewDay ? "Saved as a new day" : "Scan saved to " + H.dayLabel(entry), "ok");
    H.sync().then((r) => { if (r && r.pushed) toast("Backend accepted the check-in", "ok"); });
  }

  /* --------------------------------------------------------- status panels */
  function renderPill() {
    const pill = $("#modePill");
    if (vision.reason === "not-probed") {
      pill.className = "pill";
      pill.innerHTML = icon("clock") + "<span>Checking runtime…</span>";
    } else if (vision.ready) {
      pill.className = "pill is-ok";
      pill.innerHTML = icon("scan") + "<span>Pose tracking · on device</span>";
    } else {
      pill.className = "pill is-warn";
      pill.innerHTML = icon("activity") + "<span>Motion mode</span>";
    }
  }

  function renderDetails() {
    const rows = [
      ["Mode", vision.ready ? "33-landmark pose" : "frame differencing"],
      ["Runtime", vision.detail || "checking"],
      ["Delegate", vision.delegate || "—"],
      ["Model", vision.model ? "pose_landmarker_" + vision.model : "not loaded"],
      ["Bundle", vision.module || "—"],
      ["Network", "none · all files local"],
    ];
    $("#detBody").innerHTML = rows.map((r) =>
      '<div class="det-row"><span>' + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>").join("");
  }

  function renderProtocol() {
    const chips = [
      ["spark", "Lighting", "Even light, no bright window behind you."],
      ["scan", "Full body", "Head to ankles inside the frame for the whole sample."],
      ["activity", "Slow reps", "Slow squats, arm raises, trunk turns."],
      ["shield", "One person", "One person in frame, camera held still."],
      ["clock", SCAN_SECONDS + " s", "The scan runs for " + SCAN_SECONDS + " seconds; stop if you feel pain."],
    ];
    $("#proto").innerHTML = chips.map((c) =>
      '<span class="pchip" tabindex="0" title="' + esc(c[2]) + '">' + icon(c[0]) + esc(c[1]) + "</span>").join("");
  }

  /* ------------------------------------------------------------------ boot */
  H.ready(() => {
    H.boot(() => {
      $("#stageIco").innerHTML = icon("scan");
      $("#pickBtn").innerHTML = icon("upload") + "Upload";
      $("#camBtn").innerHTML = icon("camera") + "Camera";
      $("#scanBtn").innerHTML = icon("play") + "Start scan";

      const last = H.latest();
      selfSleep = last.sleep_hours == null ? null : last.sleep_hours;
      selfFatigue = last.fatigue_score == null ? null : last.fatigue_score;

      const fr = $("#fatigueRange");
      fr.value = String(selfFatigue == null ? 40 : Math.round(selfFatigue));
      $("#fatigueOut").textContent = String(fr.value);
      fr.addEventListener("input", () => {
        selfFatigue = Number(fr.value);
        $("#fatigueOut").textContent = fr.value;
      });

      const sl = $("#sleepInput");
      sl.value = selfSleep == null ? "" : String(selfSleep);
      sl.addEventListener("change", () => {
        const v = sl.value === "" ? null : Number(sl.value);
        selfSleep = v == null || Number.isNaN(v) ? null : v;
      });

      renderProtocol();
      renderPill();
      renderDetails();
      renderMetrics(null);
      bindDots();
      updateGate(null);

      $("#file").addEventListener("change", (e) => fileChosen(e.target.files && e.target.files[0]));
      $("#pickBtn").addEventListener("click", () => $("#file").click());
      $("#uploadBtn").addEventListener("click", () => $("#file").click());
      $("#camBtn").addEventListener("click", useCamera);
      $("#cameraBtn").addEventListener("click", useCamera);
      $("#scanBtn").addEventListener("click", scan);
      $("#forceBtn").addEventListener("click", () => { override = true; syncScanBtn(); scan(); });
      $("#resetBtn").addEventListener("click", reset);
      $("#saveBtn").addEventListener("click", () => saveScan(false));
      $("#saveNewBtn").addEventListener("click", () => saveScan(true));

      // expand / exit; Esc closes the fixed-layer fallback
      $("#expandBtn").addEventListener("click", toggleExpand);
      document.addEventListener("fullscreenchange", syncExpandBtn);
      window.addEventListener("resize", syncExpandBtn);
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && stageCard().classList.contains("is-expanded")) collapseStage();
      });

      const stage = $("#stage");
      ["dragenter", "dragover"].forEach((ev) => stage.addEventListener(ev, (e) => {
        e.preventDefault();
        stage.classList.add("dragging");
      }));
      ["dragleave", "drop"].forEach((ev) => stage.addEventListener(ev, (e) => {
        e.preventDefault();
        stage.classList.remove("dragging");
      }));
      stage.addEventListener("drop", (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        fileChosen(f);
      });
      stage.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        if (!src) $("#file").click();
      });

      // runtime probe: honest fallback, never a simulated landmark
      V.probe().then((st) => {
        vision = st;
        renderPill();
        renderDetails();
        if (!st.ready) {
          setHud("Motion trace");
          if (src) attachTracker();
        } else if (src) {
          attachTracker();
        }
        updateGate(liveFraming);
      });

      // camera tracks and the frame loop must never survive the page
      const bye = () => {
        scanning = false;
        if (ringRaf) cancelAnimationFrame(ringRaf);
        if (tracker) tracker.stop();
        if (src && src.stream) src.stream.getTracks().forEach((t) => t.stop());
      };
      window.addEventListener("pagehide", bye);
      window.addEventListener("beforeunload", bye);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") bye();
        else if (src && !tracker) attachTracker();
      });

      H.on((what) => { if (what === "mode") H.paintShell(); });
    });
  });
})();
