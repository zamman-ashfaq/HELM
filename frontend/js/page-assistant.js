/* ==========================================================================
   HELM · page: AI Health Assistant
   The onboard model is the team's own Ollama advisor, reached through
   POST /api/ask. When that is not running the rule-based advisor answers, so a
   conversation is always available. Voice in/out uses the browser + OS speech
   engines only; nothing is sent to a third-party AI service.
   ========================================================================== */
(function () {
  "use strict";
  const H = window.HELM;
  const { $, esc, num, icon, statusOf, clsOf } = H;

  const SRC = {
    llm:         { label: "ONBOARD LLM", badge: "is-nominal", text: "Onboard model" },
    fallback:    { label: "RULE-BASED", badge: "is-caution", text: "Rule-based fallback" },
    offline:     { label: "OFFLINE",    badge: "is-caution", text: "Offline rules" },
    unavailable: { label: "UNAVAILABLE", badge: "is-warning", text: "Advisor module missing" },
  };

  const PROMPTS = [
    "Give me an overall status summary.",
    "Why is my heart rate flagged?",
    "How has my sleep been this week?",
    "What does my radiation dose mean?",
  ];

  let busy = false;
  let speaking = null;      // { el, btn, text }
  let autoSpeak = false;
  let recog = null;
  let listening = false;
  let voices = [];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ------------------------------------------------------------- live state */
  function contextVitals() {
    const v = Object.assign({}, H.latest());
    delete v.day;
    delete v.created_at;
    delete v._api;
    v.distance_from_earth_km = H.MODES[H.state.mode].km;
    return v;
  }

  function engine() {
    if (!H.state.online) return { key: "offline", text: "Fully offline · rule-based answers" };
    if (H.state.llm) return { key: "llm", text: (H.state.llmModel || "Local model") + " · local inference" };
    return { key: "fallback", text: "Model idle · server-side rules" };
  }

  function renderEngine() {
    const e = engine();
    const pill = $("#enginePill");
    pill.className = "pill " + (e.key === "llm" ? "is-live" : e.key === "fallback" ? "is-ok" : "is-warn");
    pill.innerHTML = icon(e.key === "llm" ? "spark" : e.key === "fallback" ? "shield" : "offline") +
      "<span>" + esc(e.key === "llm" ? "Local LLM" : e.key === "fallback" ? "Rule-based" : "Offline") + "</span>";

    renderEngine._last = e.key;
    $("#chatAvatar").innerHTML = icon("brain");
    $("#chatSub").textContent = e.text;
    $("#srcFoot").textContent = "Advisor: " + (e.key === "llm" ? e.text : e.key === "fallback" ? "rule-based fallback (model idle)" : "offline rules");
  }

  function renderContext() {
    const st = H.currentStatus();
    const last = H.latest();
    const s = statusOf(st.worst);
    const i = st.indicators;

    const row = (k, v) => '<div class="ctx-row"><span>' + esc(k) + "</span><b>" + v + "</b></div>";
    const ind = (key, dec) => {
      const x = i[key];
      return x ? num(x.value, dec) + ' <span class="muted">' + esc(x.unit || "") + "</span>" : '<span class="muted">--</span>';
    };

    $("#ctx").innerHTML =
      row("Mission day", last.day == null ? "--" : "D" + last.day) +
      row("Wellness", st.wellness + " <span class=\"badge " + clsOf(s) + "\">" + s + "</span>") +
      row("Autonomy", st.autonomy + "/100") +
      row("Heart rate", ind("heart_rate", 0)) +
      row("Blood pressure", i.blood_pressure_sys && i.blood_pressure_dia
        ? num(i.blood_pressure_sys.value, 0) + "/" + num(i.blood_pressure_dia.value, 0) + ' <span class="muted">mmHg</span>'
        : '<span class="muted">--</span>') +
      row("Oxygen", ind("spo2", 1));
  }

  function renderPrompts() {
    $("#suggest").innerHTML = PROMPTS.map((p) =>
      '<button type="button" data-prompt="' + esc(p) + '">' + esc(p) + "</button>"
    ).join("");
  }

  /* ------------------------------------------------------------------ chat */
  function scrollDown() {
    const log = $("#log");
    log.scrollTop = log.scrollHeight;
  }

  function pushMsg(role, text, meta) {
    const el = document.createElement("div");
    el.className = "msg " + role;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    el.appendChild(bubble);

    if (role === "ai") {
      const m = document.createElement("div");
      m.className = "msg-meta";
      const src = SRC[(meta && meta.source) || "offline"] || SRC.offline;
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      m.innerHTML =
        '<span class="badge ' + src.badge + '" style="font-size:9px;padding:2px 6px">' + src.label + "</span>" +
        "<span>" + esc(src.text) + " · " + time + "</span>" +
        '<span class="msg-tools">' +
          '<button type="button" data-speak>' + icon("volume") + "Read</button>" +
          '<button type="button" data-copy>' + icon("file") + "Copy</button>" +
          (meta && meta.notes && meta.notes.length
            ? '<button type="button" data-notes="' + esc(meta.notes.join(", ")) + '" disabled>' + icon("info") + esc(meta.notes.join(" · ")) + "</button>"
            : "") +
        "</span>";
      el.appendChild(m);

      m.querySelector("[data-speak]").addEventListener("click", (e) => toggleSpeak(el, e.currentTarget, text));
      m.querySelector("[data-copy]").addEventListener("click", async (e) => {
        try {
          await navigator.clipboard.writeText(text);
          H.toast("Answer copied", "ok");
        } catch (err) {
          H.toast("Clipboard blocked by the browser", "warn");
        }
      });
    }

    $("#log").appendChild(el);
    scrollDown();
    return el;
  }

  function pushTyping() {
    const el = document.createElement("div");
    el.className = "msg ai";
    el.innerHTML = '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
    $("#log").appendChild(el);
    scrollDown();
    return el;
  }

  function greeting() {
    const st = H.currentStatus();
    const s = statusOf(st.worst);
    const low = Object.keys(st.indicators)
      .filter((k) => st.indicators[k].status !== "NOMINAL")
      .sort((a, b) => st.indicators[a].score - st.indicators[b].score)
      .slice(0, 3)
      .map((k) => st.indicators[k].label.toLowerCase() + " at " + num(st.indicators[k].value) + " " + st.indicators[k].unit);

    const head = "Crew link up. Wellness is " + st.wellness + "/100 (" + s.toLowerCase() +
      ") and mission autonomy is " + st.autonomy + "/100.";
    const body = low.length
      ? " Outside its band right now: " + low.join(", ") + "."
      : " Every logged indicator is inside its band.";
    return head + body + " Ask about any measurement, a trend, or what to do next.";
  }

  function resetSession() {
    $("#log").innerHTML = "";
    stopSpeak();
    pushMsg("ai", greeting(), { source: H.state.online ? "fallback" : "offline" });
  }

  /* ------------------------------------------------------------------- ask */
  async function ask(raw) {
    const question = String(raw || "").trim();
    if (!question || busy) return;
    busy = true;
    setSendState(true);

    stopSpeak();
    pushMsg("user", question);
    const input = $("#input");
    input.value = "";
    autosize(input);
    $("#transcript").textContent = "";

    const typing = pushTyping();
    const started = performance.now();
    let res = null;

    try {
      if (!H.state.online) throw new Error("offline");
      res = await H.api.ask(question, contextVitals());
    } catch (err) {
      res = null;
    }

    if (!res || !res.answer) {
      res = window.HELMLocalAdvisor
        ? window.HELMLocalAdvisor.answer(question, H.currentStatus())
        : { answer: "The advisor is not loaded on this device.", source: "unavailable", notes_used: [] };
    }

    // keep the typing indicator readable instead of flashing
    await sleep(Math.max(0, 520 - (performance.now() - started)));
    typing.remove();

    const el = pushMsg("ai", res.answer, { source: res.source, notes: res.notes_used });
    if (res.status && res.status.wellness != null) {
      H.state.liveStatus = res.status;
    }
    // The health probe caches the model state; an LLM answer proves it is up.
    if (res.source === "llm" && !H.state.llm) {
      H.state.llm = true;
      H.state.llmModel = H.state.llmModel || "llama3.2:3b";
      renderEngine();
      H.paintShell();
    }
    if (autoSpeak) toggleSpeak(el, el.querySelector("[data-speak]"), res.answer);

    busy = false;
    setSendState(false);
    input.focus({ preventScroll: true });
  }

  function setSendState(on) {
    const b = $("#sendBtn");
    b.disabled = on;
    b.style.opacity = on ? "0.55" : "";
    b.innerHTML = icon(on ? "clock" : "send");
  }

  function autosize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(132, el.scrollHeight) + "px";
  }

  /* --------------------------------------------------------------- voice out */
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
    renderVoiceState();
  }

  function pickVoice() {
    if (!voices.length) return null;
    const pref = voices.filter((v) => /^en/i.test(v.lang || ""));
    const pool = pref.length ? pref : voices;
    const local = pool.filter((v) => v.localService);
    const set = local.length ? local : pool;
    return set.find((v) => /female|samantha|zira|aria|jenny/i.test(v.name)) || set[0];
  }

  function stopSpeak() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (speaking && speaking.btn) {
      speaking.btn.innerHTML = icon("volume") + "Read";
      speaking.el.classList.remove("speaking");
    }
    speaking = null;
    renderVoiceState();
  }

  function toggleSpeak(el, btn, text) {
    if (!("speechSynthesis" in window)) {
      H.toast("This browser has no speech engine", "warn");
      return;
    }
    if (speaking && speaking.el === el) { stopSpeak(); return; }
    stopSpeak();

    const clean = text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").slice(0, 1200);
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1.02;
    u.pitch = 1;

    speaking = { el, btn, text };
    btn.innerHTML = icon("stop") + "Stop";
    el.classList.add("speaking");
    u.onend = () => { if (speaking && speaking.el === el) stopSpeak(); };
    u.onerror = () => { if (speaking && speaking.el === el) stopSpeak(); };
    window.speechSynthesis.speak(u);
    renderVoiceState();
  }

  function renderVoiceState() {
    const tts = "speechSynthesis" in window;
    const stt = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const rows = [];
    const row = (k, v) => '<div class="ctx-row"><span>' + esc(k) + "</span><b>" + v + "</b></div>";

    rows.push(row("Speak replies", tts
      ? '<span class="badge ' + (autoSpeak ? "is-nominal" : "is-nodata") + '">' + (autoSpeak ? "ON" : "OFF") + "</span>"
      : '<span class="badge is-warning">UNAVAILABLE</span>'));
    rows.push(row("Voice engine", tts ? (voices.length ? voices.length + " on device" : "loading…") : "—"));
    rows.push(row("Speech input", stt
      ? '<span class="badge is-nominal">READY</span>'
      : '<span class="badge is-warning">NOT SUPPORTED</span>'));
    rows.push(row("Output", speaking
      ? '<span class="badge is-caution">PLAYING</span>'
      : '<span class="muted">idle</span>'));

    $("#voiceState").innerHTML = rows.join("");

    const tg = $("#voiceToggle");
    tg.innerHTML = icon(autoSpeak ? "volume" : "volumeOff") + (autoSpeak ? "On" : "Off");
    tg.setAttribute("aria-pressed", autoSpeak ? "true" : "false");
    tg.style.color = autoSpeak ? "var(--cyan-soft)" : "";
  }

  /* ---------------------------------------------------------------- voice in */
  function setupRecognition() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = $("#micBtn");
    mic.innerHTML = icon("mic");

    if (!Ctor) {
      mic.disabled = true;
      mic.title = "Speech input is not available in this browser — type instead";
      mic.innerHTML = icon("micOff");
      return;
    }

    recog = new Ctor();
    recog.lang = (navigator.language && /^en/i.test(navigator.language)) ? navigator.language : "en-US";
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
      listening = true;
      mic.classList.add("rec");
      mic.innerHTML = icon("micOff");
      $("#transcript").textContent = "Listening…";
    };

    recog.onresult = (ev) => {
      let interim = "", final = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      const t = (final || interim).trim();
      if (t) {
        $("#input").value = t;
        autosize($("#input"));
        $("#transcript").textContent = final ? "" : t;
      }
      if (final) {
        const q = final.trim();
        setTimeout(() => { ask(q); }, 180);
      }
    };

    recog.onerror = (ev) => {
      const map = {
        "not-allowed": "Microphone permission denied",
        "no-speech": "No speech detected",
        "audio-capture": "No microphone found",
        network: "The browser's recogniser needs a connection here",
      };
      H.toast(map[ev.error] || "Speech input failed (" + ev.error + ")", "warn");
    };

    recog.onend = () => {
      listening = false;
      mic.classList.remove("rec");
      mic.innerHTML = icon("mic");
      $("#transcript").textContent = "";
    };

    mic.addEventListener("click", () => {
      if (busy) return;
      if (listening) { recog.stop(); return; }
      try { recog.start(); } catch (e) { /* already running */ }
    });
  }

  /* ------------------------------------------------------------------- boot */
  H.ready(() => {
    H.boot(() => {
      renderEngine();
      renderContext();
      renderPrompts();
      resetSession();
      setupRecognition();
      renderVoiceState();

      $("#disclaimer").textContent = (window.HELMLocalAdvisor ? window.HELMLocalAdvisor.DISCLAIMER : "Not medical advice.") +
        " Answers are produced on board from the crew's own model and knowledge files; nothing is sent to an external AI service.";

      $("#resetBtn").innerHTML = icon("refresh");
      $("#resetBtn").addEventListener("click", () => { resetSession(); H.toast("Session cleared", "ok"); });

      $("#voiceToggle").addEventListener("click", () => {
        autoSpeak = !autoSpeak;
        if (!autoSpeak) stopSpeak();
        renderVoiceState();
      });

      const input = $("#input");
      input.addEventListener("input", () => autosize(input));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          ask(input.value);
        }
      });

      $("#sendBtn").addEventListener("click", () => ask(input.value));
      setSendState(false);

      $("#suggest").addEventListener("click", (e) => {
        const b = e.target.closest("[data-prompt]");
        if (b) ask(b.dataset.prompt);
      });

      // voices arrive asynchronously on most browsers
      if ("speechSynthesis" in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        setTimeout(loadVoices, 600);
      }

      H.on((what) => {
        if (what === "data" || what === "sync" || what === "mode") {
          renderEngine();
          renderContext();
        }
      });

      input.focus({ preventScroll: true });
    });
  });

  /* Keep the page honest if the engine changes while the crew is reading. */
  setInterval(() => {
    if (!document.getElementById("enginePill")) return;
    const want = engine().key;
    if (want !== renderEngine._last) {
      renderEngine._last = want;
      renderEngine();
    }
  }, 4000);
})();
