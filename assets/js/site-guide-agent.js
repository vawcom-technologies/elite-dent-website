(() => {
  const MUTE_KEY = "elitedent-guide-muted";
  const LANG_KEY = "elitedent-ui-lang";
  const INTRO_KEY = "elitedent-gru-intro";
  const pack = window.ELITEDENT_GUIDE || {};
  const DEFAULT_SCRIPT = pack.DEFAULT || { title: { de: "Seitenführung", en: "Page guide" }, steps: [] };
  const SCRIPTS = pack.SCRIPTS || {};
  const HUB = pack.HUB || {};

  // German lines are studio recordings (assets/audio/guide/<page>/<id>.de.mp3), keyed by their text.
  // Anything without a file, and all English, still comes from the Piper endpoint.
  const RECORDED = new Map();
  const recordedUrls = new Set();
  (() => {
    const add = (folder, step) => {
      if (step?.id && step.text?.de) RECORDED.set(step.text.de, `/assets/audio/guide/${folder}/${step.id}.de.mp3`);
    };
    for (const [path, sc] of Object.entries(SCRIPTS)) {
      const folder = path === "/" ? "home" : path.replace(/^\//, "");
      sc.steps.forEach((step) => add(folder, step));
    }
    DEFAULT_SCRIPT.steps.forEach((step) => add("shared", step));
    Object.values(HUB).forEach((node) => add("shared", node));
  })();

  function normalizePath(pathname) {
    const trimmed = pathname.replace(/\/index\.html$/i, "").replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
  }

  // Hub questions ride along as steps so they use the same voice pipeline
  function getScript(pathname) {
    const found = SCRIPTS[normalizePath(pathname)] || DEFAULT_SCRIPT;
    for (const node of Object.values(HUB)) {
      if (!found.steps.some((step) => step.id === node.id)) {
        found.steps.push({ id: node.id, when: "hub", text: node.text });
      }
    }
    return found;
  }

  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function writeMuted(muted) {
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (_) {}
  }

  function readLang() {
    try {
      return localStorage.getItem(LANG_KEY) === "en" ? "en" : "de";
    } catch (_) {
      return "de";
    }
  }

  const audio = new Audio();
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.playbackRate = 1.12;

  let playGen = 0;
  let loadedStep = -1; // step index the audio element currently holds
  let wantPaused = false;
  let status = "idle";
  let stepIndex = 0;
  let muted = readMuted();
  let lang = readLang();
  let pathname = location.pathname;
  let script = getScript(pathname);
  let utterance = null;
  let ttsAbort = null;
  const ttsCache = new Map();
  const ttsInflight = new Map();
  let guideOn = false;
  const played = new Set();
  let introActive = false;
  let introBusy = false;
  let hubOpen = false;
  let hubNode = "";
  let repliesKey = "";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let spotlightEls = [];
  let spotlightFadeRaf = 0;
  let userPaused = false;
  let blockedAutoplay = false;
  let gestureArm = null;
  let startArmed = false;
  const MIN_KEY = "elitedent-guide-min";
  let minimized = false;
  try {
    minimized = sessionStorage.getItem(MIN_KEY) === "1";
  } catch (_) {}

  audio.muted = muted;

  const hub = document.createElement("div");
  hub.className = "guide-hub notranslate";
  hub.setAttribute("translate", "no");
  hub.setAttribute("aria-hidden", "true");
  hub.inert = true;

  const root = document.createElement("aside");
  root.className = "site-guide";
  root.innerHTML =
    '<button type="button" class="site-guide__close"></button>' +
    '<button type="button" class="site-guide__open"></button>' +
    '<div class="site-guide__avatar has-model" aria-hidden="true">' +
    '<img class="site-guide__face site-guide__face--large" src="/assets/images/guide/erlan-large.webp?v=1" alt="" width="1600" height="1200" decoding="async" />' +
    '<img class="site-guide__face site-guide__face--small" src="/assets/images/guide/erlan-small.webp?v=1" alt="" width="256" height="256" decoding="async" />' +
    '<model-viewer class="site-guide__model" src="/assets/images/guide/nurse.glb?v=2" camera-target="0m 1.5m 0m" camera-orbit="0deg 88deg 0.8m" min-camera-orbit="auto auto 0.1m" max-camera-orbit="auto auto 10m" field-of-view="30deg" interpolation-decay="80" interaction-prompt="none" disable-tap loading="eager"></model-viewer>' +
    "</div>" +
    '<div class="site-guide__body">' +
    '<img class="site-guide__media" alt="" decoding="async" hidden />' +
    '<p class="site-guide__kicker"></p>' +
    '<p class="site-guide__line" aria-live="polite"></p>' +
    '<div class="site-guide__replies" role="group" hidden></div>' +
    '<div class="site-guide__controls">' +
    '<button type="button" class="site-guide__btn site-guide__btn--play"></button>' +
    '<button type="button" class="site-guide__btn site-guide__btn--mute"></button>' +
    '<button type="button" class="site-guide__btn site-guide__btn--topics"></button>' +
    "</div></div>";

  const avatar = root.querySelector(".site-guide__avatar");
  const media = root.querySelector(".site-guide__media");
  const kicker = root.querySelector(".site-guide__kicker");
  const line = root.querySelector(".site-guide__line");
  const replies = root.querySelector(".site-guide__replies");
  const playBtn = root.querySelector(".site-guide__btn--play");
  const muteBtn = root.querySelector(".site-guide__btn--mute");
  const closeBtn = root.querySelector(".site-guide__close");
  const openBtn = root.querySelector(".site-guide__open");
  const topicsBtn = root.querySelector(".site-guide__btn--topics");

  const ICON_PAUSE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1"/><rect x="13.5" y="5" width="4.5" height="14" rx="1"/></svg>';
  const ICON_PLAY =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const ICON_MUTE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.5L12 18V6L7.5 10H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  const ICON_UNMUTE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3.5L12 18V6L7.5 10H4z"/><path d="M16 9.5a4.5 4.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  const ICON_CLOSE =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>';
  const ICON_TOPICS =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="2.2" rx="1.1"/><rect x="4" y="10.9" width="16" height="2.2" rx="1.1"/><rect x="4" y="16.3" width="10" height="2.2" rx="1.1"/></svg>';

  function stepText(step) {
    return step ? step.text[lang] : "";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function renderReplies() {
    const node = HUB[hubNode];
    const key = hubOpen && node ? hubNode + lang : "";
    replies.hidden = !key;
    root.classList.toggle("has-replies", !!key);
    if (key === repliesKey) return;
    repliesKey = key;
    replies.setAttribute("aria-label", lang === "en" ? "Your answer" : "Ihre Antwort");
    replies.innerHTML = key
      ? node.replies
          .map(
            (reply, i) =>
              '<button type="button" class="site-guide__reply' +
              (reply.close || reply.back ? " site-guide__reply--quiet" : "") +
              '" data-reply="' +
              i +
              '">' +
              escapeHtml(reply.label[lang]) +
              "</button>",
          )
          .join("")
      : "";
  }

  // render() runs on every scroll tick; rewriting a button's children each time restarts its hover/press
  // state and can swallow a click that is in progress, so only touch the DOM when the markup changed.
  function setIcon(el, html) {
    if (el._icon === html) return;
    el._icon = html;
    el.innerHTML = html;
  }

  function render() {
    const playing = status === "playing" || status === "loading";
    const en = lang === "en";
    const step = script.steps[stepIndex];
    const pageSteps = script.steps.filter((s) => s.when !== "hub" && !s.intro);
    root.setAttribute("aria-label", en ? "Page guide" : "Seitenführung");
    kicker.hidden = hubOpen;
    kicker.innerHTML = hubOpen
      ? ""
      : script.title[lang] + "<span>" + (pageSteps.indexOf(step) + 1 || 1) + "/" + pageSteps.length + "</span>";
    const question = HUB[hubNode] ? stepText(script.steps.find((s) => s.id === HUB[hubNode].id)) : "";
    const waiting =
      status === "idle" &&
      guideOn &&
      !userPaused &&
      !hubOpen &&
      script.steps.some((s) => s.when && s.when !== "start" && s.when !== "hub" && !played.has(s.id));
    root.classList.toggle("is-waiting", waiting);
    line.textContent = hubOpen && (status === "idle" || status === "ended")
      ? question
      : waiting
        ? en
          ? "Scroll down when you're ready. I'll carry on at the next section."
          : "Scrollen Sie weiter, wenn Sie so weit sind. Beim nächsten Abschnitt erzähle ich weiter."
      : status === "idle"
        ? en
          ? "Start the page guide"
          : "Seitenführung starten"
        : status === "ended"
          ? en
            ? "Guide finished"
            : "Führung beendet"
          : stepText(step) || (en ? "Start the page guide" : "Seitenführung starten");

    const image = !hubOpen && status !== "idle" && status !== "ended" ? step?.image : "";
    if (image) {
      if (media.getAttribute("src") !== image) media.src = image;
      media.hidden = false;
    } else {
      media.hidden = true;
    }
    root.classList.toggle("has-media", !!image);

    avatar.classList.toggle("is-talking", status === "playing");
    setIcon(playBtn, playing ? ICON_PAUSE : ICON_PLAY);
    playBtn.setAttribute("aria-label", playing ? "Pause" : en ? "Resume" : "Fortsetzen");
    setIcon(muteBtn, muted ? ICON_MUTE : ICON_UNMUTE);
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? (en ? "Unmute" : "Ton an") : en ? "Mute" : "Stumm");
    setIcon(closeBtn, ICON_CLOSE);
    closeBtn.setAttribute("aria-label", en ? "Move guide aside" : "Begleitung zur Seite legen");
    root.classList.toggle("is-min", minimized && !hubOpen);
    openBtn.hidden = !(minimized && !hubOpen);
    openBtn.setAttribute("aria-label", en ? "Open the guide" : "Begleitung öffnen");
    setIcon(topicsBtn, ICON_TOPICS);
    topicsBtn.setAttribute("aria-label", en ? "Where to next?" : "Wohin als Nächstes?");
    renderReplies();
  }

  function disarmGestureResume() {
    gestureArm?.abort();
    gestureArm = null;
    startArmed = false;
  }

  function audioIsLive() {
    return status === "playing" && !audio.paused && !!audio.src;
  }

  function kickFromGesture() {
    if (userPaused) return;
    if (!audio.paused && audio.muted && !muted) {
      audio.muted = false;
      blockedAutoplay = false;
      disarmGestureResume();
      status = "playing";
      render();
      return;
    }
    if (audioIsLive()) return;
    if (audio.src && blockedAutoplay) {
      audio.muted = muted;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(
          () => {
            blockedAutoplay = false;
            disarmGestureResume();
            status = "playing";
            render();
          },
          () => beginFromGesture(),
        );
        return;
      }
    }
    beginFromGesture();
  }

  function armGestureResume() {
    if (userPaused || startArmed) return;
    blockedAutoplay = true;
    startArmed = true;
    gestureArm = new AbortController();
    const opts = { capture: true, signal: gestureArm.signal };
    const kick = (event) => {
      if (event.target?.closest?.(".site-guide__reply, .site-guide__btn")) return;
      kickFromGesture();
    };
    window.addEventListener("pointerdown", kick, opts);
    window.addEventListener("touchstart", kick, opts);
    window.addEventListener("click", kick, opts);
    window.addEventListener("keydown", kick, opts);
  }

  function warmText(text) {
    const key = lang + "\n" + text;
    if (ttsCache.has(key)) return Promise.resolve(ttsCache.get(key));
    const pending = ttsInflight.get(key);
    if (pending) return pending;
    const job = (async () => {
      // Bump v whenever the voice or its speed changes, so the CDN doesn't serve old audio
      const file = lang === "de" ? RECORDED.get(text) : null;
      if (file) {
        const rec = await fetch(file).catch(() => null);
        if (rec?.ok) {
          const recUrl = URL.createObjectURL(await rec.blob());
          recordedUrls.add(recUrl);
          ttsCache.set(key, recUrl);
          return recUrl;
        }
      }
      const url = `/api/tts?v=4&lang=${lang}&text=${encodeURIComponent(text)}`;
      let res = await fetch(url);
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 600));
        res = await fetch(url);
      }
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob) return null;
      if (ttsCache.has(key)) return ttsCache.get(key);
      const objUrl = URL.createObjectURL(blob);
      ttsCache.set(key, objUrl);
      return objUrl;
    })()
      .catch(() => null)
      .finally(() => {
        ttsInflight.delete(key);
      });
    ttsInflight.set(key, job);
    return job;
  }

  function openingStepIndex() {
    if (wantsIntro()) {
      return script.steps.findIndex(
        (step) => step.intro && (!step.when || step.when === "start"),
      );
    }
    return firstStartIndex();
  }

  /** Call only from a real click/tap handler — plays cached audio with no await. */
  function beginFromGesture() {
    userPaused = false;
    wantPaused = false;
    blockedAutoplay = false;
    disarmGestureResume();

    if (audioIsLive()) return true;

    const index = openingStepIndex();
    if (index < 0) {
      void autoStartGuide();
      return false;
    }

    const step = script.steps[index];
    if (step.intro && !introActive && wantsIntro()) {
      introActive = true;
      openHub();
    }

    guideOn = true;
    const gen = ++playGen;
    stepIndex = index;
    status = "playing";
    render();

    const text = stepText(step);
    const cached = text ? ttsCache.get(lang + "\n" + text) : null;
    if (cached) {
      root.dataset.voice = "piper";
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      utterance = null;
      audio.playbackRate = recordedUrls.has(cached) ? 1 : 1.12;
      audio.muted = muted;
      audio.src = cached;
      loadedStep = index;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise.then(
          () => {
            if (wantPaused || gen !== playGen) audio.pause();
          },
          () => {
            if (gen !== playGen) return;
            void playStep(index);
          },
        );
      }
      return true;
    }

    void playStep(index);
    return false;
  }

  function clearSpotlight() {
    if (spotlightFadeRaf) {
      cancelAnimationFrame(spotlightFadeRaf);
      spotlightFadeRaf = 0;
    }
    document.documentElement.classList.remove("is-guide-spotlighting");
    for (const el of spotlightEls) el.classList.remove("is-guide-spotlight");
    spotlightEls = [];
  }

  function setSpotlight(step) {
    clearSpotlight();
    if (muted) return;
    if (!step?.spotlight || status !== "playing") return;
    const nodes = document.querySelectorAll(step.spotlight);
    if (!nodes.length) return;
    nodes.forEach((el) => {
      el.classList.add("is-guide-spotlight");
      spotlightEls.push(el);
    });
    // Transparent ring first, then fade in once paint has committed
    spotlightFadeRaf = requestAnimationFrame(() => {
      spotlightFadeRaf = requestAnimationFrame(() => {
        spotlightFadeRaf = 0;
        if (!spotlightEls.length || muted || status !== "playing") return;
        document.documentElement.classList.add("is-guide-spotlighting");
      });
    });
  }

  function stopNow() {
    playGen += 1;
    wantPaused = true;
    utterance = null;
    ttsAbort?.abort();
    ttsAbort = null;
    audio.pause();
    audio.removeAttribute("src");
    try {
      audio.load();
    } catch (_) {}
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    clearSpotlight();
  }

  function applyPath(nextPath) {
    if (normalizePath(nextPath) === normalizePath(pathname) && script === getScript(nextPath)) {
      pathname = nextPath;
      return;
    }
    stopNow();
    pathname = nextPath;
    script = getScript(nextPath);
    status = "idle";
    stepIndex = 0;
    guideOn = false;
    played.clear();
    introActive = false;
    introBusy = false;
    if (hubOpen) void closeHub();
    document.documentElement.classList.remove("is-gru-intro-pending");
    clearSpotlight();
    render();
    observeSections();
    scheduleAutoStart();
  }

  /** Which script step matches the section the visitor is actually looking at. */
  function focusedSectionIndex() {
    const vh = window.innerHeight;
    const focusY = vh * 0.32;
    let best = -1;
    let bestScore = -Infinity;
    const activeId = document.querySelector(".service-article.is-active[id]")?.id;

    for (let i = 0; i < script.steps.length; i += 1) {
      const step = script.steps[i];
      if (!step.when || step.when === "start" || step.when === "hub") continue;

      let rect = null;
      document.querySelectorAll(step.when).forEach((el) => {
        const next = el.getBoundingClientRect();
        if (next.bottom <= 88 || next.top >= vh - 48) return;
        if (!rect) {
          rect = next;
          return;
        }
        const mid = (a) => (a.top + a.bottom) / 2;
        if (Math.abs(mid(next) - focusY) < Math.abs(mid(rect) - focusY)) rect = next;
      });
      if (!rect) continue;

      let score;
      const inFocusBand = rect.top <= focusY && rect.bottom >= focusY;
      if (inFocusBand) {
        score = 2000 - Math.abs(rect.top - focusY * 0.35);
      } else if (rect.top > focusY) {
        score = 1000 - (rect.top - focusY);
      } else {
        score = 1000 - (focusY - rect.bottom);
      }
      const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
      score += Math.min(visible, vh) * 0.02;

      // Jump-nav active article is a hint only when it is actually in the focus band
      if (activeId && step.when === `#${activeId}` && inFocusBand) {
        score += 350;
      }

      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  // Once per browser session, matching the splash
  function introSeen() {
    try {
      return sessionStorage.getItem(INTRO_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markIntroSeen() {
    introDone = true;
    lang = readLang();
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch (_) {}
  }

  // Skip only when coming back to Home from inside the site after seeing it
  function cameFromSite() {
    if (performance.getEntriesByType?.("navigation")[0]?.type === "reload") return false;
    try {
      return new URL(document.referrer).origin === location.origin;
    } catch (_) {
      return false;
    }
  }
  const introOnThisLoad = !introSeen() || !cameFromSite();
  let introDone = false;

  function wantsIntro() {
    return normalizePath(pathname) === "/" && introOnThisLoad && !introDone;
  }
  // The welcome popup always speaks German; the saved language takes over once it closes
  if (wantsIntro()) lang = "de";

  const FLY_MS = 520;
  const FLY_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

  function guideBox(el) {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }

  function collapseTo(commit) {
    if (reducedMotion) {
      commit();
      return Promise.resolve();
    }

    const from = guideBox(root);
    const ghost = root.cloneNode(true);
    ghost.classList.add("is-flying");
    ghost.classList.remove("is-intro-boot");
    ghost.setAttribute("aria-hidden", "true");
    // A second live WebGL viewer would flash in; fly a still of the current pose instead
    const ghostModel = ghost.querySelector(".site-guide__model");
    if (ghostModel) {
      let still = "";
      try {
        if (avatarModel?.loaded) still = avatarModel.toDataURL("image/png");
      } catch (_) {}
      if (still) {
        const img = new Image();
        img.className = "site-guide__model";
        img.alt = "";
        img.src = still;
        ghostModel.replaceWith(img);
      } else {
        ghostModel.remove();
      }
    }
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      right: "auto",
      bottom: "auto",
      transform: "translate3d(0,0,0)",
      transformOrigin: "50% 50%",
      margin: "0",
      zIndex: "43",
      willChange: "transform, opacity",
      pointerEvents: "none",
    });
    document.body.appendChild(ghost);

    root.classList.add("is-flying");
    root.style.opacity = "0";
    commit();
    const dest = guideBox(root);

    const dx = dest.cx - from.cx;
    const dy = dest.cy - from.cy;
    const sx = dest.width / Math.max(1, from.width);
    const sy = dest.height / Math.max(1, from.height);

    const fly =
      typeof ghost.animate === "function"
        ? ghost.animate(
            [
              { transform: "translate3d(0,0,0) scale(1, 1)", opacity: 1 },
              { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`, opacity: 0 },
            ],
            { duration: FLY_MS, easing: FLY_EASE, fill: "forwards" },
          )
        : null;
    const show =
      typeof root.animate === "function"
        ? root.animate([{ opacity: 0 }, { opacity: 0, offset: 0.62 }, { opacity: 1 }], {
            duration: FLY_MS,
            easing: "ease-out",
            fill: "forwards",
          })
        : null;

    const wait = Promise.all([
      fly ? fly.finished.catch(() => {}) : Promise.resolve(),
      show ? show.finished.catch(() => {}) : Promise.resolve(),
    ]);

    return wait.then(() => {
      try {
        fly?.cancel();
        show?.cancel();
      } catch (_) {}
      ghost.remove();
      root.style.opacity = "";
      root.classList.remove("is-flying");
    });
  }

  function setMinimized(value) {
    minimized = value;
    try {
      if (value) sessionStorage.setItem(MIN_KEY, "1");
      else sessionStorage.removeItem(MIN_KEY);
    } catch (_) {}
  }

  function minimize() {
    stopNow();
    userPaused = true;
    status = "idle";
    setMinimized(true);
    render();
  }

  function restore() {
    setMinimized(false);
    resume();
    render();
  }

  function openHub() {
    if (hubOpen) return;
    setMinimized(false);
    hubOpen = true;
    hubNode = "";
    document.documentElement.classList.remove("is-gru-intro-pending");
    document.documentElement.classList.add("is-gru-intro");
    hub.removeAttribute("aria-hidden");
    hub.inert = false;
    root.classList.add("is-intro", "is-intro-boot");
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove("is-intro-boot"));
    render();
  }

  function closeHub() {
    if (!hubOpen || introBusy) return Promise.resolve();
    introBusy = true;
    hubOpen = false;
    document.documentElement.classList.remove("is-gru-intro", "is-gru-intro-pending");
    hub.setAttribute("aria-hidden", "true");
    hub.inert = true;
    return collapseTo(() => {
      if (introActive) {
        introActive = false;
        markIntroSeen();
      }
      root.classList.remove("is-intro", "is-intro-boot");
      render();
    }).finally(() => {
      introBusy = false;
    });
  }

  function leaveHub() {
    stopNow();
    closeHub().then(() => {
      guideOn = true;
      userPaused = false;
      status = "idle";
      render();
      checkScroll();
    });
  }

  function askHub(key) {
    if (!HUB[key]) return;
    hubNode = key;
    const index = script.steps.findIndex((step) => step.id === HUB[key].id);
    userPaused = false;
    if (index >= 0) playStep(index);
    else render();
  }

  function answerHub(reply) {
    if (reply.go) askHub(reply.go);
    else if (reply.href) selectTopic(reply.href);
    else if (reply.close) leaveHub();
  }

  function stepForHash(hash) {
    if (!hash) return -1;
    return script.steps.findIndex((step) => step.when === hash);
  }

  function selectTopic(href) {
    const url = new URL(href, location.href);
    markIntroSeen();
    if (normalizePath(url.pathname) !== normalizePath(location.pathname)) {
      stopNow();
      location.href = url.href;
      return;
    }
    stopNow();
    closeHub().then(() => {
      guideOn = true;
      userPaused = false;
      if (url.hash) {
        history.replaceState(null, "", url.hash);
        document.querySelector(url.hash)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      }
      const index = url.hash ? stepForHash(url.hash) : firstStartIndex();
      if (index >= 0) playStep(index);
      else {
        status = "idle";
        render();
      }
    });
  }

  function startIntro() {
    if (introActive || !wantsIntro()) return;
    introActive = true;
    openHub();
    guideOn = true;
    const start = script.steps.findIndex(
      (step) => step.intro && (!step.when || step.when === "start"),
    );
    if (start >= 0) playStep(start);
    else askHub("start");
  }

  function scheduleIntro() {
    if (!wantsIntro()) {
      document.documentElement.classList.remove("is-gru-intro-pending");
      return;
    }
    document.documentElement.classList.add("is-gru-intro-pending");
    startIntro();
  }

  function afterLine() {
    clearSpotlight();
    const step = script.steps[stepIndex];
    const continueNext = () => {
      const ahead = focusedSectionIndex();
      // Only jump ahead when the visitor has already moved to another section
      if (ahead >= 0 && ahead !== stepIndex) {
        playStep(ahead);
        return;
      }
      const next = script.steps[stepIndex + 1];
      if (next && (!next.when || next.when === "start")) {
        playStep(stepIndex + 1);
        return;
      }
      status = next && next.when !== "hub" ? "idle" : "ended";
      render();
      checkScroll();
    };

    if (hubOpen) {
      const next = script.steps[stepIndex + 1];
      if (step?.intro && next?.intro) {
        playStep(stepIndex + 1);
        return;
      }
      if (step?.intro) {
        askHub("start");
        return;
      }
      // Wait for an answer
      status = "ended";
      render();
      return;
    }
    continueNext();
  }

  function checkScroll() {
    if (!guideOn || introActive || hubOpen || userPaused) return;
    if (status === "paused" && !blockedAutoplay) return;
    const index = focusedSectionIndex();
    if (index < 0) return;
    if (stepIndex === index && (status === "playing" || status === "loading")) return;
    if (stepIndex === index && status === "idle" && played.has(script.steps[index]?.id)) {
      render();
      return;
    }
    if (status === "playing" || status === "loading") {
      const current = script.steps[stepIndex];
      if (!current?.when || current.when === "start" || current.intro) return;
      // Section in focus changed — switch line + image to match
      stopNow();
    }
    playStep(index);
  }

  function firstStartIndex() {
    const skipIntro = introSeen() && !introActive;
    return script.steps.findIndex(
      (step) =>
        (!step.when || step.when === "start") &&
        !played.has(step.id) &&
        !(skipIntro && step.intro),
    );
  }

  function prefetchOpening() {
    const jobs = [];
    let n = 0;
    for (const step of script.steps) {
      if (n >= 4) break;
      if (step.when && step.when !== "start") continue;
      if (introSeen() && step.intro && !wantsIntro()) continue;
      const text = stepText(step);
      if (!text) continue;
      n += 1;
      jobs.push(warmText(text));
    }
    if (wantsIntro() && HUB.start) jobs.push(warmText(HUB.start.text[lang]));
    return Promise.all(jobs);
  }

  async function autoStartGuide() {
    userPaused = false;
    wantPaused = false;
    blockedAutoplay = false;
    if (wantsIntro()) {
      // Open straight away; the voice lines load while the first one is on screen
      void prefetchOpening();
      scheduleIntro();
      return;
    }
    document.documentElement.classList.remove("is-gru-intro-pending");
    if (minimized) {
      userPaused = true;
      render();
      return;
    }
    guideOn = true;
    const topic = stepForHash(location.hash);
    if (topic >= 0) {
      void playStep(topic);
      return;
    }
    await prefetchOpening();
    if (userPaused) return;
    const start = firstStartIndex();
    if (start >= 0) {
      void playStep(start);
      queueMicrotask(checkScroll);
      return;
    }
    checkScroll();
  }

  function scheduleAutoStart() {
    void prefetchOpening();
    afterSplash(() => {
      void autoStartGuide();
    });
  }

  window.EliteDentGuide = {
    beginFromGesture,
    autoStart: () => {
      void autoStartGuide();
    },
    prefetch: () => prefetchOpening(),
  };

  function waitCanPlay(gen) {
    if (audio.readyState >= 3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const ok = () => {
        cleanup();
        resolve();
      };
      const bad = () => {
        cleanup();
        reject(new Error("audio error"));
      };
      const cleanup = () => {
        audio.removeEventListener("canplaythrough", ok);
        audio.removeEventListener("loadeddata", ok);
        audio.removeEventListener("error", bad);
      };
      audio.addEventListener("canplaythrough", ok);
      audio.addEventListener("loadeddata", ok);
      audio.addEventListener("error", bad);
      if (gen !== playGen) {
        cleanup();
        resolve();
      }
      setTimeout(() => {
        cleanup();
        resolve();
      }, 2500);
    });
  }

  async function playAudioSrc(src, gen) {
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    utterance = null;
    try {
      audio.pause();
    } catch (_) {}
    // Studio recordings play at their natural speed; the 1.12x is only for the slower Piper voice
    audio.playbackRate = recordedUrls.has(src) ? 1 : 1.12;
    audio.muted = muted;
    audio.src = src;
    loadedStep = stepIndex;
    try {
      audio.load();
    } catch (_) {}

    try {
      await waitCanPlay(gen);
    } catch (_) {
      if (gen !== playGen) return;
    }
    if (gen !== playGen || wantPaused) return;

    // Try unmuted autoplay first (works on localhost / engaged sites)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (gen !== playGen || wantPaused) return;
      try {
        audio.muted = muted;
        await audio.play();
        blockedAutoplay = false;
        disarmGestureResume();
        return;
      } catch (err) {
        if (gen !== playGen) return;
        if (err && err.name === "AbortError") return;
        if (err && err.name === "NotAllowedError") break;
        await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
      }
    }

    if (gen !== playGen || wantPaused) return;

    // Last autoplay attempt: briefly start muted (always allowed), then unmute
    if (!muted) {
      try {
        audio.muted = true;
        await audio.play();
        audio.muted = false;
        // If the browser silently keeps it muted, treat as blocked
        if (!audio.paused) {
          blockedAutoplay = Boolean(audio.muted && !muted);
          if (blockedAutoplay) armGestureResume();
          else disarmGestureResume();
          return;
        }
        audio.pause();
        audio.muted = muted;
      } catch (_) {
        try {
          audio.pause();
          audio.muted = muted;
        } catch (_) {}
      }
    }

    if (gen !== playGen || wantPaused) return;
    holdForGesture();
  }

  function holdForGesture() {
    status = "paused";
    blockedAutoplay = true;
    clearSpotlight();
    render();
    if (!userPaused) armGestureResume();
  }

  async function playStep(index) {
    if (index >= script.steps.length) {
      status = "ended";
      render();
      return;
    }
    if (index < 0) return;

    const gen = ++playGen;
    wantPaused = false;
    const step = script.steps[index];
    if (!step) {
      status = "ended";
      render();
      return;
    }
    guideOn = true;
    status = "loading";
    stepIndex = index;
    render();

    if (step.src) {
      root.dataset.voice = "file";
      status = "playing";
      render();
      await playAudioSrc(step.src, gen);
      return;
    }

    const text = stepText(step);
    let src = null;
    if (text) {
      try {
        src = await warmText(text);
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    if (gen !== playGen || wantPaused) return;
    if (src) {
      root.dataset.voice = "piper";
      status = "playing";
      render();
      setSpotlight(step);
      await playAudioSrc(src, gen);
      return;
    }

    // No voice available: show the line long enough to read, then carry on
    root.dataset.voice = "text";
    if (audio.paused) audio.removeAttribute("src");
    if (step.id) played.add(step.id);
    status = "playing";
    render();
    setSpotlight(step);
    const words = text ? text.split(/\s+/).length : 0;
    setTimeout(() => {
      if (gen === playGen && !wantPaused && status === "playing") afterLine();
    }, Math.max(2500, words * 330));
  }

  function pause() {
    if (status !== "playing" && status !== "loading") return;
    userPaused = true;
    blockedAutoplay = false;
    disarmGestureResume();
    wantPaused = true;
    ttsAbort?.abort();
    audio.pause();
    if (typeof speechSynthesis !== "undefined") speechSynthesis.pause();
    status = "paused";
    clearSpotlight();
    render();
  }

  function resume() {
    userPaused = false;
    blockedAutoplay = false;
    disarmGestureResume();
    if (status === "idle" || status === "ended") {
      if (status === "ended") played.clear();
      guideOn = true;
      if (status === "idle" && played.size) {
        checkScroll();
        if (status === "playing") return;
      }
      const start = firstStartIndex();
      if (start < 0) {
        checkScroll();
        // Nothing new in view: replay the current line instead of ignoring the click
        if (status === "idle") playStep(stepIndex);
        return;
      }
      playStep(start);
      queueMicrotask(checkScroll);
      return;
    }
    if (status !== "paused") return;

    const gen = playGen;
    wantPaused = false;
    status = "playing";
    render();

    // Only resume audio that belongs to this line; after a pause during loading it can still be the previous one
    if (audio.src && !audio.ended && loadedStep === stepIndex) {
      audio.muted = muted;
      audio.play().then(
        () => {
          if (wantPaused || gen !== playGen) audio.pause();
        },
        (err) => {
          if (gen !== playGen) return;
          if (err && err.name === "AbortError") return;
          status = "paused";
          clearSpotlight();
          render();
          if (!userPaused) armGestureResume();
        },
      );
      return;
    }

    // No buffered audio (TTS failed earlier) — fetch again
    playStep(stepIndex);
  }

  function toggleMute() {
    muted = !muted;
    writeMuted(muted);
    audio.muted = muted;
    if (utterance) utterance.volume = muted ? 0 : 1;
    if (muted) {
      clearSpotlight();
    } else if (status === "playing" && !audio.paused) {
      setSpotlight(script.steps[stepIndex]);
    }
    render();
  }

  // 3D AVATAR: start talking animation / begin viseme stream
  audio.onplay = () => {
    const step = script.steps[stepIndex];
    if (step?.id) played.add(step.id);
    blockedAutoplay = false;
    disarmGestureResume();
    status = "playing";
    setSpotlight(step);
    render();
  };

  // 3D AVATAR: freeze current mouth pose; do not reset the clip
  audio.onpause = () => {
    if (audio.ended || utterance) return;
    if (status === "playing") {
      status = "paused";
      clearSpotlight();
      render();
    }
  };

  // 3D AVATAR: rest pose, then the next line starts
  audio.onended = () => {
    afterLine();
  };

  // 3D AVATAR: map audio.currentTime → viseme / jaw open
  audio.ontimeupdate = () => {
    void audio.currentTime;
  };

  playBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (status === "playing" || status === "loading") {
      pause();
      return;
    }
    if (hubOpen && hubNode && status !== "paused") {
      askHub(hubNode);
      return;
    }
    resume();
  });
  muteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMute();
  });
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (hubOpen) leaveHub();
    else minimize();
  });
  openBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    restore();
  });
  topicsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    stopNow();
    openHub();
    askHub("start");
  });
  replies.addEventListener("click", (event) => {
    event.stopPropagation();
    const button = event.target.closest(".site-guide__reply");
    const reply = button && HUB[hubNode]?.replies[Number(button.dataset.reply)];
    if (!reply) return;
    stopNow();
    answerHub(reply);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && hubOpen) leaveHub();
  });

  document.querySelector(".lang-toggle")?.addEventListener("click", () => {
    if (wantsIntro()) return;
    lang = readLang();
    render();
  });

  window.addEventListener("pagehide", stopNow);
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    stopNow();
    status = "idle";
    stepIndex = 0;
    guideOn = false;
    played.clear();
    clearSpotlight();
    render();
    scheduleAutoStart();
  });
  window.addEventListener("popstate", () => applyPath(location.pathname));
  window.addEventListener("scroll", checkScroll, { passive: true });
  window.addEventListener("elitedent:service-section", () => {
    queueMicrotask(checkScroll);
  });
  window.addEventListener("hashchange", () => {
    const topic = stepForHash(location.hash);
    if (topic >= 0 && guideOn && !hubOpen && !userPaused) {
      if (status === "playing" || status === "loading") stopNow();
      playStep(topic);
      return;
    }
    checkScroll();
  });

  let sectionObserver = null;
  function observeSections() {
    if (!("IntersectionObserver" in window)) return;
    sectionObserver?.disconnect();
    sectionObserver = new IntersectionObserver(() => checkScroll(), {
      threshold: [0.15, 0.35, 0.55],
      rootMargin: "0px 0px -12% 0px",
    });
    script.steps.forEach((step) => {
      if (!step.when || step.when === "start" || step.when === "hub") return;
      document.querySelectorAll(step.when).forEach((el) => sectionObserver.observe(el));
    });
  }
  observeSections();

  render();

  function afterSplash(fn) {
    const splash = document.getElementById("splash");
    const home = document.getElementById("app");
    if (
      document.documentElement.classList.contains("no-splash") ||
      !splash ||
      splash.classList.contains("is-done") ||
      home?.classList.contains("is-splash-complete")
    ) {
      fn();
      return;
    }
    document.addEventListener("elitedent:splash-complete", fn, { once: true });
  }

  function mount() {
    if (!document.body.contains(hub)) document.body.appendChild(hub);
    if (!document.body.contains(root)) document.body.appendChild(root);
    if (wantsIntro()) document.documentElement.classList.add("is-gru-intro-pending");
    observeSections();
    // Hovered links are prerendered; don't make voice requests for a page nobody has opened yet
    if (document.prerendering) {
      document.addEventListener("prerenderingchange", scheduleAutoStart, { once: true });
    } else {
      scheduleAutoStart();
    }
  }
  // 3D AVATAR: the model has no rig, so her head and hair are hinged at the neck and animated
  // directly (nod while talking, glances, small tilts, turning toward the cursor). The camera
  // itself stays level, so the figure never moves up and down.
  const MODEL_VIEWER = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
  const avatarModel = avatar.querySelector(".site-guide__model");
  // Framing: face in the small bubble, head and shoulders in the full-screen intro
  const AVATAR_FRAME = { small: { radius: 0.8, y: 1.5 }, intro: { radius: 1.15, y: 1.47 } };
  // The head mesh includes the neck and upper chest skin, which overlaps the shirt collar. Rotating the
  // whole mesh made that skin slide over the shirt, so the bend is done per vertex in the shader instead:
  // everything below the collar stays put and the rotation fades in over the neck (y = NECK_FIXED..NECK_FREE, all below the chin).
  const NECK = [0, 1.3, -0.02];
  const NECK_FIXED = 1.27;
  const NECK_FREE = 1.37; // chin starts at y=1.38, so the whole head and face move as one piece

  // model-viewer keeps its three.js scene behind a symbol; there is no public node API
  function avatarHead() {
    const sym = Object.getOwnPropertySymbols(avatarModel).find((s) => s.description === "scene");
    const scene = sym && avatarModel[sym];
    const head = scene?.getObjectByName("head");
    const hair = scene?.getObjectByName("hair");
    if (!head || !hair) return null;
    // Detached helper: its rotation matrix is shared with the shader as a uniform
    const neck = new head.parent.constructor();
    const uRot = { value: neck.matrix };
    const bend = (shader) => {
      shader.uniforms.uNeckRot = uRot;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
uniform mat4 uNeckRot;
float neckW(float y) { return smoothstep(${NECK_FIXED.toFixed(3)}, ${NECK_FREE.toFixed(3)}, y); }`
        )
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
objectNormal = normalize(mix(objectNormal, mat3(uNeckRot) * objectNormal, neckW(position.y)));`
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = mix(position, (uNeckRot * vec4(position - vec3(${NECK.join(",")}), 1.0)).xyz + vec3(${NECK.join(",")}), neckW(position.y));`
        );
    };
    for (const mesh of [head, hair]) {
      for (const mat of [].concat(mesh.material)) {
        mat.onBeforeCompile = bend;
        mat.customProgramCacheKey = () => "neckbend";
        mat.needsUpdate = true;
      }
    }
    return { scene, neck };
  }

  function startAvatarModel() {
    if (!avatarModel) return;
    avatar.classList.add("has-3d");
    const fail = () => avatar.classList.remove("has-3d");
    avatarModel.addEventListener("error", fail, { once: true });
    import(MODEL_VIEWER).catch(fail);

    let rig = null;
    avatarModel.addEventListener("load", () => {
      try {
        rig = avatarHead();
      } catch (_) {
        rig = null;
      }
    });

    let cursorX = 0;
    let cursorY = 0;
    let lookX = 0;
    let lookY = 0;
    let talk = 0;
    let glanceX = 0;
    let glanceY = 0;
    let glanceAt = 0;
    let running = false;
    const t0 = performance.now();

    if (!reducedMotion) {
      document.addEventListener(
        "pointermove",
        (e) => {
          if (e.pointerType === "touch") return;
          cursorX = (e.clientX / innerWidth - 0.5) * 2;
          cursorY = (e.clientY / innerHeight - 0.5) * 2;
        },
        { passive: true }
      );
    }

    function tick(now) {
      if (!running) return;
      requestAnimationFrame(tick);
      if (!avatarModel.loaded) return;
      const intro = root.classList.contains("is-intro");
      const frame = intro ? AVATAR_FRAME.intro : AVATAR_FRAME.small;
      avatarModel.cameraOrbit = `0deg 88deg ${frame.radius}m`;
      avatarModel.cameraTarget = `0m ${frame.y}m 0m`;
      if (!rig || reducedMotion) return;

      const t = (now - t0) / 1000;
      // Every few seconds she glances somewhere new, more often while listening than talking
      if (now > glanceAt) {
        glanceX = (Math.random() - 0.5) * 0.5;
        glanceY = (Math.random() - 0.5) * 0.3;
        glanceAt = now + 2500 + Math.random() * 3500;
      }
      talk += ((avatar.classList.contains("is-talking") ? 1 : 0) - talk) * 0.06;
      lookX += (cursorX + glanceX - lookX) * 0.04;
      lookY += (cursorY + glanceY - lookY) * 0.04;

      const nod = talk * (0.03 * Math.sin(t * 10.7) + 0.015 * Math.sin(t * 18.1 + 1.3));
      const emphasis = talk * 0.02 * Math.max(0, Math.sin(t * 1.9));
      rig.neck.rotation.set(
        lookY * 0.08 + nod + emphasis + 0.006 * Math.sin(t * 0.5),
        lookX * 0.24 + talk * 0.02 * Math.sin(t * 2.3),
        0.015 * Math.sin(t * 0.37) + talk * 0.012 * Math.sin(t * 3.1)
      );
      rig.neck.updateMatrix();
      rig.scene.queueRender();
    }

    const setRunning = (on) => {
      if (on === running) return;
      running = on;
      if (on) requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", () => setRunning(!document.hidden));
    setRunning(!document.hidden);
  }
  startAvatarModel();

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
