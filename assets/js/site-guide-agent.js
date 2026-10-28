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
      if (step?.id && step.text?.de && !RECORDED.has(step.text.de)) RECORDED.set(step.text.de, `/assets/audio/guide/${folder}/${step.id}.de.mp3`);
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
  // Wide desktop screens: she stands in her own column on the right (see .is-stage in site-guide.css)
  const STAGE_MQ = window.matchMedia("(min-width: 1200px) and (pointer: fine)");
  const STAGE_FRAME = { radius: 5.9, y: 0.98, x: -0.3, pitch: 82, fov: 20 };
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
    '<img class="site-guide__face site-guide__face--small" src="/assets/images/guide/bot-small.webp?v=1" alt="" width="256" height="256" decoding="async" />' +
    '<model-viewer class="site-guide__model" tone-mapping="neutral" animation-name="stand" autoplay camera-target="0m 1.72m 0m" camera-orbit="0deg 88deg 0.8m" min-camera-orbit="auto auto 0.1m" max-camera-orbit="auto auto 10m" field-of-view="30deg" interpolation-decay="80" interaction-prompt="none" disable-tap loading="eager"></model-viewer>' +
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
    const stage = STAGE_MQ.matches && !minimized && !hubOpen;
    if (stage && !root.classList.contains("is-stage")) {
      // Frame her straight away so the face close-up never flashes before the animation loop runs
      const model = avatar.querySelector(".site-guide__model");
      const f = STAGE_FRAME;
      model.cameraOrbit = `0deg ${f.pitch}deg ${f.radius}m`;
      model.cameraTarget = `${f.x}m ${f.y}m 0m`;
      model.fieldOfView = `${f.fov}deg`;
      model.jumpCameraToGoal?.();
    }
    root.classList.toggle("is-stage", stage);
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
    if (muted || !step?.spotlight || status !== "playing") {
      clearSpotlight();
      return;
    }
    const nodes = document.querySelectorAll(step.spotlight);
    // playStep and audio.onplay both call this for the same line; restarting the ring each time made it flash
    if (nodes.length && nodes.length === spotlightEls.length && [...nodes].every((el, i) => el === spotlightEls[i])) return;
    clearSpotlight();
    if (!nodes.length) return;
    pointAtSpotlight(step);
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
    // The full-screen welcome belongs to the original homepage at /home/, not the milling page.
    return normalizePath(pathname) === "/home" && introOnThisLoad && !introDone;
  }
  // The welcome popup always speaks German; the saved language takes over once it closes
  if (wantsIntro()) lang = "de";

  const FLY_MS = 520;
  const FLY_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

  // The logo on the reception wall, as the box the logo artwork (splash brand / nav logo, same
  // framing) fills when laid over it: fractions of reception.jpg, fitted to the sign's lettering
  const HUB_SIGN = { x: 0.2793, y: 0.0654, w: 0.4432, h: 0.3686 };
  const HUB_PHOTO_ASPECT = 1536 / 1024;
  // Where the backdrop photo is drawn right now, from its real size and nudge (see .guide-hub)
  function hubPhoto() {
    const r = hub.getBoundingClientRect();
    const cs = getComputedStyle(hub);
    // The photo is the second background layer (between the floor fade and the floor fill)
    const pw = parseFloat(cs.backgroundSize.split(",")[1]);
    const shift = parseFloat(cs.getPropertyValue("--hub-gap-shift")) || 0;
    const url = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage)?.[1];
    if (!pw || !r.width || !url) return null;
    const ph = pw / HUB_PHOTO_ASPECT;
    return {
      url,
      width: pw,
      height: ph,
      left: r.left + (r.width - pw) / 2 + shift * pw,
      // Centred when it covers the height, pinned to the top when it doesn't (narrow phones)
      top: r.top + Math.min(0, (r.height - ph) / 2),
    };
  }
  // Where the sign is on screen now
  function hubSignBox() {
    const p = hubPhoto();
    if (!p) return null;
    return {
      left: p.left + HUB_SIGN.x * p.width,
      top: p.top + HUB_SIGN.y * p.height,
      width: HUB_SIGN.w * p.width,
      height: HUB_SIGN.h * p.height,
    };
  }
  // The wall sign cut out of the backdrop, soft-edged, sitting exactly on it. The wall sign is drawn
  // differently from the logo artwork, so the logo flying to the nav lifts off as this cut-out (the
  // very same pixels, no visible switch) and cross-fades into the nav logo in flight.
  // It is padded beyond the sign box (same centre) so its soft edge falls on plain wall
  const CUTOUT_PAD = 0.1;
  function hubSignCutout() {
    const p = hubPhoto();
    const sign = hubSignBox();
    if (!p || !sign) return null;
    const padX = sign.width * CUTOUT_PAD;
    const padY = sign.height * CUTOUT_PAD;
    const box = { left: sign.left - padX, top: sign.top - padY, width: sign.width + 2 * padX, height: sign.height + 2 * padY };
    const el = document.createElement("div");
    const edge = "transparent, #000 12%, #000 88%, transparent";
    Object.assign(el.style, {
      position: "fixed",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      background: `url("${p.url}") ${p.left - box.left}px ${p.top - box.top}px / ${p.width}px auto no-repeat`,
      maskImage: `linear-gradient(to right, ${edge}), linear-gradient(${edge})`,
      maskComposite: "intersect",
      webkitMaskImage: `linear-gradient(to right, ${edge}), linear-gradient(${edge})`,
      webkitMaskComposite: "source-in",
      pointerEvents: "none",
      willChange: "transform, opacity",
    });
    return el;
  }

  const LOGO_FLY_MS = 820;
  const LOGO_FLY_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";
  // Leaving the welcome: the logo lifts off the reception wall into its place in the nav. It
  // starts as the wall sign itself (cut-out) and becomes the nav logo early in the flight.
  function flyLogoToNav() {
    const navMark = document.querySelector(".nav__brand img");
    const from = hubSignBox();
    const cutout = hubSignCutout();
    const to = navMark?.getBoundingClientRect();
    if (reducedMotion || !from || !cutout || !to?.width || typeof navMark.animate !== "function") return;
    const logo = new Image();
    logo.src = navMark.currentSrc || navMark.src;
    logo.alt = "";
    Object.assign(logo.style, {
      position: "fixed",
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      zIndex: "63",
      pointerEvents: "none",
      willChange: "transform, opacity",
    });
    Object.assign(cutout.style, { zIndex: "62" });
    // Same centre, same transform, same timing: the two travel as one
    for (const el of [cutout, logo]) el.style.transformOrigin = "50% 50%";
    document.body.append(cutout, logo);
    navMark.style.opacity = "0";
    const s = to.width / from.width;
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const moved = `translate(${dx}px, ${dy}px) scale(${s})`;
    const timing = { duration: LOGO_FLY_MS, easing: LOGO_FLY_EASE, fill: "forwards" };
    cutout.animate(
      [
        { transform: "none", opacity: 1 },
        { opacity: 1, offset: 0.05 },
        { opacity: 0, offset: 0.35 },
        { transform: moved, opacity: 0 },
      ],
      timing,
    );
    logo
      .animate(
        [
          { transform: "none", opacity: 0 },
          { opacity: 0, offset: 0.05 },
          { opacity: 1, offset: 0.35 },
          { transform: moved, opacity: 1 },
        ],
        timing,
      )
      .finished.catch(() => {})
      .then(() => {
        navMark.style.opacity = "";
        logo.remove();
        cutout.remove();
      });
  }


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
    if (introActive) flyLogoToNav();
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
      document.dispatchEvent(new CustomEvent("elitedent:leave"));
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

  STAGE_MQ.addEventListener("change", render);
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
  // femalebot-guide-lite.glb with a WebP texture and meshopt-compressed geometry (scripts/optimize-glb.cjs)
  const AVATAR_SRC = "/assets/femalebot/femalebot-guide-web.glb?v=1";
  const avatarModel = avatar.querySelector(".site-guide__model");
  // Framing: face in the small bubble, head and shoulders in the full-screen intro
  // Her body sits ~6cm right of the model's origin (her face ~4cm), so x re-centres her in frame
  const AVATAR_FRAME = { stage: STAGE_FRAME, small: { radius: 0.8, y: 1.72, x: 0.037 }, intro: { radius: 1.9, y: 1.6, x: 0.06 }, introWide: { radius: 2.6, y: 1.48, x: 0.06 } };
  const INTRO_ZOOM_MS = 3000;
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

  // On the stage she gestures toward the content (screen-left) once per line that spotlights
  // something (not again after a pause/resume), then settles back into the idle stand
  const POINT_MS = 2700; // length of the "point" clip
  const pointedSteps = new Set();
  let pointTimer = 0;
  function pointAtSpotlight(step) {
    if (reducedMotion || !root.classList.contains("is-stage") || !avatarModel?.loaded) return;
    if (pointedSteps.has(step.id)) return;
    pointedSteps.add(step.id);
    avatarModel.animationName = "point";
    avatarModel.play({ repetitions: 1 });
    clearTimeout(pointTimer);
    pointTimer = setTimeout(backToStand, POINT_MS);
  }

  function backToStand() {
    clearTimeout(pointTimer);
    if (avatarModel.animationName === "stand") return;
    avatarModel.animationName = "stand";
    avatarModel.play();
  }

  // The baked "point" clip aims her nearly straight arm level and almost at the camera, palm down with
  // the index finger stuck out, so the hand looms large and the fingers look odd. On top of it she turns
  // it into an open, palm-up "here it is" gesture: the upper arm turns slightly toward the content
  // (screen-left) and drops toward her side so the elbow bends, the forearm aims a little upward, the
  // index finger relaxes back in line with the other fingers (which have no bones of their own), the
  // forearm and wrist roll the palm up, the wrist turns the fingers toward the content, and the hand
  // shrinks back to its true size on screen.
  // It runs in onBeforeRender, i.e. after model-viewer's mixer has posed the bones.
  const POINT_SWING = -0.15; // upper arm, radians around the vertical (negative = toward screen-left)
  const POINT_DROP = 0.35; // upper arm, radians down toward her side
  const POINT_AIM = [5, 0]; // degrees above level for the forearm and the hand
  const POINT_ROLL_FOREARM = 0.6; // share of the palm-up roll done by the forearm; the wrist does the rest
  const POINT_HAND_TURN = -0.9; // wrist, radians around the vertical, pointing the fingers toward the content
  const POINT_HAND_SCALE = 0.96; // the hand is nearest the camera, so perspective enlarges it ~4%
  // Palm normal in the mesh's rest pose (arms hanging, palms facing the thighs), found from the hand's vertices
  const PALM_REST = [0.98, -0.15, -0.07];
  function avatarPointPose() {
    const sym = Object.getOwnPropertySymbols(avatarModel).find((s) => s.description === "scene");
    const scene = sym && avatarModel[sym];
    const names = ["RightArm", "RightForeArm", "RightHand", "RightHandIndex1", "RightHandIndex2", "RightHandIndex3"];
    const all = names.map((n) => scene?.getObjectByName(`mixamorig${n}`));
    let skin = null;
    scene?.traverse((o) => {
      if (o.isSkinnedMesh) skin = o;
    });
    if (all.includes(undefined) || !skin) return;
    const [arm, forearm, hand, finger] = all;
    const V = hand.position.constructor;
    const Q = hand.quaternion.constructor;
    const M = skin.bindMatrix.constructor;
    const up = new V(0, 1, 0);
    const a = new V();
    const b = new V();
    const axis = new V();
    const rot = new Q();
    const parent = new Q();
    const bones = all.map((bone) => ({ bone, base: new Q(), applied: null }));
    // Rest-pose data from the skin: each bone's world matrix at bind time is the inverse of its boneInverse
    const { bones: skelBones, boneInverses } = skin.skeleton;
    const restInverse = (bone) => boneInverses[skelBones.indexOf(bone)];
    const restLocal = (bone) => {
      const q = new Q();
      new M().multiplyMatrices(restInverse(bone.parent), restInverse(bone).clone().invert()).decompose(new V(), q, new V());
      return q;
    };
    const fingerRest = all.slice(2).map((bone) => [bone, restLocal(bone)]);
    const palmLocal = new V(...PALM_REST).normalize();
    restInverse(hand).decompose(new V(), rot, new V());
    palmLocal.applyQuaternion(rot);

    const dirOf = (from, to) => to.getWorldPosition(b).sub(from.getWorldPosition(a)).normalize();
    // Rotate a bone in world space, around its own joint
    const turn = (bone, ax, angle) => {
      rot.setFromAxisAngle(ax, angle);
      bone.parent.getWorldQuaternion(parent);
      bone.quaternion.premultiply(parent.clone().invert().multiply(rot).multiply(parent));
      bone.updateMatrixWorld(true);
    };
    const tilt = (bone, end, angle) => turn(bone, axis.crossVectors(dirOf(bone, end), up).normalize(), angle);
    const aim = (bone, end, deg, w) => tilt(bone, end, ((deg * Math.PI) / 180 - Math.asin(dirOf(bone, end).y)) * w);
    // Twist a bone around its own length so the palm faces as nearly straight up as it can
    const rollPalmUp = (bone, end, share) => {
      const along = dirOf(bone, end).clone();
      const palm = palmLocal.clone().applyQuaternion(hand.getWorldQuaternion(rot)).projectOnPlane(along).normalize();
      const lift = up.clone().projectOnPlane(along).normalize();
      turn(bone, along, Math.atan2(along.dot(axis.crossVectors(palm, lift)), palm.dot(lift)) * share);
    };
    scene.onBeforeRender = () => {
      // Once the clip stops, the mixer no longer resets the bones, so undo our last pose instead of stacking it
      for (const s of bones) {
        if (s.applied && s.bone.quaternion.equals(s.applied)) s.bone.quaternion.copy(s.base);
        s.applied = null;
      }
      arm.updateMatrixWorld(true);
      // Full effect while the forearm is near level, fading out as the arm drops back to her side
      const level = avatarModel.animationName === "point" ? dirOf(forearm, hand).y : -1;
      const w = Math.min(1, Math.max(0, (level + 0.7) / 0.5));
      hand.scale.setScalar(1 + (POINT_HAND_SCALE - 1) * w);
      hand.updateMatrixWorld(true);
      if (!w) return;
      for (const s of bones) s.base.copy(s.bone.quaternion);
      turn(arm, up, POINT_SWING * w);
      tilt(arm, forearm, -POINT_DROP * w);
      aim(forearm, hand, POINT_AIM[0], w);
      for (const [bone, rest] of fingerRest) bone.quaternion.slerp(rest, w);
      arm.updateMatrixWorld(true);
      rollPalmUp(forearm, hand, POINT_ROLL_FOREARM * w);
      rollPalmUp(hand, finger, w);
      turn(hand, up, POINT_HAND_TURN * w);
      aim(hand, finger, POINT_AIM[1], w);
      for (const s of bones) s.applied = s.bone.quaternion.clone();
    };
  }

  // Lip movement: the model has a "jaw" bone (added in Blender) that opens with the loudness of
  // the voice. Each clip is decoded once into a loudness curve sampled at MOUTH_FPS, then read at
  // audio.currentTime, so the audio itself never goes through Web Audio.
  const MOUTH_FPS = 50;
  const MOUTH_MAX = 0.055; // radians, fully open; more stretches the lip texture (the model has no mouth interior)
  const envelopes = new Map();

  function loadEnvelope(src) {
    if (envelopes.has(src) || typeof OfflineAudioContext === "undefined") return;
    envelopes.set(src, null);
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => new OfflineAudioContext(1, 1, 22050).decodeAudioData(buf))
      .then((audioBuf) => {
        const data = audioBuf.getChannelData(0);
        const step = Math.max(1, Math.floor(audioBuf.sampleRate / MOUTH_FPS));
        const env = new Float32Array(Math.ceil(data.length / step));
        for (let i = 0; i < env.length; i += 1) {
          let sum = 0;
          const end = Math.min(data.length, (i + 1) * step);
          for (let j = i * step; j < end; j += 1) sum += data[j] * data[j];
          env[i] = Math.sqrt(sum / step);
        }
        // Normalise against a loud-but-not-peak level so ordinary speech opens the mouth well
        const sorted = Float32Array.from(env).sort();
        const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
        for (let i = 0; i < env.length; i += 1) env[i] = Math.min(1, env[i] / ref);
        envelopes.set(src, env);
      })
      .catch(() => {});
  }

  function avatarJaw() {
    const sym = Object.getOwnPropertySymbols(avatarModel).find((s) => s.description === "scene");
    const scene = sym && avatarModel[sym];
    const jaw = scene?.getObjectByName("jaw");
    if (!jaw) return null;
    const Quat = jaw.quaternion.constructor;
    return { scene, jaw, rest: jaw.quaternion.clone(), open: new Quat(), axis: new jaw.position.constructor(1, 0, 0), Quat };
  }

  // A slight, friendly resting smile. The face has no expression shapes, so the mouth corners are
  // lifted a few millimetres in the vertex shader (before skinning, so the talking jaw still works)
  // and the lip texture curves up with them. Corners are in the lite model's own mesh coordinates
  // (about 1 unit per metre), found by picking them on the rendered face.
  const SMILE_CORNERS = [
    [-0.0154, 0.7604, 0.0963, -1],
    [0.0375, 0.7604, 0.0974, 1],
  ];
  const SMILE_LIFT = [0.003, 0.009, -0.003]; // out to the side, up, back into the cheek; much more reads as a smirk

  function avatarSmile() {
    const sym = Object.getOwnPropertySymbols(avatarModel).find((s) => s.description === "scene");
    let face = null;
    avatarModel[sym]?.traverse((o) => {
      if (o.isSkinnedMesh) face = o;
    });
    if (!face) return;
    for (const mat of [].concat(face.material)) {
      const before = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, renderer) => {
        before?.call(mat, shader, renderer);
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
vec3 smileAt(vec3 p, vec3 c, float side) {
  vec3 d = (p - c) / vec3(0.013, 0.008, 0.012);
  return exp(-0.5 * dot(d, d)) * vec3(side * ${SMILE_LIFT[0]}, ${SMILE_LIFT[1]}, ${SMILE_LIFT[2]});
}`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
${SMILE_CORNERS.map(([x, y, z, side]) => `transformed += smileAt(position, vec3(${x}, ${y}, ${z}), ${side.toFixed(1)});`).join("\n")}`
          );
      };
      const key = mat.customProgramCacheKey?.bind(mat);
      mat.customProgramCacheKey = () => `${key ? key() : ""}smile`;
      mat.needsUpdate = true;
    }
  }

  function startAvatarModel() {
    if (!avatarModel) {
      avatar.classList.add("is-3d-failed");
      return;
    }
    avatar.classList.add("has-3d");
    const fail = () => {
      avatar.classList.remove("has-3d", "is-3d-ready");
      avatar.classList.add("is-3d-failed");
    };
    avatarModel.addEventListener("error", fail, { once: true });
    // The welcome intro needs her right away; everywhere else she waits until the page itself has
    // loaded, so the model doesn't compete with the content on a slow mobile connection
    const loadModel = () =>
      import(MODEL_VIEWER)
        .then(() => {
          avatarModel.src = AVATAR_SRC;
        })
        .catch(fail);
    if (wantsIntro()) loadModel();
    else if (document.readyState === "complete") setTimeout(loadModel, 300);
    else addEventListener("load", () => setTimeout(loadModel, 300), { once: true });

    let rig = null;
    let mouth = null;
    let mouthOpen = 0;
    avatarModel.addEventListener("finished", backToStand);
    avatarModel.addEventListener("load", () => {
      avatar.classList.add("is-3d-ready");
      try {
        rig = avatarHead();
      } catch (_) {
        rig = null;
      }
      try {
        mouth = avatarJaw();
      } catch (_) {
        mouth = null;
      }
      try {
        avatarSmile();
      } catch (_) {}
      try {
        avatarPointPose();
      } catch (_) {}
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
    let introAt = 0;
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
      let frame = root.classList.contains("is-stage") ? AVATAR_FRAME.stage : AVATAR_FRAME.small;
      if (intro) {
        // Intro opens on her face, then eases out a little
        introAt ||= now;
        const k = reducedMotion ? 1 : Math.min(1, (now - introAt) / INTRO_ZOOM_MS);
        const e = k * k * (3 - 2 * k);
        const a = AVATAR_FRAME.intro;
        const b = AVATAR_FRAME.introWide;
        frame = { radius: a.radius + (b.radius - a.radius) * e, y: a.y + (b.y - a.y) * e, x: a.x };
      } else {
        introAt = 0;
      }
      avatarModel.cameraOrbit = `0deg ${frame.pitch || 88}deg ${frame.radius}m`;
      avatarModel.fieldOfView = `${frame.fov || 30}deg`;
      avatarModel.cameraTarget = `${frame.x || 0}m ${frame.y}m 0m`;
      if (mouth) {
        let target = 0;
        if (audio.src && !audio.paused && status === "playing") {
          const env = envelopes.get(audio.src);
          if (env === undefined) loadEnvelope(audio.src);
          else if (env) target = env[Math.floor(audio.currentTime * MOUTH_FPS)] || 0;
        }
        // Opens fast, closes a little slower, like a real jaw
        mouthOpen += (target - mouthOpen) * (target > mouthOpen ? 0.6 : 0.35);
        mouth.open.setFromAxisAngle(mouth.axis, mouthOpen * MOUTH_MAX);
        mouth.jaw.quaternion.copy(mouth.rest).multiply(mouth.open);
        mouth.scene.queueRender();
      }
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
