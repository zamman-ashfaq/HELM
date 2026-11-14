/* HELM scoring engine: exact port of the Python reference.
   Tune thresholds here. */
(function (g) {
  'use strict';

  const NOMINAL_MIN = 70;          // score >= 70 -> NOMINAL
  const CAUTION_MIN = 40;          // score >= 40 -> CAUTION, otherwise WARNING
  const WARNING_TRIGGER = 40;      // any system score below this caps wellness
  const WELLNESS_CAP = 60;         // ...at this value

  function driftPct(value, baseline) {
    return baseline === 0 ? 0.0 : (value - baseline) / baseline * 100;
  }

  // 100 = at baseline, 0 = at or past the limit
  function indicatorScore(value, baseline, low, high, bad) {
    bad = bad || 'both';
    let span, dist;
    if (value >= baseline) {
      if (bad === 'low') return 100.0;
      span = high - baseline; dist = value - baseline;
    } else {
      if (bad === 'high') return 100.0;
      span = baseline - low; dist = baseline - value;
    }
    if (span <= 0) return dist === 0 ? 100.0 : 0.0;
    return Math.max(0.0, Math.min(100.0, 100 * (1 - dist / span)));
  }

  function status(score) {
    return score >= NOMINAL_MIN ? 'NOMINAL' : score >= CAUTION_MIN ? 'CAUTION' : 'WARNING';
  }

  const hasValue = v => typeof v === 'number' && Number.isFinite(v);

  // Returns { wellness, systems:{id:{label,score,status}}, indicators:{id:{label,value,unit,drift_pct,score,status}} }
  // Systems with no indicator readings are omitted from `systems`.
  function compute(data, reading) {
    const indicators = {};
    for (const [id, m] of Object.entries(data.indicators)) {
      const v = reading[id];
      if (!hasValue(v)) continue;                       // skip indicators missing in the reading
      const sc = indicatorScore(v, m.baseline, m.limits.low, m.limits.high, m.bad);
      indicators[id] = { label: m.label, value: v, unit: m.unit, drift_pct: driftPct(v, m.baseline), score: sc, status: status(sc) };
    }
    const systems = {};
    const scores = [];
    for (const [sid, sys] of Object.entries(data.systems)) {
      const s = (sys.indicators || []).filter(i => indicators[i]).map(i => indicators[i].score);
      if (!s.length) continue;
      const avg = s.reduce((a, b) => a + b, 0) / s.length;
      systems[sid] = { label: sys.label, score: avg, status: status(avg) };
      scores.push(avg);
    }
    let wellness = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    if (scores.some(x => x < WARNING_TRIGGER)) wellness = Math.min(wellness, WELLNESS_CAP);
    return { wellness, systems, indicators };
  }

  g.HELM = g.HELM || {};
  g.HELM.Score = { NOMINAL_MIN, CAUTION_MIN, WARNING_TRIGGER, WELLNESS_CAP, driftPct, indicatorScore, status, compute };
})(window);