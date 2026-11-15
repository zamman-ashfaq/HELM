/* ==========================================================================
   HELM · page: Home
   The hero is static markup - heading, tagline, two ways in - so this page
   renders no numbers. It only brings up the shared shell, so the badge in the
   corner still reports whether the backend is reachable.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;

  H.ready(() => {
    H.boot();
  });
})();
