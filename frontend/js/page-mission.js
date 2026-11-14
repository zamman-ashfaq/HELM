/* ==========================================================================
   HELM · page: Mission Control
   Hero + live vitals + wellness/autonomy + the five health domains.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const Ch = window.HELMCharts;
  const { $, esc, num, icon, statusOf, clsOf, fmtDelay, MODES } = H;

  const colorFor = (st) => ({ NOMINAL: "#35e2a4", CAUTION: "#f7b955", WARNING: "#ff6478" }[st] || "#64748b");
  let view = null; // index into the timeline; null = newest day

  /* --------------------------------------------------------------- advice */
  // Ported from the original panel: the same three distance profiles and text.
  function adviceFor(st, mode) {
    const s = statusOf(st.worst);
    const m = Math.max(1, Math.round(st.signal_delay_s / 60));
    const A = {
      iss: {
        WARNING: "Contact the flight surgeon now. Pause strenuous work and recheck the flagged readings.",
        CAUTION: "Recheck the flagged readings and log them for your next ground call.",
        NOMINAL: "All systems nominal. Keep up your daily routine.",
      },
      moon: {
        WARNING: "Call Earth now. The signal takes about 1.3 seconds, so a live conversation is possible. Follow your mission medical protocol.",
        CAUTION: "Follow the self-care steps for the flagged systems and mention them on your next call.",
        NOMINAL: "All systems nominal. Keep up your daily routine.",
      },
      mars: {
        WARNING: "Start your mission medical protocol first. A report is queued for Earth: it arrives in about " + m +
          " min and a reply takes about " + 2 * m + " min.",
        CAUTION: "Follow the self-care steps for the flagged systems and add them to your next report to Earth.",
        NOMINAL: "All systems nominal. Keep up your daily routine.",
      },
    };
    return [s, (A[mode] || A.mars)[s] || A.mars.NOMINAL];
  }

  const autonomyLabel = (a) => (a < 35 ? "Self-manageable" : a <= 65 ? "Monitor and report" : "Act now, inform Earth");

  /* ---------------------------------------------------------------- parts */
  function chip(label, value) {
    return '<span class="chip">' + label + (value != null ? " <b>" + esc(value) + "</b>" : "") + "</span>";
  }

  function renderChips(st, cur) {
    const mode = H.state.mode;
    const m = MODES[mode];
    const host = $("#missionChips");
    if (!host) return;
    host.innerHTML =
      chip("Crew", "B") +
      chip("Astronaut", H.DEMO.astronaut) +
      chip("Mission day", cur.day != null ? cur.day : "--") +
      chip(m.note, Math.round(m.km / 1e6) + " M km") +
      chip("Signal", fmtDelay(H.delaySeconds(m.km)) + " one way") +
      chip("Crew status", statusOf(st.worst));
  }

  function sparkFor(t, key, n) {
    return t.slice(-n).map((r) => (r[key] == null ? null : r[key]));
  }

  function metricCard(o) {
    const cls = clsOf(o.status);
    const spark = Ch.spark(o.spark || [], { w: 150, h: 26, color: o.color || "currentColor" });
    return (
      '<article class="metric ' + cls + '">' +
        '<div class="metric-label">' + icon(o.icon) + esc(o.label) + "</div>" +
        '<div class="metric-value"><strong>' + esc(o.value) + "</strong>" +
          (o.unit ? "<span>" + esc(o.unit) + "</span>" : "") + "</div>" +
        spark +
        '<div class="metric-foot">' +
          '<span class="delta">' + (o.delta || "") + "</span>" +
          '<span class="badge ' + cls + '">' + esc(o.status) + "</span>" +
        "</div>" +
      "</article>"
    );
  }

  function deltaText(cur, prev, unit) {
    if (cur == null || prev == null || prev === 0) return "";
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return "stable";
    const arrow = d > 0 ? "▲" : "▼";
    const pct = Math.abs((d / prev) * 100);
    if (pct < 1) return "stable";
    return arrow + " " + num(pct, 0) + "% vs earlier";
  }

  function renderVitals(st, t) {
    const ind = st.indicators;
    const prev = t.length > 7 ? t[t.length - 8] : null;
    const hr = ind.heart_rate, sys = ind.blood_pressure_sys, dia = ind.blood_pressure_dia;
    const spo2 = ind.spo2, temp = ind.temperature;

    const bpStatus = [sys && sys.status, dia && dia.status].filter(Boolean)
      .sort((a, b) => ["NOMINAL", "CAUTION", "WARNING"].indexOf(b) - ["NOMINAL", "CAUTION", "WARNING"].indexOf(a))[0] || "NO DATA";

    const cards = [
      metricCard({
        label: "Heart rate", icon: "heart", unit: "bpm",
        value: hr ? num(hr.value, 0) : "--", status: hr ? hr.status : "NO DATA",
        spark: sparkFor(t, "heart_rate", 14), color: hr ? colorFor(hr.status) : undefined,
        delta: deltaText(hr && hr.value, prev && prev.heart_rate),
      }),
      metricCard({
        label: "Blood pressure", icon: "activity", unit: "mmHg",
        value: sys && dia ? num(sys.value, 0) + "/" + num(dia.value, 0) : "--",
        status: bpStatus,
        spark: sparkFor(t, "blood_pressure_sys", 14), color: colorFor(bpStatus),
        delta: deltaText(sys && sys.value, prev && prev.blood_pressure_sys),
      }),
      metricCard({
        label: "Oxygen saturation", icon: "droplet", unit: "%",
        value: spo2 ? num(spo2.value, 1) : "--", status: spo2 ? spo2.status : "NO DATA",
        spark: sparkFor(t, "spo2", 14), color: spo2 ? colorFor(spo2.status) : undefined,
        delta: deltaText(spo2 && spo2.value, prev && prev.spo2),
      }),
      metricCard({
        label: "Body temperature", icon: "thermometer", unit: "°C",
        value: temp ? num(temp.value, 1) : "--", status: temp ? temp.status : "NO DATA",
        spark: sparkFor(t, "temperature", 14), color: temp ? colorFor(temp.status) : undefined,
        delta: deltaText(temp && temp.value, prev && prev.temperature),
      }),
    ];
    $("#vitals").innerHTML = cards.join("");
  }

  function renderWellness(st) {
    const s = statusOf(st.worst);
    const auto = st.autonomy;
    const bars = Object.keys(H.SYS).map((sid) => {
      const sys = st.systems[sid];
      const sc = sys && sys.score;
      const c = sys ? colorFor(sys.status) : "#64748b";
      return (
        '<div class="sys-bar" style="--c:' + c + '">' +
          "<span>" + esc(H.SYS[sid].label) + "</span>" +
          '<span class="track"><i style="width:' + (sc == null ? 0 : sc) + '%"></i></span>' +
          '<span class="v">' + (sc == null ? "--" : sc) + "</span>" +
        "</div>"
      );
    }).join("");

    $("#wellnessPanel").innerHTML =
      '<div class="panel-head">' +
        "<div><span class=\"eyebrow\">Overall wellness</span>" +
        '<h2 style="margin-top:6px;font-size:16px">Readiness score</h2></div>' +
        '<span class="spacer"></span>' +
        '<span class="badge ' + clsOf(s) + '">' + esc(s) + "</span>" +
      "</div>" +
      '<div class="wellness-card">' +
        '<div class="wellness-ring">' + Ch.ring(st.wellness, { size: 132, label: "WELLNESS", color: colorFor(s) }) + "</div>" +
        '<div class="autonomy">' +
          '<div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px">' +
            '<span class="eyebrow">Autonomy meter</span><b style="font-size:18px">' + auto + '<span class="muted small">/100</span></b>' +
          "</div>" +
          '<div class="autonomy-meter"><i style="width:' + auto + '%"></i>' +
            '<span class="marker" style="left:calc(' + auto + "% - 1.5px)\"></span></div>" +
          '<p class="small muted" style="margin:0">' + esc(autonomyLabel(auto)) +
            " · signal delay " + fmtDelay(st.signal_delay_s) + " one way.</p>" +
          '<div class="sys-bars">' + bars + "</div>" +
        "</div>" +
      "</div>";
  }

  function renderAdvice(st) {
    const [s, text] = adviceFor(st, H.state.mode);
    const flagged = Object.keys(st.indicators)
      .filter((k) => st.indicators[k].status !== "NOMINAL")
      .sort((a, b) => st.indicators[a].score - st.indicators[b].score)
      .slice(0, 3);

    const worstSys = Object.keys(st.systems)
      .filter((k) => st.systems[k].score != null)
      .sort((a, b) => st.systems[a].score - st.systems[b].score)[0];

    const actions = worstSys && (statusOf(st.systems[worstSys].score) !== "NOMINAL")
      ? H.SYS[worstSys].actions : H.SYS[worstSys] ? H.SYS[worstSys].actions.slice(0, 2) : [];

    $("#advicePanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Decision support</span>' +
        '<h2 style="margin-top:6px;font-size:16px">What to do now</h2></div></div>' +
      '<div class="result-banner" style="--c:' + colorFor(s) + ';--c-dim:' + (s === "WARNING" ? "rgba(255,100,120,.1)" : s === "CAUTION" ? "rgba(247,185,85,.1)" : "rgba(53,226,164,.1)") + '">' +
        "<b>" + esc(s) + "</b><span>" + esc(text) + "</span></div>" +
      (flagged.length
        ? '<div class="flag-list" style="margin-top:12px">' + flagged.map((k) => {
            const i = st.indicators[k];
            return '<div class="flag ' + clsOf(i.status) + '">' +
              icon("alert") + "<span>" + esc(i.label) + "</span>" +
              '<span class="v">' + num(i.value) + " " + esc(i.unit || "") + "</span></div>";
          }).join("") + "</div>"
        : '<p class="small muted" style="margin-top:12px">No indicator is outside its band right now.</p>') +
      (actions.length
        ? "<h3 class=\"form-section-title\" style=\"margin-top:14px\">" + esc(worstSys ? H.SYS[worstSys].label : "") + " protocol</h3>" +
          "<ul class=\"small\" style=\"margin:0;padding-left:18px;color:var(--ink-2)\">" +
          actions.map((a) => "<li>" + esc(a) + "</li>").join("") + "</ul>"
        : "") +
      '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="btn btn-sm btn-ghost" href="assistant.html' + (flagged.length ? "?q=" + encodeURIComponent("Why is my " + st.indicators[flagged[0]].label + " flagged?") : "") + '">' +
          icon("brain") + "Ask why</a>" +
        '<a class="btn btn-sm btn-ghost" href="analytics.html">' + icon("chart") + "See trends</a>" +
      "</div>";
  }

  function renderCats(st, t) {
    const slice = t.slice(-15);
    $("#cats").innerHTML = H.CATEGORIES.map((c) => {
      const sys = st.systems[c.sys] || {};
      const s = statusOf(sys.score);
      const hist = slice.map((r) => {
        const v = H.compute(r, H.BASE).systems[c.sys];
        return v ? v.score : null;
      });
      const c2 = colorFor(s);
      return '<a class="cat-card ' + clsOf(s) + '" href="assessment.html#' + c.id + '" style="--c:' + c2 + ';--c-dim:' + (s === "WARNING" ? "rgba(255,100,120,.12)" : s === "CAUTION" ? "rgba(247,185,85,.12)" : "rgba(53,226,164,.12)") + '">' +
        '<div class="cat-head">' +
          '<span class="cat-icon">' + icon(c.icon) + "</span>" +
          '<span class="cat-title"><b>' + esc(c.name) + "</b><span>" + esc(c.short) + "</span></span>" +
        "</div>" +
        '<div class="cat-body">' +
          '<span class="cat-score"><strong>' + (sys.score == null ? "--" : sys.score) + "</strong><span>/100</span></span>" +
          '<span class="badge ' + clsOf(s) + '">' + esc(s) + "</span>" +
        "</div>" +
        Ch.spark(hist, { w: 160, h: 24, color: c2 }) +
        '<div class="cat-meta">' + icon("activity") + "<span>" + esc(H.SYS[c.sys].body) + "</span></div>" +
      "</a>";
    }).join("");
  }

  function renderTrend(st, t) {
    const slice = t.slice(-14);
    const labels = slice.map((r) => "D" + (r.day == null ? "?" : r.day));
    const values = slice.map((r) => H.compute(r, H.BASE).wellness);
    const chart = Ch.line({
      labels,
      series: [{ name: "Wellness", color: "#22d3ee", values, area: true }],
      domain: [0, 100],
      height: 186,
      decimals: 0,
      title: "Wellness score progression",
    });
    const first = values[0], last = values[values.length - 1];
    const diff = first == null || last == null ? null : last - first;

    $("#trendPanel").innerHTML =
      '<div class="chart-head"><div class="grow">' +
        '<span class="eyebrow">14-day progression</span>' +
        '<h3 style="margin-top:5px">Wellness score</h3>' +
        '<div class="sub">Computed with the same rules as the backend scoring engine.</div>' +
      "</div>" +
      '<div class="chart-stat"><b>' + (last == null ? "--" : last) + "</b><span>" +
        (diff == null ? "no trend" : (diff > 0 ? "+" : "") + diff + " pts") + "</span></div></div>" +
      '<div id="trendChart"></div>' +
      '<p class="small muted" style="margin-top:8px">Green band is nominal (70-100). The score is the mean of the five domain scores, capped at 60 when any domain is critical.</p>';
    Ch.render($("#trendChart"), chart);
  }

  function renderFeed(t) {
    const rows = t.slice(-6).reverse();
    $("#feedPanel").innerHTML =
      '<div class="panel-head"><div><span class="eyebrow">Record</span>' +
        '<h3 style="margin-top:5px">Recent check-ins</h3></div><span class="spacer"></span>' +
        '<span class="pill">' + icon(H.state.online ? "signal" : "offline") +
        (H.state.online ? "Backend live" : "Offline record") + "</span></div>" +
      '<div class="feed">' + rows.map((r) => {
        const stt = H.compute(r, H.BASE);
        const s = statusOf(stt.worst);
        const flags = Object.keys(stt.indicators).filter((k) => stt.indicators[k].status !== "NOMINAL");
        return '<div class="feed-row" style="--c:' + colorFor(s) + '">' +
          '<span class="feed-time">' + esc(H.dayLabel(r)) + "</span>" +
          '<span class="feed-dot"></span>' +
          '<span class="feed-text">Wellness <b>' + stt.wellness + "</b> · " +
            (flags.length ? esc(flags.map((k) => stt.indicators[k].label).join(", ")) + " flagged" : "no flags") +
            (r._api ? ' · <span class="mono">db</span>' : r.day > 30 ? ' · <span class="mono">local</span>' : "") +
          "</span>" +
          '<span class="badge ' + clsOf(s) + '">' + stt.wellness + "</span>" +
        "</div>";
      }).join("") + "</div>";
  }

  /* ----------------------------------------------------------------- boot */
  // Day navigation is kept from the original panel: browse any recorded day.
  function mountDaybar() {
    const host = $("#daybar");
    if (!host) return;
    host.innerHTML =
      '<span class="label">Mission day</span>' +
      '<span class="dayval" id="dayVal">D--</span>' +
      '<button class="btn btn-sm btn-ghost btn-icon" type="button" data-day="-1" aria-label="Previous day" style="width:30px;height:30px;border-radius:8px">' + icon("chevronLeft") + "</button>" +
      '<input type="range" id="dayRange" min="0" max="0" value="0" aria-label="Select mission day">' +
      '<button class="btn btn-sm btn-ghost btn-icon" type="button" data-day="1" aria-label="Next day" style="width:30px;height:30px;border-radius:8px">' + icon("chevronRight") + "</button>" +
      '<button class="btn btn-sm btn-ghost" type="button" data-day="latest">Jump to latest</button>';

    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-day]");
      if (!b) return;
      const t = H.timeline();
      if (b.dataset.day === "latest") view = t.length - 1;
      else view = clampIndex(view == null ? t.length - 1 : view + Number(b.dataset.day), t.length);
      renderAll();
    });
    host.addEventListener("input", (e) => {
      if (e.target.id !== "dayRange") return;
      view = Number(e.target.value);
      renderAll();
    });
  }

  function clampIndex(i, len) { return Math.max(0, Math.min(len - 1, i)); }

  function syncDaybar(t, i) {
    const range = $("#dayRange");
    const val = $("#dayVal");
    if (range) {
      range.max = String(Math.max(0, t.length - 1));
      if (Number(range.value) !== i) range.value = String(i);
    }
    const cur = t[i] || {};
    const last = t[t.length - 1] || {};
    if (val) val.textContent = "D" + (cur.day == null ? "--" : cur.day) + " / " + (last.day == null ? "--" : last.day);
    const latestBtn = $('[data-day="latest"]');
    if (latestBtn) {
      latestBtn.className = "btn btn-sm " + (i >= t.length - 1 ? "btn-ghost" : "btn-primary");
      latestBtn.disabled = i >= t.length - 1;
    }
  }

  // The day you leave the scrubber on follows you to the other pages.
  function restoreView(t) {
    const day = H.session.get("day", null);
    if (day == null) return null;
    for (let i = 0; i < t.length; i++) if (t[i].day === day) return i;
    return null;
  }

  function renderAll() {
    const t = H.timeline();
    if (!t.length) return;
    if (view == null || view > t.length - 1) view = t.length - 1;
    view = clampIndex(view, t.length);

    const cur = t[view];
    H.session.set("day", cur.day == null ? null : cur.day);
    const past = t.slice(0, view + 1);
    const st = H.compute(Object.assign({}, cur, { distance_from_earth_km: MODES[H.state.mode].km }), H.BASE);

    syncDaybar(t, view);
    renderChips(st, cur);
    renderVitals(st, past);
    renderWellness(st);
    renderAdvice(st);
    renderCats(st, past);
    renderTrend(st, past);
    renderFeed(past);
  }

  H.ready(() => {
    H.boot(() => {
      mountDaybar();
      view = restoreView(H.timeline());
      renderAll();
      H.on((what) => {
        if (what === "mode" || what === "data" || what === "sync") renderAll();
      });
    });
  });
})();
