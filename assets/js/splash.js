(() => {
  const splash = document.getElementById("splash");
  const app = document.getElementById("app");
  if (!app) return;

  const KEY = "elitedent-splash";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HOLD_MS = reduced ? 400 : 3850;

  function revealHome() {
    app.hidden = false;
    requestAnimationFrame(() => app.classList.add("is-ready"));
  }

  // Already seen this session — skip splash (logo / Home navigations)
  try {
    if (sessionStorage.getItem(KEY)) {
      splash?.remove();
      revealHome();
      return;
    }
  } catch (_) {
    /* private mode: fall through and show splash */
  }

  if (!splash) {
    revealHome();
    return;
  }

  const smile = splash.querySelector(".splash__smile");
  const logo = splash.querySelector(".splash__logo");

  function finish() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch (_) {}
    revealHome();
    splash.classList.add("is-done");
    setTimeout(() => splash.remove(), 400);
  }

  function ready(img) {
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth) {
      return img.decode?.().catch(() => {}) ?? Promise.resolve();
    }
    return new Promise((res) => {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    }).then(() => img.decode?.().catch(() => {}));
  }

  Promise.all([ready(smile), ready(logo)]).then(() => {
    splash.classList.add("is-ready");
    setTimeout(finish, HOLD_MS);
  });
})();
