/* ==========================================================================
   HELM · page: Health Assessment
   Five category panels, live validation against the shared threshold file,
   local-first save with backend sync.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const Ch = window.HELMCharts;
  const { $, $$, esc, num, icon, statusOf, clsOf } = H;

  const colorFor = (st) => ({ NOMINAL: "#35e2a4", CAUTION: "#f7b955", WARNING: "#ff6478" }[st] || "#64748b");
  const SIDE_DIM = {
    NOMINAL: "rgba(53,226,164,.1)", CAUTION: "rgba(247,185,85,.1)", WARNING: "rgba(255,100,120,.1)",
  };

  let activeCat = "cardio";

  /* ---------------------------------------------------------- threshold UI */
  // Display window for the little position gauge. One-sided indicators (sleep,
  // exercise, CO2, stress) get a sensible window around their single band edge.
  function bounds(t) {
    const lows = [t.warning_low, t.critical_low].filter((v) => v != null);
    const highs = [t.warning_high, t.critical_high].filter((v) => v != null);
    let d0, d1;
    if (lows.length && highs.length) {
      const lo = Math.min.apply(null, lows), hi = Math.max.apply(null, highs);
      const span = hi - lo || 1;
      d0 = lo - span * 0.6;
      d1 = hi + span * 0.6;
    } else if (lows.length) {
      const lo = Math.min.apply(null, lows);
      d0 = lo * 0.6;
      d1 = Math.max(lo * 1.5, (t.warning_low != null ? t.warning_low : lo) * 1.35);
    } else if (highs.length) {
      d0 = 0;
      d1 = Math.max.apply(null, highs) * 1.8;
    } else {
      d0 = 0;
      d1 = 100;
    }
    return { dom: [d0, d1] };
  }

  function nominalText(t) {
    const u = t.unit ? " " + t.unit : "";
    if (t.warning_low != null && t.warning_high != null) return "Nominal " + t.warning_low + "–" + t.warning_high + u;
    if (t.warning_low != null) return "Nominal ≥ " + t.warning_low + u;
    if (t.warning_high != null) return "Nominal ≤ " + t.warning_high + u;
    return "";
  }

  // Mini position gauge: red outside the critical band, amber between, green inside.
  function rangeLine(t, value) {
    const dom = bounds(t).dom;
    const d0 = dom[0], d1 = dom[1];
    const p = (v) => Math.max(0, Math.min(100, ((v - d0) / (d1 - d0)) * 100));

    const critLow = t.critical_low != null ? t.critical_low : d0;
    const warnLow = t.warning_low != null ? t.warning_low : d0;
    const warnHigh = t.warning_high != null ? t.warning_high : d1;
    const critHigh = t.critical_high != null ? t.critical_high : d1;

    const bg = "linear-gradient(90deg," +
      "#ff6478 0% " + p(critLow).toFixed(1) + "%," +
      "#f7b955 " + p(critLow).toFixed(1) + "% " + p(warnLow).toFixed(1) + "%," +
      "#35e2a4 " + p(warnLow).toFixed(1) + "% " + p(warnHigh).toFixed(1) + "%," +
      "#f7b955 " + p(warnHigh).toFixed(1) + "% " + p(critHigh).toFixed(1) + "%," +
      "#ff6478 " + p(critHigh).toFixed(1) + "% 100%)";

    const marker = value == null ? "" : '<s style="left:' + p(value).toFixed(1) + '%"></s>';
    return '<div class="range-line" aria-hidden="true" style="background:' + bg + '">' + marker + "</div>";
  }

  function fieldHTML(key) {
    const t = H.THRESHOLDS[key];
    if (!t) return "";
    const dom = bounds(t).dom;
    const step = t.unit === "" ? "1" : "0.1";
    // a few labels already carry their unit ("… partial pressure (kPa)")
    const unitShown = t.unit && String(t.label).indexOf("(" + t.unit + ")") === -1;
    return (
      '<div class="field" data-key="' + key + '">' +
        '<label for="f-' + key + '">' + esc(t.label) +
          (unitShown ? ' <span class="unit">' + esc(t.unit) + "</span>" : "") +
        "</label>" +
        '<div class="input-wrap"><input id="f-' + key + '" name="' + key + '" type="number" step="' + step +
          '" inputmode="decimal" min="' + dom[0].toFixed(1) + '" max="' + dom[1].toFixed(1) +
          '" placeholder="—" autocomplete="off" aria-describedby="h-' + key + '"></div>' +
        rangeLine(t, null) +
        '<div class="hint" id="h-' + key + '"><span>' + esc(nominalText(t)) + '</span><span class="st"></span></div>' +
      "</div>"
    );
  }

  /* --------------------------------------------------------------- markup */
  function renderTabs() {
    $("#tabs").innerHTML = H.CATEGORIES.map((c, i) =>
      '<button class="cat-tab' + (c.id === activeCat ? " on" : "") + '" type="button" role="tab" data-cat="' + c.id +
      '" aria-selected="' + (c.id === activeCat) + '" id="tab-' + c.id + '">' +
        icon(c.icon) + "<span>" + esc(c.name) + '</span><span class="n">' + (i + 1) + "</span>" +
      "</button>"
    ).join("");
  }

  function panelHTML(c) {
    const fields = c.keys.map(fieldHTML).join("");
    const env = (c.env || []).map(fieldHTML).join("");
    const missing = (c.notInstrumented || []).map(([name, why]) =>
      '<div class="not-instrumented">' + icon("info") +
      "<div><b>" + esc(name) + "</b><br>" + esc(why) + "</div></div>"
    ).join("");

    return (
      '<section class="cat-panel' + (c.id === activeCat ? " on" : "") + '" id="panel-' + c.id + '" role="tabpanel" aria-labelledby="tab-' + c.id + '">' +
        '<div class="cat-panel-head">' +
          '<div class="grow"><h2>' + esc(c.name) + "</h2><p>" + esc(c.blurb) + "</p></div>" +
          '<span class="badge">' + icon(c.icon) + esc(c.short) + "</span>" +
        "</div>" +
        '<div class="form-grid">' + fields + "</div>" +
        (env ? '<div class="form-section"><div class="form-section-title">' + icon("shield") + "Cabin environment · life support</div>" +
          '<div class="form-grid">' + env + "</div></div>" : "") +
        (c.id === "musculo" ? '<div class="form-section"><div class="form-section-title">' + icon("scan") + 'Movement scan</div>' +
          '<p class="small muted">The physical assessment page records a movement sample and derives a mobility index from it when a local pose model is installed. That index is shown there and kept with the scan, not re-scored here.</p>' +
          '<a class="btn btn-sm btn-ghost" href="physical.html" style="margin-top:8px">' + icon("scan") + "Open physical scan</a></div>" : "") +
        (missing ? '<div class="form-section"><div class="form-section-title">' + icon("lock") + "Not instrumented yet</div>" +
          '<div style="display:flex;flex-direction:column;gap:8px">' + missing + "</div></div>" : "") +
      "</section>"
    );
  }

  function renderPanels() {
    $("#panels").innerHTML = H.CATEGORIES.map(panelHTML).join("");
  }

  /* -------------------------------------------------------------- preview */
  function collectVitals() {
    const vitals = {};
    $$("#assessForm input[name]").forEach((el) => {
      if (el.value === "" || el.value == null) return;
      const v = Number(el.value);
      if (!Number.isNaN(v)) vitals[el.name] = v;
    });
    return vitals;
  }

  function previewStatus() {
    const entered = collectVitals();
    // start from the last recorded check-in so a partial form still previews
    const base = Object.assign({}, H.latest());
    delete base.day;
    delete base.created_at;
    const merged = Object.assign(base, entered);
    merged.distance_from_earth_km = H.MODES[H.state.mode].km;
    return { status: H.compute(merged, H.BASE), entered: entered, merged: merged };
  }

  function renderPreview() {
    const { status, entered } = previewStatus();
    const s = statusOf(status.worst);
    const count = Object.keys(entered).length;
    const nextDay = (H.timeline().slice(-1)[0] || {}).day || 30;

    $("#preview").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Live preview</span>' +
        '<h3 style="margin-top:5px">Projected wellness</h3></div><span class="spacer"></span>' +
        '<span class="badge ' + clsOf(s) + '">' + esc(s) + "</span></div>" +
      '<div style="display:flex;justify-content:center;padding:4px 0 8px">' +
        Ch.ring(status.wellness, { size: 150, label: "WELLNESS", color: colorFor(s) }) + "</div>" +
      '<p class="small muted" style="text-align:center">Fields left empty reuse your last recorded values, so the preview is a projection, not a measurement.</p>' +
      '<div class="sys-bars" style="margin-top:10px">' +
        Object.keys(H.SYS).map((sid) => {
          const sys = status.systems[sid];
          const sc = sys && sys.score;
          const c = sys ? colorFor(sys.status) : "#64748b";
          return '<div class="sys-bar" style="--c:' + c + '"><span>' + esc(H.SYS[sid].label) + "</span>" +
            '<span class="track"><i style="width:' + (sc == null ? 0 : sc) + '%"></i></span>' +
            '<span class="v">' + (sc == null ? "--" : sc) + "</span></div>";
        }).join("") +
      "</div>" +
      '<div class="chips" style="margin-top:12px">' +
        '<span class="chip">' + icon("file") + "<b>" + count + "</b> fields filled</span>" +
        '<span class="chip">' + icon("clock") + "records day <b>" + (nextDay + 1) + "</b></span>" +
      "</div>";

    $("#formMeta").textContent = count + " field" + (count === 1 ? "" : "s") + " filled";
    renderFlags(status);
  }

  function renderFlags(status) {
    const flagged = Object.keys(status.indicators)
      .filter((k) => status.indicators[k].status !== "NOMINAL")
      .sort((a, b) => status.indicators[a].score - status.indicators[b].score);

    $("#flags").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Threshold check</span>' +
        '<h3 style="margin-top:5px">Flagged readings</h3></div><span class="spacer"></span>' +
        '<span class="pill">' + flagged.length + "</span></div>" +
      (flagged.length
        ? '<div class="flag-list">' + flagged.map((k) => {
            const i = status.indicators[k];
            return '<div class="flag ' + clsOf(i.status) + '">' + icon("alert") +
              "<span>" + esc(i.label) + "</span>" +
              '<span class="v">' + num(i.value) + " " + esc(i.unit || "") + "</span></div>";
          }).join("") + "</div>"
        : '<div class="empty"><b>Nothing flagged</b>Every reading with a value is inside its band.</div>') +
      '<p class="small muted" style="margin-top:10px">Bands come from <span class="mono">medical_thresholds.json</span>. ' +
      "Drift of 20% or more from your own baseline also caps a score.</p>";
  }

  /* ------------------------------------------------------------- validate */
  function validateField(el) {
    const key = el.name;
    const t = H.THRESHOLDS[key];
    const wrap = el.closest(".field");
    const st = wrap.querySelector(".st");
    const line = wrap.querySelector(".range-line s");
    wrap.classList.remove("is-caution", "is-warning");
    if (el.value === "" || el.value == null) {
      st.textContent = "";
      if (line) line.style.display = "none";
      return;
    }
    const v = Number(el.value);
    if (Number.isNaN(v)) {
      st.textContent = "invalid";
      wrap.classList.add("is-warning");
      return;
    }

    const sc = H.compute({ [key]: v }, null).indicators[key];
    const status = sc ? sc.status : "NO DATA";
    st.textContent = status === "NOMINAL" ? "in band" : status.toLowerCase();
    st.style.color = status === "NOMINAL" ? "var(--ok)" : status === "CAUTION" ? "var(--warn)" : "var(--crit)";
    if (status === "CAUTION") wrap.classList.add("is-caution");
    if (status === "WARNING") wrap.classList.add("is-warning");

    if (line) {
      const b = bounds(t);
      const [d0, d1] = b.dom;
      const pct = Math.max(0, Math.min(100, ((v - d0) / (d1 - d0)) * 100));
      line.style.display = "block";
      line.style.left = pct.toFixed(1) + "%";
    }
  }

  function validateAll() {
    let ok = true;
    $$("#assessForm input[name]").forEach((el) => {
      if (el.value === "") return;
      const t = H.THRESHOLDS[el.name];
      if (!t) return;
      const v = Number(el.value);
      const dom = bounds(t).dom;
      if (Number.isNaN(v) || v < dom[0] || v > dom[1]) {
        ok = false;
        const f = el.closest(".field");
        f.classList.add("is-warning");
        const st = f.querySelector(".st");
        if (st) { st.textContent = "out of range"; st.style.color = "var(--crit)"; }
      }
    });
    return ok;
  }

  /* ----------------------------------------------------------------- save */
  function save(e) {
    e.preventDefault();
    const entered = collectVitals();
    if (!Object.keys(entered).length) {
      H.toast("Enter at least one measurement before saving.", "warn");
      return;
    }
    if (!validateAll()) {
      H.toast("Some values are outside the plausible range for that indicator.", "crit");
      return;
    }

    const t = H.timeline();
    const last = t[t.length - 1] || {};
    const day = (last.day || 30) + 1;
    const entry = Object.assign({ day: day, created_at: new Date().toISOString(), _local: true }, entered, {
      distance_from_earth_km: H.MODES[H.state.mode].km,
    });

    const before = H.compute(last, H.BASE);
    const status = H.compute(entry, H.BASE);
    H.saveLocal(entry);
    H.toast("Check-in saved to the offline record.", "ok");

    H.sync().then((res) => {
      if (res && res.pushed) H.toast("Synced " + res.pushed + " check-in to the backend.", "ok");
      else if (res && res.deferred) H.toast(res.deferred + " check-in waiting for the backend link.", "warn");
    });

    renderResult(entry, status, before);

    // clear the form for the next entry
    $("#assessForm").reset();
    $$("#assessForm input").forEach((el) => {
      const st = el.closest(".field").querySelector(".st");
      if (st) st.textContent = "";
      el.closest(".field").classList.remove("is-caution", "is-warning");
      const line = el.closest(".field").querySelector(".range-line s");
      if (line) line.style.display = "none";
    });
    renderPreview();
  }

  function renderResult(entry, status, before) {
    const s = statusOf(status.worst);
    const delta = status.wellness - before.wellness;
    const flagged = Object.keys(status.indicators).filter((k) => status.indicators[k].status !== "NOMINAL");
    const first = flagged.length ? flagged[0] : null;

    $("#result").innerHTML =
      '<div class="panel result-card rise" style="margin-top:14px">' +
        '<div class="panel-head"><div><span class="eyebrow">Saved · day ' + entry.day + "</span>" +
          '<h3 style="margin-top:5px">Assessment recorded</h3></div><span class="spacer"></span>' +
          '<span class="badge ' + clsOf(s) + '">' + esc(s) + "</span></div>" +
        '<div class="result-banner" style="--c:' + colorFor(s) + ";--c-dim:" + SIDE_DIM[s] + '">' +
          "<b>Wellness " + status.wellness + "/100</b>" +
          "<span>" + (delta === 0 ? "Unchanged from the previous check-in."
            : (delta > 0 ? "+" : "") + delta + " points versus the previous check-in.") +
          " Autonomy " + status.autonomy + "/100 · signal delay " + H.fmtDelay(status.signal_delay_s) + " one way.</span>" +
        "</div>" +
        (flagged.length
          ? '<div class="flag-list">' + flagged.map((k) => {
              const i = status.indicators[k];
              return '<div class="flag ' + clsOf(i.status) + '">' + icon("alert") + "<span>" + esc(i.label) +
                '</span><span class="v">' + num(i.value) + " " + esc(i.unit || "") + "</span></div>";
            }).join("") + "</div>"
          : '<p class="small muted">No reading is outside its band. Keep your routine.</p>') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' +
          '<a class="btn btn-sm btn-primary" href="assistant.html' +
            (first ? "?q=" + encodeURIComponent("Why is my " + status.indicators[first].label + " flagged?") : "") + '">' +
            icon("brain") + "Explain this with the AI assistant</a>" +
          '<a class="btn btn-sm btn-ghost" href="analytics.html">' + icon("chart") + "Compare with history</a>" +
          '<a class="btn btn-sm btn-ghost" href="physical.html">' + icon("scan") + "Run a movement scan</a>"
        "</div>" +
      "</div>";

    $("#result").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------------------------------------------------------------- wiring */
  function selectCat(id) {
    if (!H.CATEGORIES.some((c) => c.id === id)) id = "cardio";
    activeCat = id;
    $$(".cat-tab").forEach((b) => {
      const on = b.dataset.cat === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on);
    });
    $$(".cat-panel").forEach((p) => p.classList.toggle("on", p.id === "panel-" + id));
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  }

  function bind() {
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (b) selectCat(b.dataset.cat);
    });
    $("#assessForm").addEventListener("input", (e) => {
      if (e.target.name) validateField(e.target);
      renderPreview();
    });
    $("#assessForm").addEventListener("submit", save);
    $("#assessForm").addEventListener("reset", () => {
      setTimeout(renderPreview, 0);
      const r = $("#result");
      if (r) r.innerHTML = "";
    });
  }

  H.ready(() => {
    H.boot(() => {
      const hash = (location.hash || "").replace("#", "");
      if (hash) activeCat = hash;
      renderTabs();
      renderPanels();
      bind();
      renderPreview();
      selectCat(activeCat);
    });
  });
})();
