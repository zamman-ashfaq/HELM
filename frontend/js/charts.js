/* ==========================================================================
   HELM · charts
   Small, dependency-free SVG renderers used by the analytics dashboard.
   Every number plotted comes from data/demo_readings.json or the local /
   backend check-in record - nothing is synthesised for decoration.
   ========================================================================== */
(function () {
  "use strict";

  const C = {
    cyan: "#22d3ee", blue: "#3b82f6", violet: "#8b7dff",
    ok: "#35e2a4", warn: "#f7b955", crit: "#ff6478", ink: "#a6b8cd", grid: "rgba(122,190,230,.16)",
  };

  // Default drawing width. Callers may pass opts.width so the chart is drawn at
  // its real pixel width and axis labels keep their declared font size.
  const DEFAULT_W = 760;

  function niceDomain(values, fixed) {
    if (fixed) return fixed.slice();
    const v = values.filter((x) => x != null && !Number.isNaN(x));
    if (!v.length) return [0, 1];
    let lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.16;
    return [lo - pad, hi + pad];
  }

  function scaleX(i, n, l, r) { return n <= 1 ? (l + r) / 2 : l + (i / (n - 1)) * (r - l); }
  function scaleY(v, lo, hi, t, b) {
    if (v == null) return null;
    const k = (v - lo) / (hi - lo || 1);
    return b - Math.max(0, Math.min(1, k)) * (b - t);
  }

  function path(points) {
    let d = "", open = false;
    points.forEach((p) => {
      if (p == null) { open = false; return; }
      d += (open ? " L" : " M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      open = true;
    });
    return d.trim();
  }

  /**
   * line({
   *   labels: ['D1','D2',...],
   *   series: [{name, color, values:[...]}],
   *   unit, domain:[lo,hi], thresholds:[{value,label,color}],
   *   band:{from,to,color}, decimals, height
   * })
   */
  function line(opts) {
    const W = opts.width || DEFAULT_W;
    const H = opts.height || 210;
    const pad = { l: 40, r: 14, t: 12, b: 24 };
    const labels = opts.labels || [];
    const series = (opts.series || []).map((s) => Object.assign({ color: C.cyan }, s));
    const n = labels.length;
    const all = series.reduce((a, s) => a.concat(s.values || []), []);
    const domain = niceDomain(all, opts.domain);
    const lo = domain[0], hi = domain[1];

    const x = (i) => scaleX(i, n, pad.l, W - pad.r);
    const y = (v) => scaleY(v, lo, hi, pad.t, H - pad.b);

    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + escapeHtml(opts.title || "chart") + '" preserveAspectRatio="none">';

    // horizontal grid + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const val = lo + ((hi - lo) * i) / ticks;
      const yy = y(val);
      svg += '<line class="grid-line" x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + yy.toFixed(1) + '"/>';
      svg += '<text class="axis-text" x="' + (pad.l - 7) + '" y="' + (yy + 3.4).toFixed(1) + '" text-anchor="end">' + fmtTick(val, opts.decimals) + "</text>";
    }

    // shaded band (e.g. abnormal SpO2 region)
    if (opts.band) {
      const b1 = y(Math.max(opts.band.from, lo)), b2 = y(Math.min(opts.band.to, hi));
      if (b1 != null && b2 != null) {
        svg += '<rect class="band" x="' + pad.l + '" y="' + Math.min(b1, b2).toFixed(1) + '" width="' + (W - pad.l - pad.r) +
          '" height="' + Math.abs(b2 - b1).toFixed(1) + '" fill="' + (opts.band.color || C.warn) + '"/>';
      }
    }

    // thresholds
    (opts.thresholds || []).forEach((th) => {
      if (th.value >= lo && th.value <= hi) {
        const yy = y(th.value);
        svg += '<line class="threshold" x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + yy.toFixed(1) + '" stroke="' + (th.color || C.warn) + '"/>';
        svg += '<text class="label-text" x="' + (W - pad.r) + '" y="' + (yy - 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(th.label) + "</text>";
      }
    });

    // x labels (max 8, and never crowding the last one)
    const step = Math.max(1, Math.ceil(n / 8));
    labels.forEach((lab, i) => {
      if (i !== n - 1 && (i % step !== 0 || n - 1 - i < step)) return;
      svg += '<text class="axis-text" x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + escapeHtml(lab) + "</text>";
    });

    // series
    series.forEach((s) => {
      const pts = (s.values || []).map((v, i) => (v == null ? null : [x(i), y(v)]));
      if (s.area) {
        const first = pts.find(Boolean);
        const last = pts.slice().reverse().find(Boolean);
        if (first && last) {
          const area = path(pts) + " L" + last[0].toFixed(1) + " " + (H - pad.b) + " L" + first[0].toFixed(1) + " " + (H - pad.b) + " Z";
          svg += '<path class="series-area" d="' + area + '" fill="' + s.color + '"/>';
        }
      }
      svg += '<path class="series-line" d="' + path(pts) + '" stroke="' + s.color + '"/>';
      // last value marker
      for (let i = pts.length - 1; i >= 0; i--) {
        if (pts[i]) {
          svg += '<circle class="dot-mark" cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="3.2" fill="' + s.color + '"/>';
          break;
        }
      }
    });

    svg += '<line class="hover-line" x1="0" y1="' + pad.t + '" x2="0" y2="' + (H - pad.b) + '" style="opacity:0"/>';
    svg += "</svg>";

    return {
      html: svg,
      meta: {
        W, H, xs: labels.map((_, i) => x(i)),
        rows: labels.map((lab, i) => {
          const row = { label: lab, cells: [] };
          series.forEach((s) => {
            const v = (s.values || [])[i];
            row.cells.push({ name: s.name, color: s.color, value: v, y: v == null ? null : y(v), unit: s.unit || opts.unit || "" });
          });
          return row;
        }),
        decimals: opts.decimals,
      },
    };
  }

  /** Vertical bars with an optional target line. */
  function bars(opts) {
    const W = opts.width || DEFAULT_W;
    const H = opts.height || 170;
    const pad = { l: 38, r: 12, t: 12, b: 22 };
    const values = opts.values || [];
    const labels = opts.labels || [];
    const n = values.length;
    const maxVal = Math.max.apply(null, values.concat(opts.target != null ? [opts.target] : []).filter((v) => v != null).concat([1]));
    const hi = maxVal * 1.12;
    const y = (v) => scaleY(v, 0, hi, pad.t, H - pad.b);
    const bw = Math.max(3, ((W - pad.l - pad.r) / Math.max(n, 1)) * 0.62);

    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + escapeHtml(opts.title || "bar chart") + '">';
    for (let i = 0; i <= 3; i++) {
      const val = (hi * i) / 3;
      const yy = y(val);
      svg += '<line class="grid-line" x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + yy.toFixed(1) + '"/>';
      svg += '<text class="axis-text" x="' + (pad.l - 7) + '" y="' + (yy + 3.4).toFixed(1) + '" text-anchor="end">' + fmtTick(val, 0) + "</text>";
    }
    values.forEach((v, i) => {
      const cx = scaleX(i, n, pad.l + bw / 2, W - pad.r - bw / 2);
      if (v == null) return;
      const h = Math.max(1, H - pad.b - y(v));
      const bad = opts.statusOf ? opts.statusOf(v) : false;
      svg += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
        '" rx="2" fill="' + (bad ? C.warn : opts.color || C.cyan) + '" opacity="' + (bad ? "0.95" : "0.55") + '"/>';
    });
    if (opts.target != null) {
      const yy = y(opts.target);
      svg += '<line class="threshold" x1="' + pad.l + '" y1="' + yy.toFixed(1) + '" x2="' + (W - pad.r) + '" y2="' + yy.toFixed(1) + '" stroke="' + C.ok + '"/>';
      svg += '<text class="label-text" x="' + (W - pad.r) + '" y="' + (yy - 4).toFixed(1) + '" text-anchor="end">' + escapeHtml(opts.targetLabel || "target") + "</text>";
    }
    const step = Math.max(1, Math.ceil(n / 8));
    labels.forEach((lab, i) => {
      if (i !== n - 1 && (i % step !== 0 || n - 1 - i < step)) return;
      const cx = scaleX(i, n, pad.l + bw / 2, W - pad.r - bw / 2);
      svg += '<text class="axis-text" x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + escapeHtml(lab) + "</text>";
    });
    svg += "</svg>";

    return {
      html: svg,
      meta: {
        W, H,
        xs: values.map((_, i) => scaleX(i, n, pad.l + bw / 2, W - pad.r - bw / 2)),
        rows: labels.map((lab, i) => ({
          label: lab,
          cells: [{ name: opts.name || "", color: opts.color || C.cyan, value: values[i], y: y(values[i]), unit: opts.unit || "" }],
        })),
      },
    };
  }

  function fmtTick(v, decimals) {
    const d = decimals == null ? 0 : decimals;
    if (Math.abs(v) >= 1000) return Math.round(v / 100) / 10 + "k";
    return String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d));
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* --------------------------------------------------------------- renderers */
  function ring(value, opts) {
    const o = opts || {};
    const size = o.size || 132;
    const stroke = o.stroke || 8;
    const r = (size - stroke) / 2 - 2;
    const circ = 2 * Math.PI * r;
    const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
    const dash = (pct / 100) * circ;
    const color = o.color || C.cyan;

    let ticks = "";
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 - Math.PI / 2;
      const r1 = r + stroke / 2 + 3, r2 = r + stroke / 2 + (i % 5 === 0 ? 7 : 5);
      ticks += '<line class="ring-ticks" x1="' + (size / 2 + Math.cos(a) * r1).toFixed(1) + '" y1="' + (size / 2 + Math.sin(a) * r1).toFixed(1) +
        '" x2="' + (size / 2 + Math.cos(a) * r2).toFixed(1) + '" y2="' + (size / 2 + Math.sin(a) * r2).toFixed(1) + '"/>';
    }

    return (
      '<svg class="ring" viewBox="0 0 ' + size + " " + size + '" role="img" aria-label="' + escapeHtml(o.label || "score") + " " + (value == null ? "--" : value) + ' out of 100" style="--c:' + color + '">' +
      ticks +
      '<circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '"/>' +
      '<circle class="ring-fill" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke +
      '" stroke-dasharray="' + dash.toFixed(1) + " " + circ.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + " " + size / 2 + ')"/>' +
      '<text class="ring-value" x="' + size / 2 + '" y="' + (size / 2 + 6) + '">' + (value == null ? "--" : value) + "</text>" +
      '<text class="ring-sub" x="' + size / 2 + '" y="' + (size / 2 + 24) + '">' + escapeHtml(o.label || "") + "</text>" +
      "</svg>"
    );
  }

  function spark(values, opts) {
    const o = opts || {};
    const w = o.w || 140, h = o.h || 28;
    const v = (values || []).filter((x) => x != null);
    if (v.length < 2) return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"></svg>';
    const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    const span = hi - lo || 1;
    const pts = values.map((x, i) =>
      x == null ? null : [ (i / (values.length - 1)) * (w - 4) + 2, h - 3 - ((x - lo) / span) * (h - 6) ]
    ).filter(Boolean);
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = d + " L" + pts[pts.length - 1][0].toFixed(1) + " " + h + " L" + pts[0][0].toFixed(1) + " " + h + " Z";
    const c = o.color || "currentColor";
    return (
      '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + area + '" fill="' + c + '" opacity=".12"/>' +
      '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="1.6" stroke-linejoin="round"/>' +
      "</svg>"
    );
  }

  /* ------------------------------------------------------------- hover glue */
  function render(container, chart) {
    if (!container) return;
    container.innerHTML = '<div class="chart">' + chart.html + '<div class="chart-tip" aria-hidden="true"></div></div>';
    const host = container.firstChild;
    const svg = host.querySelector("svg");
    const tip = host.querySelector(".chart-tip");
    const hoverLine = svg.querySelector(".hover-line");
    if (!chart.meta || !chart.meta.xs.length) return;

    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / chart.meta.W;
      const px = (ev.clientX - rect.left) / scale;
      let best = 0, dist = Infinity;
      chart.meta.xs.forEach((x, i) => {
        const d = Math.abs(x - px);
        if (d < dist) { dist = d; best = i; }
      });
      const row = chart.meta.rows[best];
      if (!row) return;
      hoverLine.setAttribute("x1", chart.meta.xs[best]);
      hoverLine.setAttribute("x2", chart.meta.xs[best]);
      hoverLine.style.opacity = "1";

      const cells = row.cells.filter((c) => c.value != null);
      tip.innerHTML = "<b>" + escapeHtml(row.label) + "</b>" + cells.map((c) =>
        '<br><span style="color:' + c.color + '">■</span> ' + (c.name ? escapeHtml(c.name) + ": " : "") +
        Math.round(c.value * 10) / 10 + " " + escapeHtml(c.unit || "")
      ).join("");
      tip.style.left = (chart.meta.xs[best] * scale) + "px";
      const firstY = cells.length ? cells[0].y : chart.meta.H / 2;
      tip.style.top = (firstY * (rect.height / chart.meta.H)) + "px";
      tip.classList.add("on");
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", () => {
      tip.classList.remove("on");
      if (hoverLine) hoverLine.style.opacity = "0";
    });
  }

  window.HELMCharts = { line, bars, ring, spark, render, colors: C };
})();
