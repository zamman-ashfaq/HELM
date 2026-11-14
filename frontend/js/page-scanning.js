/* ==========================================================================
   HELM · page: Physical Assessment
   Capture a movement sample, run the local vision module over it and report
   only what was actually measured. When the pose model is missing the page
   says so and falls back to frame-difference motion analysis.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const V = window.HELMVision;
  const Ch = window.HELMCharts;
  const { $, esc, num, icon, toast } = H;

  const SCAN_SECONDS = 20;

  let src = null;              // { kind, label, stream }
  let tracker = null;
  let scanning = false;
  let lastReport = null;
  let selfFatigue = null;
  let selfSleep = null;
  let raf = 0;
  let scanStart = 0;
  let vision = { ready: false, reason: "not-probed", detail: "" };

  /* -------------------------------------------------------------- sources */
  function stopTracks() {
    if (src && src.stream) src.stream.getTracks().forEach((t) => t.stop());
  }

  function setSource(kind, label, stream) {
    stopTracks();
    const vid = $("#vid");
    src = { kind, label, stream: stream || null };

    if (kind === "camera") {
      vid.srcObject = stream;
      vid.loop = false;
      vid.controls = false;
    } else {
      vid.srcObject = null;
      vid.loop = true;
      vid.src = label;
      vid.controls = true;
    }

    $("#stage").classList.add("has-source");
    $("#stateBadge").className = "badge is-caution";
    $("#stateBadge").textContent = kind === "camera" ? "CAMERA" : "VIDEO";
    $("#hudTl").textContent = "READY";
    $("#hudTr").textContent = "—";
    $("#hudBl").textContent = "0.0 s";
    $("#scanBtn").disabled = false;
    $("#progressText").textContent = kind === "camera" ? "Live camera · not recorded" : "Loaded " + label.split("/").pop();

    vid.onloadedmetadata = () => {
      $("#hudTr").textContent = vid.videoWidth + "×" + vid.videoHeight;
      vid.play().catch(() => {});
    };
    if (kind === "camera") vid.play().catch(() => {});
  }

  async function useCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("This browser cannot open a camera here", "warn");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      setSource("camera", "camera", stream);
      toast("Camera live — nothing is recorded or uploaded", "ok");
    } catch (err) {
      toast("Camera unavailable: " + (err && err.name ? err.name : "blocked"), "warn");
    }
  }

  function fileChosen(file) {
    if (!file) return;
    if (!/^video\//.test(file.type || "")) {
      toast("That file is not a video", "warn");
      return;
    }
    const url = URL.createObjectURL(file);
    setSource("file", url);
    $("#hudTr").textContent = "loading…";
  }

  /* ---------------------------------------------------------------- scan */
  function scan() {
    if (!src || scanning) return;
    const vid = $("#vid");

    tracker = V.create({
      video: vid,
      canvas: $("#overlay"),
      onTick: ({ frames }) => {
        const el = (performance.now() - scanStart) / 1000;
        const pct = Math.min(100, (el / SCAN_SECONDS) * 100);
        $("#prog").style.width = pct.toFixed(0) + "%";
        $("#hudBl").textContent = el.toFixed(1) + " s";
        $("#progressText").textContent = "Analysing frame " + frames + " · " + el.toFixed(1) + "s / " + SCAN_SECONDS + "s";
      },
    });

    scanning = true;
    lastReport = null;
    $("#stage").classList.add("scanning");
    $("#scanbar").hidden = false;
    $("#stateBadge").className = "badge is-caution";
    $("#stateBadge").textContent = "SCANNING";
    $("#hudTl").textContent = "SCANNING";
    $("#scanBtn").disabled = true;
    $("#uploadBtn").disabled = true;
    $("#cameraBtn").disabled = true;
    $("#resetBtn").disabled = true;
    renderResultsPlaceholder("Scanning…");

    if (src.kind === "file") { vid.currentTime = 0; vid.play().catch(() => {}); }

    tracker.start().then((st) => {
      $("#hudTl").textContent = st.ready ? "POSE TRACKING" : "MOTION TRACE";
      $("#modePill").innerHTML = icon(st.ready ? "scan" : "activity") +
        "<span>" + (st.ready ? "Pose model" : "Motion analysis") + "</span>";
    });

    scanStart = performance.now();
    const tick = () => {
      if (!scanning) return;
      const el = (performance.now() - scanStart) / 1000;
      if (el >= SCAN_SECONDS) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function finish() {
    if (!scanning) return;
    scanning = false;
    if (raf) cancelAnimationFrame(raf);
    const rep = tracker ? tracker.report() : null;
    lastReport = rep;

    $("#stage").classList.remove("scanning");
    $("#scanbar").hidden = true;
    $("#hudTl").textContent = "COMPLETE";
    $("#prog").style.width = "100%";
    const vid = $("#vid");
    if (src && src.kind === "file") vid.pause();

    $("#scanBtn").disabled = false;
    $("#uploadBtn").disabled = false;
    $("#cameraBtn").disabled = false;
    $("#resetBtn").disabled = false;
    $("#stateBadge").className = "badge " + (rep && rep.enough ? "is-nominal" : "is-caution");
    $("#stateBadge").textContent = rep && rep.enough ? "COMPLETE" : "SAMPLE SHORT";
    $("#progressText").textContent = rep
      ? rep.frames + " frames · " + rep.duration + " s analysed"
      : "No sample";

    renderResults(rep);
  }

  function reset() {
    scanning = false;
    if (raf) cancelAnimationFrame(raf);
    if (tracker) tracker.stop();
    const vid = $("#vid");
    vid.pause();
    if (src && src.kind === "file") URL.revokeObjectURL(vid.src);
    vid.removeAttribute("src");
    vid.srcObject = null;
    stopTracks();
    src = null;
    lastReport = null;

    const cv = $("#overlay");
    cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);

    $("#stage").classList.remove("has-source", "scanning");
    $("#scanbar").hidden = true;
    $("#stateBadge").className = "badge is-nodata";
    $("#stateBadge").textContent = "NO SOURCE";
    $("#hudTl").textContent = "STANDBY";
    $("#hudTr").textContent = "NO SOURCE";
    $("#hudBl").textContent = "0.0 s";
    $("#scanBtn").disabled = true;
    $("#prog").style.width = "0%";
    $("#progressText").textContent = "No source loaded";
    renderResultsPlaceholder();
  }

  /* -------------------------------------------------------------- results */
  function modeLabel(rep) {
    return rep.ready ? "Pose landmark" : "Motion analysis";
  }

  function renderResultsPlaceholder(msg) {
    $("#resultsPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Scan report</span>' +
        "<h3 style=\"margin-top:5px\">Assessment results</h3></div><span class=\"spacer\"></span>" +
        '<span class="badge is-nodata">AWAITING SCAN</span></div>' +
      '<div class="empty"><b>' + esc(msg || "Nothing scanned yet") + "</b>" +
      (msg ? "Keep the sample steady while the frames are read."
           : "Load a movement video or open the camera, then start the scan. Results list only what the analysis actually measured.") +
      "</div>";
  }

  function mini(k, v, unit) {
    return '<div class="metric-mini"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) +
      (unit ? ' <span>' + esc(unit) + "</span>" : "") + "</span></div>";
  }

  function rtw(k, v) {
    return '<div class="rtw"><span class="k">' + esc(k) + '</span><span class="v">' + v + "</span><span></span></div>";
  }

  function renderResults(rep) {
    if (!rep) { renderResultsPlaceholder(); return; }

    const head =
      '<div class="panel-head"><div><span class="eyebrow">Scan report</span>' +
        '<h3 style="margin-top:5px">Assessment results</h3></div><span class="spacer"></span>' +
        '<span class="badge ' + (rep.enough ? "is-nominal" : "is-caution") + '">' + esc(modeLabel(rep).toUpperCase()) + "</span></div>";

    if (!rep.enough) {
      $("#resultsPanel").innerHTML = head +
        '<div class="empty"><b>Sample too short to report</b>' +
        "The analysis read " + rep.frames + " frames over " + rep.duration + " s. Record at least " + SCAN_SECONDS +
        " seconds with most of the body in frame, then scan again.</div>" +
        '<div class="mini-grid">' + mini("Duration", rep.duration, "s") + mini("Frames", rep.frames) +
        mini("Resolution", rep.resolution) + "</div>";
      return;
    }

    const m = rep.motion;
    const motionChart = Ch.line({
      labels: m.series.map((_, i) => i),
      height: 150, decimals: 1,
      series: [{ name: "Motion", color: "#22d3ee", values: m.series, area: true }],
      title: "Movement trace",
    });

    const fatigueInput = {
      selfFatigue: selfFatigue,
      sleepHours: selfSleep,
      jitter: m.jitter,
      restingHr: (H.currentStatus().indicators.heart_rate || {}).value,
    };
    const fat = V.fatigueScreen(fatigueInput);

    let poseBlock;
    if (rep.pose) {
      const keys = Object.keys(rep.pose.joints);
      poseBlock =
        '<div class="form-section"><div class="form-section-title">' + icon("scan") + "Joint range observed</div>" +
        (keys.length
          ? keys.map((k) => {
              const j = rep.pose.joints[k];
              return '<div class="joint-row"><span class="nm">' + esc(k.replace(/_/g, " ")) +
                ' <small>' + j.min + "°–" + j.max + "°</small></span>" +
                '<span class="bar"><i style="width:' + Math.max(2, Math.min(100, j.rom / 1.8)) + '%"></i></span>' +
                '<span class="dg">' + j.rom + "°</span></div>";
            }).join("")
          : '<div class="empty"><b>No joints tracked</b>Keep the full body in frame for the whole sample.</div>') +
        "</div>";
    } else {
      poseBlock =
        '<div class="form-section"><div class="form-section-title">' + icon("lock") + "Body landmarks</div>" +
        '<div class="not-instrumented">' + icon("info") +
        "<div><b>Pose model not installed</b>Landmarks, joint angles and a skeleton overlay need the MediaPipe runtime in " +
        '<span class="mono">frontend/vendor/mediapipe/</span>. This page already looks for it and switches to landmark ' +
        "tracking the moment it is present — no code change required, and no results are invented without it.</div></div></div>";
    }

    const fatBlock = fat
      ? '<div class="form-section"><div class="form-section-title">' + icon("moon") + "Fatigue screen</div>" +
        '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
          Ch.ring(fat.score, { size: 120, label: "SCREEN", color: fat.score >= 60 ? "#f7b955" : "#35e2a4" }) +
          '<div style="flex:1;min-width:180px">' +
            fat.parts.map((p) => '<div class="rtw"><span class="k">' + esc(p.label) +
              '</span><span class="v">' + p.value + '</span><span class="muted small">' + Math.round(p.weight * 100) + "%</span></div>").join("") +
            '<p class="small muted" style="margin-top:8px">Weighted from ' + fat.coverage +
            "% of the inputs. Video movement alone is never treated as a fatigue diagnosis.</p>" +
          "</div>" +
        "</div></div>"
      : '<div class="form-section"><div class="form-section-title">' + icon("moon") + "Fatigue screen</div>" +
        '<div class="empty"><b>Needs one more input</b>Enter your current fatigue below, or record the measurement on the assessment page.</div></div>';

    $("#resultsPanel").innerHTML =
      head +
      '<div class="mini-grid">' +
        mini("Duration", rep.duration, "s") +
        mini("Frames read", rep.frames) +
        mini("Effective rate", rep.fps, "fps") +
        mini("Resolution", rep.resolution) +
        mini("Analysis", rep.ready ? "Pose" : "Motion") +
        mini("Active time", m.activeRatio, "%") +
      "</div>" +
      '<div class="form-section"><div class="form-section-title">' + icon("activity") + "Movement trace" +
        '<span class="spacer" style="margin-left:auto"></span></div>' +
        '<div id="mChart"></div>' +
        '<div class="chips" style="margin-top:8px">' +
          '<span class="chip">Mean <b>' + m.mean + "</b></span>" +
          '<span class="chip">Peak <b>' + m.peak + "</b></span>" +
          '<span class="chip">Trace jitter <b>' + m.jitter + "</b></span>" +
          '<span class="chip">Sway X <b>' + m.swayX + "</b></span>" +
          '<span class="chip">Sway Y <b>' + m.swayY + "</b></span>" +
        "</div>" +
        '<p class="small muted" style="margin-top:8px">Units are per-mille of the frame area changed between frames. ' +
        "This is a real measurement of on-screen movement, not a posture or gait classification.</p>" +
      "</div>" +
      poseBlock +
      fatBlock +
      (rep.mobility != null
        ? '<div class="form-section"><div class="form-section-title">' + icon("muscle") + "Mobility index</div>" +
          '<div style="display:flex;gap:14px;align-items:center">' +
            Ch.ring(rep.mobility, { size: 108, label: "MOBILITY", color: "#22d3ee" }) +
            '<p class="small muted" style="flex:1;min-width:160px">Heuristic over active time and trace smoothness. It is a ' +
            "screening number to compare your own sessions over time, not a range-of-motion measurement.</p>" +
          "</div></div>"
        : "") +
      '<div class="scan-controls" style="margin-top:14px">' +
        '<button class="btn btn-primary" id="saveBtn" type="button">' + icon("plus") + "Save to health record</button>" +
        '<span class="grow"></span>' +
        '<a class="btn btn-ghost" href="assessment.html">' + icon("clipboard") + "Open assessment</a>" +
      "</div>";

    if ($("#mChart")) Ch.render($("#mChart"), motionChart);
    const sb = $("#saveBtn");
    if (sb) sb.addEventListener("click", () => saveScan(rep, fat));
  }

  function saveScan(rep, fat) {
    const last = H.latest();
    const entry = Object.assign({}, last);
    delete entry._api;
    delete entry.created_at;
    delete entry.mobility_index;

    entry.day = (last.day == null ? 30 : last.day) + 1;
    entry.created_at = new Date().toISOString();
    entry.distance_from_earth_km = H.MODES[H.state.mode].km;
    if (rep.mobility != null) entry.mobility_index = rep.mobility;
    if (selfFatigue != null) entry.fatigue_score = selfFatigue;

    H.saveLocal(entry);
    H.toast("Scan saved to the local record", "ok");
    H.sync().then((r) => {
      if (r && r.pushed) toast("Backend accepted the check-in", "ok");
    });
  }

  /* ----------------------------------------------------------- side panels */
  function renderModel() {
    const pill = $("#modePill");
    if (vision.reason === "ready") {
      pill.className = "pill is-live";
      pill.innerHTML = icon("scan") + "<span>Pose model ready</span>";
    } else if (vision.reason === "missing") {
      pill.className = "pill is-warn";
      pill.innerHTML = icon("activity") + "<span>Motion analysis</span>";
    } else if (vision.reason === "not-probed") {
      pill.className = "pill";
      pill.innerHTML = icon("clock") + "<span>Checking model…</span>";
    } else {
      pill.className = "pill is-warn";
      pill.innerHTML = icon("alert") + "<span>Motion analysis</span>";
    }

    const badge = vision.reason === "ready"
      ? '<span class="badge is-nominal">INSTALLED</span>'
      : vision.reason === "not-probed"
        ? '<span class="badge is-nodata">CHECKING</span>'
        : '<span class="badge is-caution">NOT INSTALLED</span>';

    $("#modelPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Runtime</span><h3 style="margin-top:5px">Pose model</h3></div>' +
        '<span class="spacer"></span>' + badge + "</div>" +
      '<div class="context-card">' +
        '<div class="ctx-row"><span>Mode</span><b>' + (vision.ready ? "Pose landmarks" : "Frame differencing") + "</b></div>" +
        '<div class="ctx-row"><span>Runtime</span><b class="mono">' + esc(vision.detail || "—") + "</b></div>" +
        '<div class="ctx-row"><span>Expected path</span><b class="mono">' + esc(V.MODEL.dir.replace("../", "frontend/")) + "</b></div>" +
        '<div class="ctx-row"><span>Network</span><b>' + (vision.ready ? "none" : "not required") + "</b></div>" +
      "</div>" +
      (vision.ready
        ? '<p class="small muted" style="margin-top:10px">Landmarks are tracked on the device and drawn on the video. Joint columns appear in the report after a scan.</p>'
        : '<p class="small muted" style="margin-top:10px">Drop <span class="mono">vision_bundle.mjs</span>, <span class="mono">wasm/</span> and ' +
          '<span class="mono">pose_landmarker_lite.task</span> into that folder to enable landmarks and joint angles. ' +
          "Until then the scan reports movement energy only — nothing is simulated.</p>");
  }

  function renderSelf() {
    $("#selfPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Goes into the screen</span><h3 style="margin-top:5px">Self-report</h3></div></div>' +
      '<label class="small muted" for="fatigueRange">Current fatigue</label>' +
      '<div class="slider-row" style="margin-top:6px">' +
        '<input id="fatigueRange" type="range" min="0" max="100" step="1" value="' + (selfFatigue == null ? 40 : selfFatigue) + '">' +
        '<output id="fatigueOut">' + (selfFatigue == null ? "--" : selfFatigue) + "</output>" +
      "</div>" +
      '<label class="small muted" for="sleepInput" style="margin-top:10px;display:block">Sleep last night (h)</label>' +
      '<div class="input-wrap" style="margin-top:6px"><input id="sleepInput" type="number" min="0" max="14" step="0.25" value="' +
        (selfSleep == null ? "" : selfSleep) + '" placeholder="—"></div>' +
      '<p class="small muted" style="margin-top:8px">Both values are yours to enter; the page pre-fills sleep from the last check-in. They are combined with the movement trace, never used alone.</p>';

    const range = $("#fatigueRange");
    range.addEventListener("input", () => {
      selfFatigue = Number(range.value);
      $("#fatigueOut").textContent = range.value;
    });
    const sl = $("#sleepInput");
    sl.addEventListener("change", () => {
      const v = sl.value === "" ? null : Number(sl.value);
      selfSleep = Number.isNaN(v) ? null : v;
    });
  }

  function renderProtocol() {
    const items = [
      "Good, even lighting — avoid a bright window behind you.",
      "Whole body in frame, including feet, for the full sample.",
      "Slow, controlled reps: squats, arm raises, trunk turns.",
      "One person in frame, camera held still.",
      SCAN_SECONDS + " seconds is enough; stop early if you feel pain.",
    ];
    $("#protocolPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Before you scan</span><h3 style="margin-top:5px">Protocol</h3></div></div>' +
      items.map((t) => '<div class="check">' + icon("check") + "<span>" + esc(t) + "</span></div>").join("");
  }

  /* ------------------------------------------------------------------ boot */
  H.ready(() => {
    H.boot(() => {
      $("#dropIcon").innerHTML = icon("scan");
      $("#pickBtn").innerHTML = icon("upload") + "Choose file";
      $("#camBtn").innerHTML = icon("camera") + "Use camera";
      $("#scanBtn").innerHTML = icon("play") + "Start scan";
      $("#uploadBtn").innerHTML = icon("upload") + "Upload";
      $("#cameraBtn").innerHTML = icon("camera") + "Camera";
      $("#resetBtn").innerHTML = icon("refresh") + "Reset";

      const last = H.latest();
      selfSleep = last.sleep_hours == null ? null : last.sleep_hours;
      selfFatigue = last.fatigue_score == null ? null : last.fatigue_score;

      renderProtocol();
      renderSelf();
      renderModel();
      renderResultsPlaceholder();
      $("#modePill").innerHTML = icon("clock") + "<span>Checking model…</span>";

      // choose source
      $("#file").addEventListener("change", (e) => fileChosen(e.target.files && e.target.files[0]));
      $("#pickBtn").addEventListener("click", () => $("#file").click());
      $("#uploadBtn").addEventListener("click", () => $("#file").click());
      $("#camBtn").addEventListener("click", useCamera);
      $("#cameraBtn").addEventListener("click", useCamera);
      $("#scanBtn").addEventListener("click", scan);
      $("#resetBtn").addEventListener("click", reset);

      const stage = $("#stage");
      ["dragenter", "dragover"].forEach((ev) =>
        stage.addEventListener(ev, (e) => { e.preventDefault(); stage.style.borderColor = "var(--cyan)"; })
      );
      ["dragleave", "drop"].forEach((ev) =>
        stage.addEventListener(ev, (e) => { e.preventDefault(); stage.style.borderColor = ""; })
      );
      stage.addEventListener("drop", (e) => {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        fileChosen(f);
      });
      stage.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        if (!src) $("#file").click();
      });

      // the model is probed once; a failure is reported, never hidden
      V.probe().then((st) => {
        vision = st;
        renderModel();
      });

      H.on((what) => { if (what === "mode") H.paintShell(); });
    });
  });
})();
