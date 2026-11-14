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
  function shell(cfg, body) {
    return (
      '<div class="chart-head">' +
        '<div class="grow"><span class="eyebrow">' + esc(cfg.cat) + "</span>" +
          "<h3>" + esc(cfg.title) + '</h3><div class="sub">' + esc(cfg.sub) + "</div></div>" +
        (cfg.current != null
          ? '<div class="chart-stat"><b>' + esc(cfg.current) + "</b><span>" + esc(cfg.currentLabel || "current") + "</span></div>"
          : "") +
      "</div>" + body
    );
  }

  function emptyPanel(cfg, msg) {
    return shell(cfg, '<div class="empty"><b>No readings in this window</b>' + esc(msg) + "</div>");
  }

  function linePanel(cfg, t) {
    const values = col(t, cfg.key);
    if (!values.some((v) => v != null)) return emptyPanel(cfg, "Record this measurement on the health assessment page.");

    const chart = Ch.line({
      labels: labels(t), height: cfg.height || 190, decimals: cfg.decimals,
      series: [{ name: cfg.title, color: cfg.color, values, area: cfg.area }],
      thresholds: cfg.thresholds, band: cfg.band, domain: cfg.domain, title: cfg.title,
    });
    return shell(cfg, '<div id="chart-' + cfg.id + '"></div>' + legend(cfg));
  }

  function legend(cfg) {
    const items = [{ c: cfg.color, l: cfg.title }];
    (cfg.thresholds || []).forEach((th) => items.push({ c: th.color, l: th.label }));
    return '<div class="chart-legend">' + items.map((i) =>
      '<span class="item"><span class="swatch" style="background:' + i.c + '"></span>' + esc(i.l) + "</span>"
    ).join("") + "</div>";
  }

  /* ------------------------------------------------------------ rendering */
  function renderWellness() {
    const t = win();
    const values = t.map((e) => H.compute(e, H.BASE).wellness);
    const chart = Ch.line({
      labels: labels(t), height: 236, decimals: 0, domain: [0, 100],
      series: [{ name: "Wellness", color: COL.cyan, values, area: true }],
      thresholds: [{ value: 70, label: "nominal floor (70)", color: COL.ok }],
      title: "Wellness score progression",
    });
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
    Ch.render($("#chart-w"), chart);
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
        id: "hr", cat: "Cardiovascular", title: "Heart rate", key: "heart_rate", color: COL.cyan, unit: "bpm",
        sub: "Resting rate · " + range + "-day window", decimals: 0,
        current: num(last(col(t, "heart_rate")), 0) + " bpm",
        thresholds: [
          { value: bpSys ? 100 : 100, label: "100 upper", color: COL.warn },
          { value: 50, label: "50 lower", color: COL.warn },
        ],
      },
      {
        id: "bp", cat: "Cardiovascular", title: "Blood pressure", color: COL.blue, unit: "mmHg",
        sub: "Systolic and diastolic · dashed lines are band edges", decimals: 0,
        current: (last(col(t, "blood_pressure_sys")) || "--") + "/" + (last(col(t, "blood_pressure_dia")) || "--"),
        dual: true,
      },
      {
        id: "spo2", cat: "Cardiovascular", title: "Oxygen saturation", key: "spo2", color: COL.ok, unit: "%",
        sub: "Pulse oximetry · amber band is below the 94% warning edge", decimals: 1,
        current: num(last(col(t, "spo2")), 1) + " %",
        thresholds: [{ value: 94, label: "94 warning", color: COL.warn }],
        band: { from: 80, to: 94, color: COL.warn },
        domain: [88, 100],
      },
      {
        id: "sleep", cat: "Psychological", title: "Sleep", key: "sleep_hours", color: COL.violet, unit: "h",
        bars: true, target: 7, targetLabel: "7 h floor",
        sub: "Nightly duration · target line at 7 h", current: num(last(col(t, "sleep_hours")), 1) + " h",
      },
      {
        id: "psych", cat: "Psychological", title: "Stress, mood and fatigue", color: COL.warn, unit: "/100",
        sub: "Self-reported 0-100 scales (higher stress is worse, higher mood is better)", decimals: 0,
        current: num(last(col(t, "stress_score")), 0) + " stress",
        multi: true,
      },
      {
        id: "rad", cat: "Radiation & Immune", title: "Cumulative radiation", key: "radiation_total_msv", color: COL.crit,
        unit: "mSv", area: true, sub: "Career dose accumulating over the mission", decimals: 1,
        current: num(last(col(t, "radiation_total_msv")), 0) + " mSv",
        thresholds: [{ value: 300, label: "300 warning", color: COL.crit }],
      },
      {
        id: "exercise", cat: "Musculoskeletal", title: "Exercise load", key: "exercise_min", color: COL.cyan,
        unit: "min", bars: true, target: 120, targetLabel: "120 min plan",
        sub: "Daily exercise minutes · target line at the 120 min plan",
        current: num(last(col(t, "exercise_min")), 0) + " min",
      },
      {
        id: "sugar", cat: "Nutrition & Metabolic", title: "Blood sugar", key: "blood_sugar", color: COL.violet,
        unit: "mg/dL", sub: "Metabolic reading · band edges at 70 and 140", decimals: 0,
        current: num(last(col(t, "blood_sugar")), 0) + " mg/dL",
        thresholds: [
          { value: 140, label: "140 upper", color: COL.warn },
          { value: 70, label: "70 lower", color: COL.warn },
        ],
      },
      {
        id: "temp", cat: "Radiation & Immune", title: "Body temperature", key: "temperature", color: COL.warn,
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

  function renderGrid() {
    const t = win();
    $("#grid").innerHTML = panelConfigs(t).map((cfg) => {
      if (cfg.dual) {
        const sys = col(t, "blood_pressure_sys"), dia = col(t, "blood_pressure_dia");
        if (!sys.some((v) => v != null) && !dia.some((v) => v != null)) return '<div class="panel">' + emptyPanel(cfg, "No blood pressure readings.") + "</div>";
        const chart = Ch.line({
          labels: labels(t), height: 190, decimals: 0, title: "Blood pressure",
          series: [
            { name: "Systolic", color: COL.blue, values: sys },
            { name: "Diastolic", color: COL.cyan, values: dia },
          ],
          thresholds: [
            { value: 135, label: "135 systolic warn", color: COL.warn },
            { value: 85, label: "85 diastolic warn", color: COL.warn },
          ],
        });
        return '<div class="panel">' + shell(cfg, '<div id="chart-bp"></div>' +
          '<div class="chart-legend"><span class="item"><span class="swatch" style="background:' + COL.blue + '"></span>Systolic</span>' +
          '<span class="item"><span class="swatch" style="background:' + COL.cyan + '"></span>Diastolic</span></div>') + "</div>";
      }

      if (cfg.bars) {
        const values = col(t, cfg.key);
        if (!values.some((v) => v != null)) return '<div class="panel">' + emptyPanel(cfg, "No readings in this window.") + "</div>";
        const chart = Ch.bars({
          labels: labels(t), values, height: 190, color: cfg.color,
          target: cfg.target, targetLabel: cfg.targetLabel, title: cfg.title,
          statusOf: (v) => v < cfg.target,
        });
        return '<div class="panel">' + shell(cfg, '<div id="chart-' + cfg.id + '"></div>' +
          '<div class="chart-legend"><span class="item"><span class="swatch" style="background:' + cfg.color + '"></span>' + esc(cfg.title) + "</span>" +
          '<span class="item"><span class="swatch" style="background:' + COL.warn + '"></span>below target</span></div>') + "</div>";
      }

      if (cfg.multi) {
        const stress = col(t, "stress_score"), mood = col(t, "mood_score"), fatigue = col(t, "fatigue_score");
        if (![stress, mood, fatigue].some((a) => a.some((v) => v != null))) {
          return '<div class="panel">' + emptyPanel(cfg, "No self-report data in this window.") + "</div>";
        }
        const chart = Ch.line({
          labels: labels(t), height: 190, decimals: 0, domain: [0, 100], title: cfg.title,
          series: [
            { name: "Stress", color: COL.warn, values: stress },
            { name: "Mood", color: COL.ok, values: mood },
            { name: "Fatigue", color: COL.crit, values: fatigue },
          ],
          thresholds: [{ value: 60, label: "60 warning", color: COL.warn }],
        });
        return '<div class="panel">' + shell(cfg, '<div id="chart-psych"></div>' +
          '<div class="chart-legend">' +
          '<span class="item"><span class="swatch" style="background:' + COL.warn + '"></span>Stress</span>' +
          '<span class="item"><span class="swatch" style="background:' + COL.ok + '"></span>Mood</span>' +
          '<span class="item"><span class="swatch" style="background:' + COL.crit + '"></span>Fatigue</span>' +
          "</div>") + "</div>";
      }

      return '<div class="panel">' + linePanel(cfg, t) + "</div>";
    }).join("");

    // charts are rendered after the markup exists
    const t2 = t;
    const bp = $("#chart-bp");
    if (bp) {
      Ch.render(bp, Ch.line({
        labels: labels(t2), height: 190, decimals: 0, title: "Blood pressure",
        series: [
          { name: "Systolic", color: COL.blue, values: col(t2, "blood_pressure_sys") },
          { name: "Diastolic", color: COL.cyan, values: col(t2, "blood_pressure_dia") },
        ],
        thresholds: [
          { value: 135, label: "135", color: COL.warn },
          { value: 85, label: "85", color: COL.warn },
        ],
      }));
    }
    panelConfigs(t2).forEach((cfg) => {
      const host = $("#chart-" + cfg.id);
      if (!host) return;
      if (cfg.multi) {
        Ch.render(host, Ch.line({
          labels: labels(t2), height: 190, decimals: 0, domain: [0, 100], title: cfg.title,
          series: [
            { name: "Stress", color: COL.warn, values: col(t2, "stress_score") },
            { name: "Mood", color: COL.ok, values: col(t2, "mood_score") },
            { name: "Fatigue", color: COL.crit, values: col(t2, "fatigue_score") },
          ],
          thresholds: [{ value: 60, label: "60", color: COL.warn }],
        }));
      } else if (cfg.bars) {
        Ch.render(host, Ch.bars({
          labels: labels(t2), values: col(t2, cfg.key), height: 190, color: cfg.color,
          target: cfg.target, targetLabel: cfg.targetLabel, title: cfg.title,
          statusOf: (v) => v < cfg.target,
        }));
      } else if (!cfg.dual) {
        const values = col(t2, cfg.key);
        if (!values.some((v) => v != null)) return;
        Ch.render(host, Ch.line({
          labels: labels(t2), height: 190, decimals: cfg.decimals, series: [{ name: cfg.title, color: cfg.color, values, area: cfg.area }],
          thresholds: cfg.thresholds, band: cfg.band, domain: cfg.domain, title: cfg.title,
        }));
      }
    });
  }

  function renderRecord() {
    const t = H.timeline().slice(-10).reverse();
    $("#recordPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Timeline</span>' +
        '<h3 style="margin-top:5px">Recent measurements</h3></div><span class="spacer"></span>' +
        '<span class="pill ' + (H.state.online ? "is-live" : "is-warn") + '">' +
        icon(H.state.online ? "signal" : "offline") + (H.state.online ? "Live backend" : "Offline record") + "</span></div>" +
      '<div class="timeline">' + t.map((e) => {
        const st = H.compute(e, H.BASE);
        const s = statusOf(st.worst);
        const c = s === "NOMINAL" ? COL.ok : s === "CAUTION" ? COL.warn : COL.crit;
        const flagged = Object.keys(st.indicators).filter((k) => st.indicators[k].status !== "NOMINAL");
        return '<div class="tl-row" style="--c:' + c + '">' +
          '<span class="tl-day">D' + (e.day == null ? "--" : e.day) + "</span>" +
          '<span class="tl-line"><i></i></span>' +
          '<span class="tl-text">' + (flagged.length
            ? esc(flagged.map((k) => st.indicators[k].label).join(", ")) + " outside band"
            : "All logged indicators in band") +
            (e.created_at ? ' · <span class="mono">' + esc(H.fmtDate(e.created_at)) + "</span>" : "") + "</span>" +
          '<span class="tl-val">' + st.wellness + "</span>" +
        "</div>";
      }).join("") + "</div>";
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
      renderAll();
      $("#rangeTabs").addEventListener("click", (e) => {
        const b = e.target.closest("[data-range]");
        if (!b) return;
        range = Number(b.dataset.range);
        renderAll();
      });
      H.on((what) => { if (what === "data" || what === "sync") renderAll(); });
    });
  });
})();
