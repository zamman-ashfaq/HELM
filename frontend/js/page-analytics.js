/* ==========================================================================
   HELM · page: Health Analytics
   Every chart is driven by the recorded timeline (demo profile + local
   check-ins + backend rows). No synthetic points are added.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const Ch = window.HELMCharts;
  const { $, esc, num, icon, statusOf, clsOf } = H;

  const COL = { cyan: "#22d3ee", blue: "#3b82f6", violet: "#8b7dff", ok: "#35e2a4", warn: "#f7b955", crit: "#ff6478" };
  const RANGES = [
    { id: 7, label: "7 d" }, { id: 14, label: "14 d" }, { id: 30, label: "30 d" }, { id: 0, label: "All" },
  ];
  let range = 14;

  // The nine vital charts, grouped into the five scored domains.
  const DOMAINS = [
    { id: "cardio", label: "Cardiovascular", ids: ["hr", "bp", "spo2"] },
    { id: "musculo", label: "Musculoskeletal", ids: ["exercise"] },
    { id: "rad", label: "Radiation & Immune", ids: ["rad", "temp"] },
    { id: "nutri", label: "Nutrition & Metabolic", ids: ["sugar"] },
    { id: "psych", label: "Psychological", ids: ["sleep", "psych"] },
  ];
  const DOM_KEY = "helm.analytics.domain";
  let domain = DOMAINS[0].id;

  function readDomain() {
    try {
      const v = sessionStorage.getItem(DOM_KEY);
      return DOMAINS.some((d) => d.id === v) ? v : DOMAINS[0].id;
    } catch (e) {
      return DOMAINS[0].id;
    }
  }
  function saveDomain(id) {
    try { sessionStorage.setItem(DOM_KEY, id); } catch (e) { /* storage blocked */ }
  }

  const win = () => {
    const t = H.timeline();
    return range ? t.slice(-range) : t;
  };
  const labels = (t) => t.map((e) => "D" + (e.day == null ? "?" : e.day));
  const col = (t, key) => t.map((e) => (e[key] == null ? null : e[key]));

  function avg(a) {
    const v = a.filter((x) => x != null);
    return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
  }
  function last(a) {
    for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return a[i];
    return null;
  }

  /* --------------------------------------------------------------- header */
  function renderRangeTabs() {
    $("#rangeTabs").innerHTML = RANGES.map((r) =>
      '<button type="button" data-range="' + r.id + '" class="' + (r.id === range ? "on" : "") + '">' + r.label + "</button>"
    ).join("");
  }

  /* --------------------------------------------------------------- panels */
  // Card head: title + current value only. The old category eyebrow and grey
  // subtitle are gone; the subtitle lives on in the card tooltip.
  function head(cfg) {
    return '<div class="chart-head">' +
      '<div class="grow"><h3>' + esc(cfg.title) + "</h3></div>" +
      (cfg.current != null
        ? '<div class="chart-stat"><b>' + esc(cfg.current) + '</b><span>current</span></div>'
        : "") +
    "</div>";
  }

  function card(cfg, body) {
    return '<article class="panel chart-card" title="' + esc(cfg.sub) + '">' + head(cfg) + body + "</article>";
  }

  function emptyCard(cfg) {
    return card(cfg, '<div class="empty"><b>No readings in this window</b>Record this measurement on the health assessment page.</div>');
  }

  // A legend is only useful when the chart draws more than one line.
  function legendHTML(items) {
    if (!items || items.length < 2) return "";
    return '<div class="chart-legend">' + items.map((i) =>
      '<span class="item"><span class="swatch" style="background:' + i.color + '"></span>' + esc(i.name) + "</span>"
    ).join("") + "</div>";
  }

  // Builds the chart for one card; null when the window has no readings.
  function buildChart(cfg, t, width) {
    if (cfg.dual) {
      const sys = col(t, "blood_pressure_sys"), dia = col(t, "blood_pressure_dia");
      if (!sys.some((v) => v != null) && !dia.some((v) => v != null)) return null;
      return {
        chart: Ch.line({
          width: width, labels: labels(t), height: 190, decimals: 0, title: cfg.title,
          series: [
            { name: "Systolic", color: COL.blue, values: sys },
            { name: "Diastolic", color: COL.cyan, values: dia },
          ],
          thresholds: [
            { value: 135, label: "135 systolic warn", color: COL.warn },
            { value: 85, label: "85 diastolic warn", color: COL.warn },
          ],
        }),
        legend: legendHTML([
          { name: "Systolic", color: COL.blue },
          { name: "Diastolic", color: COL.cyan },
        ]),
      };
    }

    if (cfg.bars) {
      const values = col(t, cfg.key);
      if (!values.some((v) => v != null)) return null;
      return {
        chart: Ch.bars({
          width: width, labels: labels(t), values, height: 190, color: cfg.color,
          target: cfg.target, targetLabel: cfg.targetLabel, title: cfg.title,
          statusOf: (v) => v < cfg.target,
        }),
        legend: "",
      };
    }

    if (cfg.multi) {
      const stress = col(t, "stress_score"), mood = col(t, "mood_score"), fatigue = col(t, "fatigue_score");
      if (![stress, mood, fatigue].some((a) => a.some((v) => v != null))) return null;
      return {
        chart: Ch.line({
          width: width, labels: labels(t), height: 190, decimals: 0, domain: [0, 100], title: cfg.title,
          series: [
            { name: "Stress", color: COL.warn, values: stress },
            { name: "Mood", color: COL.ok, values: mood },
            { name: "Fatigue", color: COL.crit, values: fatigue },
          ],
          thresholds: [{ value: 60, label: "60 warning", color: COL.warn }],
        }),
        legend: legendHTML([
          { name: "Stress", color: COL.warn },
          { name: "Mood", color: COL.ok },
          { name: "Fatigue", color: COL.crit },
        ]),
      };
    }

    const values = col(t, cfg.key);
    if (!values.some((v) => v != null)) return null;
    return {
      chart: Ch.line({
        width: width, labels: labels(t), height: 190, decimals: cfg.decimals,
        series: [{ name: cfg.title, color: cfg.color, values, area: cfg.area }],
        thresholds: cfg.thresholds, band: cfg.band, domain: cfg.domain, title: cfg.title,
      }),
      legend: "",
    };
  }

  /* ------------------------------------------------------------ rendering */
  function renderWellness() {
    const t = win();
    const values = t.map((e) => H.compute(e, H.BASE).wellness);
    const first = values[0], lastV = values[values.length - 1];
    const diff = first == null || lastV == null ? null : lastV - first;
    const worst = Math.min.apply(null, values);

    $("#wellPanel").innerHTML =
      '<div class="chart-head"><div class="grow">' +
        '<span class="eyebrow">Mission profile</span>' +
        '<h3 style="margin-top:5px">Wellness score progression</h3>' +
        '<div class="sub">' + range + "-day window · mean of the five domain scores</div></div>" +
        '<div class="chart-stat"><b>' + lastV + "</b><span>" +
          (diff == null ? "no trend" : (diff > 0 ? "+" : "") + diff + " pts") + "</span></div></div>" +
      '<div id="chart-w"></div>' +
      '<div class="chips" style="margin-top:10px">' +
        '<span class="chip">Peak low <b>' + worst + "</b></span>" +
        '<span class="chip">Mean <b>' + Math.round(avg(values)) + "</b></span>" +
        '<span class="chip">Days recorded <b>' + t.length + "</b></span>" +
        '<span class="chip ' + (lastV >= 70 ? "is-ok" : "is-warn") + '">' + icon(lastV >= 70 ? "check" : "alert") +
          (lastV >= 70 ? "Above floor" : "Below floor") + "</span>" +
      "</div>";
    const host = $("#chart-w");
    const w = Math.round(host.clientWidth) || 760;
    Ch.render(host, Ch.line({
      width: Math.max(320, w), labels: labels(t), height: 236, decimals: 0, domain: [0, 100],
      series: [{ name: "Wellness", color: COL.cyan, values, area: true }],
      thresholds: [{ value: 70, label: "nominal floor (70)", color: COL.ok }],
      title: "Wellness score progression",
    }));
  }

  function renderChanges() {
    const t = H.timeline();
    const cur = t.slice(-7);
    const prev = t.slice(-14, -7);
    const keys = Object.keys(H.THRESHOLDS);

    const rows = keys.map((k) => {
      const a = avg(prev.map((e) => e[k]));
      const b = avg(cur.map((e) => e[k]));
      if (a == null || b == null || a === 0) return null;
      const pct = ((b - a) / a) * 100;
      return { k, label: H.THRESHOLDS[k].label, unit: H.THRESHOLDS[k].unit, a, b, pct };
    }).filter(Boolean)
      .filter((r) => Math.abs(r.pct) >= 5)
      .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct))
      .slice(0, 6);

    $("#changePanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Last 7 vs previous 7 days</span>' +
        '<h3 style="margin-top:5px">Meaningful changes</h3></div></div>' +
      (rows.length
        ? rows.map((r) => {
            const dir = Math.abs(r.pct) < 5 ? "flat" : r.pct > 0 ? "up" : "down";
            return '<div class="change-row">' +
              '<span class="name">' + esc(r.label) + "</span>" +
              '<span class="arrow">' + num(r.a, 1) + " → " + num(r.b, 1) + "</span>" +
              '<span class="pct ' + dir + '">' + (r.pct > 0 ? "+" : "") + num(r.pct, 0) + "%</span>" +
            "</div>";
          }).join("")
        : '<div class="empty"><b>No material change</b>Seven-day averages are within 5% of the previous week.</div>') +
      '<p class="small muted" style="margin-top:10px">A drift of 20% or more from your own baseline also caps that indicator\'s score, exactly as <span class="mono">score.py</span> does.</p>';
  }

  function panelConfigs(t) {
    const T = H.THRESHOLDS;
    const bpSys = T.blood_pressure_sys, bpDia = T.blood_pressure_dia;
    return [
      {
        id: "hr", title: "Heart rate", key: "heart_rate", color: COL.cyan, unit: "bpm",
        sub: "Resting rate · " + range + "-day window", decimals: 0,
        current: num(last(col(t, "heart_rate")), 0) + " bpm",
        thresholds: [
          { value: bpSys ? 100 : 100, label: "100 upper", color: COL.warn },
          { value: 50, label: "50 lower", color: COL.warn },
        ],
      },
      {
        id: "bp", title: "Blood pressure", color: COL.blue, unit: "mmHg",
        sub: "Systolic and diastolic · dashed lines are band edges", decimals: 0,
        current: (last(col(t, "blood_pressure_sys")) || "--") + "/" + (last(col(t, "blood_pressure_dia")) || "--"),
        dual: true,
      },
      {
        id: "spo2", title: "Oxygen saturation", key: "spo2", color: COL.ok, unit: "%",
        sub: "Pulse oximetry · amber band is below the 94% warning edge", decimals: 1,
        current: num(last(col(t, "spo2")), 1) + " %",
        thresholds: [{ value: 94, label: "94 warning", color: COL.warn }],
        band: { from: 80, to: 94, color: COL.warn },
        domain: [88, 100],
      },
      {
        id: "sleep", title: "Sleep", key: "sleep_hours", color: COL.violet, unit: "h",
        bars: true, target: 7, targetLabel: "7 h floor",
        sub: "Nightly duration · target line at 7 h", current: num(last(col(t, "sleep_hours")), 1) + " h",
      },
      {
        id: "psych", title: "Stress, mood and fatigue", color: COL.warn, unit: "/100",
        sub: "Self-reported scales: higher stress is worse, higher mood is better", decimals: 0,
        current: num(last(col(t, "stress_score")), 0) + " stress",
        multi: true,
      },
      {
        id: "rad", title: "Cumulative radiation", key: "radiation_total_msv", color: COL.crit,
        unit: "mSv", area: true, sub: "Career dose accumulating over the mission", decimals: 1,
        current: num(last(col(t, "radiation_total_msv")), 0) + " mSv",
        thresholds: [{ value: 300, label: "300 warning", color: COL.crit }],
      },
      {
        id: "exercise", title: "Exercise load", key: "exercise_min", color: COL.cyan,
        unit: "min", bars: true, target: 120, targetLabel: "120 min plan",
        sub: "Daily exercise minutes · target line at the 120 min plan",
        current: num(last(col(t, "exercise_min")), 0) + " min",
      },
      {
        id: "sugar", title: "Blood sugar", key: "blood_sugar", color: COL.violet,
        unit: "mg/dL", sub: "Metabolic reading · band edges at 70 and 140", decimals: 0,
        current: num(last(col(t, "blood_sugar")), 0) + " mg/dL",
        thresholds: [
          { value: 140, label: "140 upper", color: COL.warn },
          { value: 70, label: "70 lower", color: COL.warn },
        ],
      },
      {
        id: "temp", title: "Body temperature", key: "temperature", color: COL.warn,
        unit: "°C", sub: "Immune signal · 37.5 and 38.0 °C edges", decimals: 1,
        current: num(last(col(t, "temperature")), 1) + " °C",
        thresholds: [
          { value: 37.5, label: "37.5 warning", color: COL.warn },
          { value: 38, label: "38.0 critical", color: COL.crit },
        ],
        domain: [35, 39.5],
      },
    ];
  }

  /* --------------------------------------------------------------- domain tabs */
  function renderDomainTabs() {
    const host = $("#domTabs");
    if (!host) return;
    host.innerHTML = DOMAINS.map((d) =>
      '<button type="button" class="dom-tab' + (d.id === domain ? " on" : "") + '" role="tab"' +
        ' id="tab-' + d.id + '" data-domain="' + d.id + '" aria-controls="grid"' +
        ' aria-selected="' + (d.id === domain ? "true" : "false") + '"' +
        ' tabindex="' + (d.id === domain ? "0" : "-1") + '">' + esc(d.label) + "</button>"
    ).join("");
    const panel = $("#grid");
    if (panel) panel.setAttribute("aria-labelledby", "tab-" + domain);
  }

  function selectDomain(id) {
    if (!DOMAINS.some((d) => d.id === id)) return;
    domain = id;
    saveDomain(id);
    Array.prototype.forEach.call(document.querySelectorAll("#domTabs .dom-tab"), (b) => {
      const on = b.dataset.domain === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    const panel = $("#grid");
    if (panel) panel.setAttribute("aria-labelledby", "tab-" + id);
    renderGrid();
  }

  // Arrow keys, Home and End move between tabs, as a tablist should.
  function onTabKey(e) {
    if (["ArrowRight", "ArrowLeft", "Home", "End"].indexOf(e.key) < 0) return;
    const tabs = Array.prototype.slice.call(document.querySelectorAll("#domTabs .dom-tab"));
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else n = tabs.length - 1;
    selectDomain(tabs[n].dataset.domain);
    tabs[n].focus();
  }

  // Only the active domain is drawn: no empty slots and no hidden charts.
  function renderGrid() {
    const t = win();
    const all = panelConfigs(t);
    const dom = DOMAINS.filter((d) => d.id === domain)[0] || DOMAINS[0];
    const cfgs = dom.ids.map((id) => all.filter((c) => c.id === id)[0]).filter(Boolean);
    const pending = [];

    $("#grid").innerHTML = cfgs.map((cfg) => {
      const built = buildChart(cfg, t);
      if (!built) return emptyCard(cfg);
      pending.push({ id: cfg.id, cfg: cfg });
      return card(cfg, '<div class="chart-body" id="chart-' + cfg.id + '"></div>' + built.legend);
    }).join("");

    // Drawn once the markup exists, at the card's real pixel width, so the axis
    // captions keep their declared size inside a 2- or 3-column grid.
    pending.forEach((p) => {
      const host = $("#chart-" + p.id);
      if (!host) return;
      const w = Math.round(host.clientWidth) || 760;
      const built = buildChart(p.cfg, t, Math.max(280, w));
      if (built) Ch.render(host, built.chart);
    });
  }

  let recordAll = false;

  function renderRecord() {
    const rows = H.timeline().slice().reverse();
    const list = recordAll ? rows : rows.slice(0, 5);
    // Narrow phones fit one chip beside the count; wider screens fit three.
    const maxChips = window.innerWidth <= 560 ? 1 : 3;

    $("#recordPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Timeline</span>' +
        '<h3 style="margin-top:5px">Recent measurements</h3></div><span class="spacer"></span>' +
        (rows.length > 5
          ? '<button type="button" class="btn btn-sm btn-ghost" id="recordToggle" aria-expanded="' + recordAll + '">' +
            (recordAll ? "Show last 5" : "Show all " + rows.length) + "</button>"
          : "") +
      "</div>" +
      '<div class="timeline">' + list.map((e) => {
        const st = H.compute(e, H.BASE);
        const s = statusOf(st.worst);
        const c = s === "NOMINAL" ? COL.ok : s === "CAUTION" ? COL.warn : COL.crit;
        const flagged = Object.keys(st.indicators).filter((k) => st.indicators[k].status !== "NOMINAL");
        const names = flagged.map((k) => st.indicators[k].label);
        return '<div class="tl-row" style="--c:' + c + '">' +
          '<span class="tl-day">D' + (e.day == null ? "--" : e.day) + "</span>" +
          '<span class="tl-score"><b>' + st.wellness + "</b>/100</span>" +
          '<span class="tl-flag">' + (flagged.length ? flagged.length + " flagged" : "no flags") + "</span>" +
          '<span class="tl-chips">' + names.slice(0, maxChips).map((n) => '<span class="chip">' + esc(n) + "</span>").join("") +
            (names.length > maxChips ? '<span class="chip">+' + (names.length - maxChips) + "</span>" : "") + "</span>" +
        "</div>";
      }).join("") + "</div>";

    const toggle = $("#recordToggle");
    if (toggle) toggle.addEventListener("click", () => { recordAll = !recordAll; renderRecord(); });
  }

  function renderAll() {
    renderRangeTabs();
    renderWellness();
    renderChanges();
    renderGrid();
    renderRecord();
    $("#srcFoot").textContent = "Source: " + (H.timeline().length) + " recorded days · " +
      (H.state.online ? "backend + local device" : "local device only");
  }

  H.ready(() => {
    H.boot(() => {
      domain = readDomain();
      renderDomainTabs();
      renderAll();
      $("#rangeTabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-range]");
        if (!b) return;
        range = Number(b.dataset.range);
        renderAll();
      });
      const tabs = $("#domTabs");
      tabs.addEventListener("click", (e) => {
        const b = e.target.closest("[data-domain]");
        if (!b) return;
        selectDomain(b.dataset.domain);
      });
      tabs.addEventListener("keydown", onTabKey);
      // Charts are drawn at their pixel width, so redraw when that width changes.
      let rz = 0;
      window.addEventListener("resize", () => {
        clearTimeout(rz);
        rz = setTimeout(renderAll, 200);
      });
      H.on((what) => { if (what === "data" || what === "sync" || what === "mode") renderAll(); });
    });
  });
})();
