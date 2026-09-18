(() => {
  const MUTE_KEY = "elitedent-guide-muted";
  const LANG_KEY = "elitedent-ui-lang";
  const INTRO_KEY = "elitedent-gru-intro";
  const GUIDE_VOICE_ID = "onwK4e9ZLuTAKqWW03F9";
  const SKIP_VOICE =
    /female|anna|sandy|shelley|grandma|kathy|karen|moira|samantha|helena|petra|katja|nora|whisper|zarvox|bells|cellos|bubbles|boing|trinoids|jester|junior|princess|organ|superstar|bad news|good news|wobble|bahh|tessa|veena|fiona|zira|victoria/i;
  const PREFER = {
    de: ["reed", "eddy", "rocko", "yannick", "otto", "markus", "stefan", "google deutsch"],
    en: ["daniel", "reed", "eddy", "rocko", "google uk english male", "alex", "microsoft david"],
  };

  function pickMaleVoice(uiLang) {
    const prefix = uiLang === "en" ? "en" : "de";
    const pool = speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith(prefix) && !SKIP_VOICE.test(voice.name));
    for (const name of PREFER[uiLang] || PREFER.de) {
      const hit = pool.find((voice) => voice.name.toLowerCase().includes(name));
      if (hit) return hit;
    }
    return pool.find((voice) => /male|reed|eddy|rocko|daniel|alex/.test(voice.name.toLowerCase())) || null;
  }

  function applyFriendlyMaleVoice(utterance, uiLang) {
    const voice = pickMaleVoice(uiLang);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = uiLang === "en" ? "en-GB" : "de-DE";
    }
    utterance.rate = 0.9;
    utterance.pitch = 0.92;
    return voice;
  }

  const pack = window.ELITEDENT_GUIDE || {};
  const DEFAULT_SCRIPT = pack.DEFAULT || { title: { de: "Seitenführung", en: "Page guide" }, steps: [] };
  const SCRIPTS = pack.SCRIPTS || {};

  function normalizePath(pathname) {
    const trimmed = pathname.replace(/\/index\.html$/i, "").replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
  }

  function getScript(pathname) {
    return SCRIPTS[normalizePath(pathname)] || DEFAULT_SCRIPT;
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
  let flyBusy = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let spotlightEls = [];
  let userPaused = false;
  let blockedAutoplay = false;
  let gestureArm = null;
  let startArmed = false;

  audio.muted = muted;

  const veil = document.createElement("div");
  veil.className = "site-guide-veil";
  veil.setAttribute("aria-hidden", "true");

  const root = document.createElement("aside");
  root.className = "site-guide";
  root.innerHTML =
    '<button type="button" class="site-guide__close"></button>' +
    '<div class="site-guide__avatar" aria-hidden="true"></div>' +
    '<div class="site-guide__body">' +
    '<p class="site-guide__kicker"></p>' +
    '<p class="site-guide__line" aria-live="polite"></p>' +
    '<div class="site-guide__controls">' +
    '<button type="button" class="site-guide__btn site-guide__btn--play"></button>' +
    '<button type="button" class="site-guide__btn site-guide__btn--mute"></button>' +
    "</div></div>";

  const avatar = root.querySelector(".site-guide__avatar");
  const kicker = root.querySelector(".site-guide__kicker");
  const line = root.querySelector(".site-guide__line");
  const playBtn = root.querySelector(".site-guide__btn--play");
  const muteBtn = root.querySelector(".site-guide__btn--mute");
  const closeBtn = root.querySelector(".site-guide__close");

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

  function stepText(step) {
    return step ? step.text[lang] : "";
  }

  function render() {
    const playing = status === "playing" || status === "loading";
    const en = lang === "en";
    const title = introActive ? "Erlan" : script.title[lang];
    const total = introActive
      ? script.steps.filter((step) => step.intro).length || 1
      : script.steps.length;
    const shown = introActive ? 1 : stepIndex + 1;
    root.setAttribute("aria-label", en ? "Page guide" : "Seitenführung");
    kicker.innerHTML = title + "<span>" + shown + "/" + total + "</span>";
    line.textContent =
      status === "idle"
        ? introActive
          ? en
            ? "Hello — meet Gru."
            : "Hallo — lernen Sie Gru kennen."
          : en
            ? "Start the page guide"
            : "Seitenführung starten"
        : status === "ended"
          ? en
            ? "Guide finished"
            : "Führung beendet"
          : stepText(script.steps[stepIndex]) ||
            (en ? "Start the page guide" : "Seitenführung starten");
    avatar.classList.toggle("is-talking", status === "playing");
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute("aria-label", playing ? "Pause" : en ? "Resume" : "Fortsetzen");
    muteBtn.innerHTML = muted ? ICON_MUTE : ICON_UNMUTE;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.setAttribute("aria-label", muted ? (en ? "Unmute" : "Ton an") : en ? "Mute" : "Stumm");
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.setAttribute("aria-label", en ? "Move guide aside" : "Begleitung zur Seite legen");
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
    const kick = () => kickFromGesture();
    window.addEventListener("pointerdown", kick, opts);
    window.addEventListener("touchstart", kick, opts);
    window.addEventListener("click", kick, opts);
    window.addEventListener("keydown", kick, opts);
  }

  async function sha256Hex(value) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function bakedSrc(text) {
    if (!crypto.subtle) return null;
    try {
      const hash = await sha256Hex(`${GUIDE_VOICE_ID}\n${text}`);
      const res = await fetch(`/assets/voice/${hash}.mp3`);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size < 800) return null;
      return URL.createObjectURL(blob);
    } catch (_) {
      return null;
    }
  }

  function warmText(text) {
    const key = lang + "\n" + text;
    if (ttsCache.has(key)) return Promise.resolve(ttsCache.get(key));
    const pending = ttsInflight.get(key);
    if (pending) return pending;
    const job = (async () => {
      const baked = await bakedSrc(text);
      if (baked) {
        ttsCache.set(key, baked);
        return baked;
      }
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob) return null;
      if (ttsCache.has(key)) return ttsCache.get(key);
      const url = URL.createObjectURL(blob);
      ttsCache.set(key, url);
      return url;
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
      document.documentElement.classList.remove("is-gru-intro-pending");
      introActive = true;
      document.documentElement.classList.add("is-gru-intro");
      root.classList.add("is-intro", "is-intro-boot");
      void root.offsetWidth;
      requestAnimationFrame(() => root.classList.remove("is-intro-boot"));
    }

    guideOn = true;
    const gen = ++playGen;
    stepIndex = index;
    status = "playing";
    render();
    setSpotlight(step);

    const text = stepText(step);
    const cached = text ? ttsCache.get(lang + "\n" + text) : null;
    if (cached) {
      root.dataset.voice = "elevenlabs";
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      utterance = null;
      audio.playbackRate = 1.12;
      audio.muted = muted;
      audio.src = cached;
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
    document.documentElement.classList.remove("is-guide-spotlighting");
    for (const el of spotlightEls) el.classList.remove("is-guide-spotlight");
    spotlightEls = [];
  }

  function setSpotlight(step) {
    clearSpotlight();
    if (!step?.spotlight || status !== "playing") return;
    const nodes = document.querySelectorAll(step.spotlight);
    if (!nodes.length) return;
    nodes.forEach((el) => {
      el.classList.add("is-guide-spotlight");
      spotlightEls.push(el);
    });
    document.documentElement.classList.add("is-guide-spotlighting");
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
    if (introActive) {
      introActive = false;
      introBusy = false;
      root.classList.remove("is-intro");
      document.documentElement.classList.remove("is-gru-intro", "is-gru-intro-pending");
    }
    clearSpotlight();
    render();
    observeSections();
    scheduleAutoStart();
  }

  function sectionVisible(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight * 0.75 && rect.bottom > 96;
  }

  function introSeen() {
    try {
      return localStorage.getItem(INTRO_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function markIntroSeen() {
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch (_) {}
  }

  function wantsIntro() {
    return normalizePath(pathname) === "/" && !introSeen() && !reducedMotion;
  }

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

  function snapshotAvatar() {
    const canvas = avatar.querySelector("canvas");
    if (!canvas || !canvas.width) return null;
    const img = document.createElement("img");
    img.className = "site-guide__snap";
    img.alt = "";
    try {
      img.src = canvas.toDataURL("image/webp", 0.92);
    } catch (_) {
      try {
        img.src = canvas.toDataURL("image/png");
      } catch (err) {
        return null;
      }
    }
    return img;
  }

  function collapseTo(commit) {
    if (reducedMotion) {
      commit();
      return Promise.resolve();
    }

    const from = guideBox(root);
    const snap = snapshotAvatar();
    const ghost = root.cloneNode(true);
    ghost.classList.add("is-flying");
    ghost.classList.remove("is-intro-boot");
    ghost.setAttribute("aria-hidden", "true");
    const ghostCanvas = ghost.querySelector("canvas");
    if (snap && ghostCanvas) ghostCanvas.replaceWith(snap);
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

  function finishIntro() {
    if (!introActive || introBusy) return Promise.resolve();
    introBusy = true;
    document.documentElement.classList.remove("is-gru-intro");
    return collapseTo(() => {
      root.classList.remove("is-intro");
      introActive = false;
      markIntroSeen();
    }).finally(() => {
      introBusy = false;
    });
  }

  function dismissToSide() {
    if (flyBusy) return;
    if (!introActive && !root.classList.contains("is-intro")) return;
    flyBusy = true;
    pause();
    document.documentElement.classList.remove("is-gru-intro", "is-gru-intro-pending");
    collapseTo(() => {
      introBusy = false;
      introActive = false;
      markIntroSeen();
      root.classList.remove("is-intro", "is-intro-boot");
      render();
    }).finally(() => {
      flyBusy = false;
    });
  }

  function startIntro() {
    if (introActive || !wantsIntro()) return;
    document.documentElement.classList.remove("is-gru-intro-pending");
    introActive = true;
    document.documentElement.classList.add("is-gru-intro");
    root.classList.add("is-intro", "is-intro-boot");
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove("is-intro-boot"));
    guideOn = true;
    const start = script.steps.findIndex(
      (step) => step.intro && (!step.when || step.when === "start"),
    );
    playStep(start >= 0 ? start : 0);
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
      const ahead = visibleSectionIndex();
      if (ahead >= 0) {
        playStep(ahead);
        return;
      }
      const next = script.steps[stepIndex + 1];
      if (next && (!next.when || next.when === "start")) {
        playStep(stepIndex + 1);
        return;
      }
      status = next ? "idle" : "ended";
      render();
      checkScroll();
    };

    if (introActive && step?.intro) {
      finishIntro().then(continueNext);
      return;
    }
    continueNext();
  }

  function visibleSectionIndex() {
    for (let i = 0; i < script.steps.length; i += 1) {
      const step = script.steps[i];
      if (!step.when || step.when === "start") continue;
      if (played.has(step.id)) continue;
      if (!sectionVisible(step.when)) continue;
      return i;
    }
    return -1;
  }

  function checkScroll() {
    if (!guideOn || introActive || userPaused) return;
    if (status === "paused" && !blockedAutoplay) return;
    const index = visibleSectionIndex();
    if (index < 0) return;
    if (status === "playing" || status === "loading") {
      const current = script.steps[stepIndex];
      if (!current?.when || current.when === "start" || current.intro) return;
      if (stepIndex === index) return;
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
    return Promise.all(jobs);
  }

  async function autoStartGuide() {
    userPaused = false;
    wantPaused = false;
    blockedAutoplay = false;
    await prefetchOpening();
    if (userPaused) return;
    if (wantsIntro()) {
      document.documentElement.classList.add("is-gru-intro-pending");
      scheduleIntro();
      return;
    }
    document.documentElement.classList.remove("is-gru-intro-pending");
    guideOn = true;
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
    audio.playbackRate = 1.12;
    audio.muted = muted;
    audio.src = src;
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

  async function ttsSrc(text, uiLang, gen) {
    const key = uiLang + "\n" + text;
    const hit = ttsCache.get(key);
    if (hit) return hit;
    ttsAbort?.abort();
    const ac = new AbortController();
    ttsAbort = ac;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (gen !== playGen || wantPaused) return null;
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: uiLang }),
        signal: ac.signal,
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        if (gen !== playGen) return null;
        ttsCache.set(key, url);
        return url;
      }
      // Rate limit / transient — wait and retry instead of robotic browser voice
      if (res.status !== 429 && res.status !== 502 && res.status !== 503) return null;
      await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
    }
    return null;
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
    setSpotlight(step);

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
      root.dataset.voice = "elevenlabs";
      status = "playing";
      render();
      setSpotlight(step);
      await playAudioSrc(src, gen);
      return;
    }

    holdForGesture();
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
    setSpotlight(script.steps[stepIndex]);
    render();

    if (audio.src) {
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
    render();
  }

  // 3D AVATAR: start talking animation / begin viseme stream
  audio.onplay = () => {
    const step = script.steps[stepIndex];
    if (step?.id) played.add(step.id);
    blockedAutoplay = false;
    disarmGestureResume();
    status = "playing";
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
    if (status === "playing") pause();
    else resume();
  });
  muteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMute();
  });
  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    dismissToSide();
  });
  veil.addEventListener("click", dismissToSide);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    dismissToSide();
  });

  document.querySelector(".lang-toggle")?.addEventListener("click", () => {
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

  let sectionObserver = null;
  function observeSections() {
    if (!("IntersectionObserver" in window)) return;
    sectionObserver?.disconnect();
    sectionObserver = new IntersectionObserver(() => checkScroll(), {
      threshold: [0.15, 0.35, 0.55],
      rootMargin: "0px 0px -12% 0px",
    });
    script.steps.forEach((step) => {
      if (!step.when || step.when === "start") return;
      document.querySelectorAll(step.when).forEach((el) => sectionObserver.observe(el));
    });
  }
  observeSections();

  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.cancel();
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
  }

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
    if (!document.body.contains(veil)) document.body.appendChild(veil);
    if (!document.body.contains(root)) document.body.appendChild(root);
    const agentSrc = [...document.scripts].find((s) => /site-guide-agent\.js/.test(s.src))?.src;
    const glbUrl = agentSrc
      ? new URL("../grudentist.glb", agentSrc).href
      : "/assets/grudentist.glb";
    const avatarMod = agentSrc
      ? new URL("site-guide-avatar.js?v=8", agentSrc).href
      : "/assets/js/site-guide-avatar.js?v=8";
    afterSplash(() => {
      const boot = () =>
        import(avatarMod)
          .then((mod) =>
            mod.mountGuideDentist(avatar, {
              glbUrl,
              talkingRef: () => status === "playing",
            }),
          )
          .catch((err) => console.warn("guide avatar:", err));
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(boot, { timeout: 280 });
      } else {
        setTimeout(boot, 60);
      }
    });

    observeSections();
    scheduleAutoStart();
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
