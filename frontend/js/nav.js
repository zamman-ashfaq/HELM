/* ==========================================================================
   HELM · shared navigation
   One bar for the whole app: every page drops an empty
   <header class="site-nav" data-nav></header> where the bar should sit and
   declares itself with <div class="shell" data-page="…">. Nothing else.
   ========================================================================== */
(function () {
  "use strict";

  const ITEMS = [
    { id: "home", label: "Home", href: "index.html" },
    { id: "mission", label: "Mission Control", href: "mission-control.html" },
    { id: "assessment", label: "Health Assessment", href: "assessment.html" },
    { id: "analytics", label: "Health Analytics", href: "analytics.html" },
    { id: "assistant", label: "AI Health Assistant", href: "assistant.html" },
    { id: "physical", label: "Physical Assessment", href: "physical.html" },
  ];

  const pageId = () => {
    const shell = document.querySelector(".shell");
    return (shell && shell.dataset.page) || "";
  };

  function mount() {
    const host = document.querySelector("[data-nav]");
    if (!host) return;

    const H = window.HELM;
    const icon = H ? H.icon : () => "";
    const current = pageId();

    const links = ITEMS.map((it) => {
      const on = it.id === current;
      return (
        '<li><a class="nav-link' + (on ? " active" : "") + '" href="' + it.href + '"' +
        (on ? ' aria-current="page"' : "") + ">" + it.label + "</a></li>"
      );
    }).join("");

    host.innerHTML =
      '<div class="nav-wrap">' +
        '<nav class="nav-shell" aria-label="Primary">' +
          '<a class="brand" href="index.html" aria-label="HELM home">' +
            '<span class="brand-mark">' + icon("helm") + "</span>" +
            '<span class="brand-text"><b>HELM</b><span>Astronaut health</span></span>' +
          "</a>" +
          // paintShell() owns #pillLink and rewrites its class list, so the
          // wrapper is what the responsive rules switch off.
          '<span class="nav-status"><span class="pill" id="pillLink">' + icon("offline") +
            "<span>Local record</span></span></span>" +
          '<button class="nav-burger" type="button" id="navBurger" aria-expanded="false" ' +
            'aria-controls="navMenu" aria-label="Open menu">' +
            "<span></span><span></span><span></span>" +
          "</button>" +
          '<ul class="nav-menu" id="navMenu">' + links + "</ul>" +
        "</nav>" +
      "</div>";

    const burger = document.getElementById("navBurger");
    const menu = document.getElementById("navMenu");
    if (!burger || !menu) return;

    const setOpen = (open) => {
      menu.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    burger.addEventListener("click", () => {
      setOpen(burger.getAttribute("aria-expanded") !== "true");
    });

    // A choice from the menu closes it; Escape closes it and returns focus.
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) {
        setOpen(false);
        burger.focus();
      }
    });

    // Growing past the breakpoint restores the horizontal bar.
    const wide = window.matchMedia("(min-width: 1001px)");
    const onWide = () => { if (wide.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  const H = window.HELM;
  if (H && H.ready) H.ready(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  window.HELM_NAV = { ITEMS: ITEMS, mount: mount };
})();
