/* ==========================================================================
   HELM · page: Home
   The landing hero is markup only; this fills its bottom strip from the same
   scoring code the Mission Control page uses. Nothing here is hard-coded: the
   three read-outs follow the selected mission day and flight profile.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const { $, statusOf, clsOf, fmtDelay, MODES } = H;

  function recordFor(day) {
    const t = H.timeline();
    if (day != null) {
      for (let i = 0; i < t.length; i++) if (t[i].day === day) return t[i];
    }
    return H.latest();
  }

  function setText(id, text) {
    const el = $("#" + id);
    if (el) el.textContent = text;
  }

  function paint(st, day) {
    const mode = MODES[H.state.mode] || MODES.mars;
    const status = statusOf(st.worst);

    setText("stripWellness", st.wellness == null ? "--" : st.wellness + "/100");
    setText("stripWellnessNote", day == null ? "mean of five domains" : "Day " + day + " · mean of five domains");
    setText("stripSignal", fmtDelay(st.signal_delay_s));
    setText("stripSignalNote", "one way · " + mode.label);
    setText("stripStatus", status);
    setText("stripStatusNote", "worst domain right now");

    const val = $("#stripStatus");
    if (val) {
      val.className = "strip-value is-status " + clsOf(status);
      val.setAttribute("data-status", status);
    }
    const well = $("#stripWellness");
    if (well) well.className = "strip-value " + clsOf(status);
  }

  function render() {
    const day = H.session.get("day", null);
    const cur = recordFor(day);
    const st = H.compute(H.withMode(cur, H.state.mode), H.BASE);
    paint(st, cur && cur.day != null ? cur.day : null);
  }

  H.ready(() => {
    H.boot(() => {
      render();
      H.on((what) => {
        if (what === "mode" || what === "data" || what === "sync") render();
      });
    });
  });
})();
