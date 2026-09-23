(() => {
  const splash = document.getElementById("splash");
  const app = document.getElementById("app");
  if (!app) return;

  const KEY = "elitedent-splash";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPhone = window.matchMedia("(max-width: 767px)").matches;

  const FILM_LOCKUP = { x: 358, y: 330, w: 1178, h: 554, vw: 1920, vh: 1080 };
  // splash-mobile.mp4: middle 1370px of the film scaled to 1080 wide, centred in 1080×2400
  const FILM_LOCKUP_PHONE = { x: 65.4, y: 1034.3, w: 928.6, h: 437, vw: 1080, vh: 2400 };
  const PNG_CONTENT_W = 3164 / 3248;
  const WHOOSH_MS = 820;
  const WHOOSH_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";
  const LAND_FADE_MS = 120;
  const REMOVE_MS = 200;

  function revealHome() {
    app.hidden = false;
    requestAnimationFrame(() => app.classList.add("is-ready"));
  }

  function markSplashComplete() {
    app.classList.add("is-splash-complete");
    document.dispatchEvent(new CustomEvent("elitedent:splash-complete"));
  }

  try {
    if (sessionStorage.getItem(KEY)) {
      splash?.remove();
      revealHome();
      markSplashComplete();
      return;
    }
  } catch (_) {
    /* private mode: fall through and show splash */
  }

  if (!splash) {
    revealHome();
    markSplashComplete();
    return;
  }

  const film = document.getElementById("splash-film");
  const brand = document.getElementById("splash-brand");
  const mark = brand?.querySelector(".splash__mark");

  function markSeen() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch (_) {}
  }

  function finish() {
    markSeen();
    splash.classList.add("is-done");
    app.classList.add("is-ready");
    markSplashComplete();
    setTimeout(() => {
      app.classList.remove("is-splash-handoff", "is-splash-landed");
      splash.remove();
    }, REMOVE_MS);
  }

  function warmHome() {
    if (!app.hidden) return;
    app.hidden = false;
    app.classList.add("is-splash-handoff");
  }

  function sizeBrandToFilm() {
    if (!brand || !film) return;
    const lockup = (film.currentSrc || film.src).includes("splash-mobile") ? FILM_LOCKUP_PHONE : FILM_LOCKUP;
    const vw = film.videoWidth || lockup.vw;
    const vh = film.videoHeight || lockup.vh;
    if (!vw || !vh) return;
    const area = film.getBoundingClientRect();
    if (!area.width || !area.height) return;
    const scale = Math.max(area.width / vw, area.height / vh);
    const displayedW = vw * scale;
    const displayedH = vh * scale;
    const originX = area.left + (area.width - displayedW) / 2;
    const originY = area.top + (area.height - displayedH) / 2;
    const x = lockup.x * (vw / lockup.vw);
    const y = lockup.y * (vh / lockup.vh);
    const w = lockup.w * (vw / lockup.vw);
    const h = lockup.h * (vh / lockup.vh);
    brand.style.width = `${(w * scale) / PNG_CONTENT_W}px`;
    brand.style.left = `${originX + (x + w / 2) * scale}px`;
    brand.style.top = `${originY + (y + h / 2) * scale}px`;
    brand.style.transform = "translate(-50%, -50%) translateZ(0)";
  }

  function flyBrand(dx, dy, scale) {
    const from = "translate(-50%, -50%) translateZ(0)";
    const to = `translate(-50%, -50%) translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
    brand.style.willChange = "transform";
    if (typeof brand.animate === "function") {
      const anim = brand.animate([{ transform: from }, { transform: to }], {
        duration: WHOOSH_MS,
        easing: WHOOSH_EASE,
        fill: "forwards",
      });
      return anim.finished.catch(() => {
        brand.style.transform = to;
      });
    }
    brand.style.transition = `transform ${WHOOSH_MS}ms ${WHOOSH_EASE}`;
    brand.style.transform = to;
    return new Promise((resolve) => setTimeout(resolve, WHOOSH_MS));
  }

  function whooshToNav() {
    const navMark = app.querySelector(".nav__brand img");
    if (!brand || !navMark || reduced) {
      revealHome();
      finish();
      return;
    }

    if (film) {
      try {
        film.pause();
      } catch (_) {}
    }

    sizeBrandToFilm();
    brand.style.willChange = "transform";
    brand.hidden = false;
    warmHome();
    splash.classList.add("is-handoff");

    const startFly = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const from = brand.getBoundingClientRect();
          const to = navMark.getBoundingClientRect();
          if (!to.width || !from.width) {
            revealHome();
            finish();
            return;
          }

          const scale = to.width / from.width;
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);

          splash.classList.add("is-revealing");

          flyBrand(dx, dy, scale).then(() => {
            app.classList.add("is-splash-landed");
            app.classList.remove("is-splash-handoff");
            brand.style.transition = `opacity ${LAND_FADE_MS}ms linear`;
            brand.style.opacity = "0";

            setTimeout(() => {
              brand.style.willChange = "auto";
              brand.style.visibility = "hidden";
              finish();
            }, LAND_FADE_MS);
          });
        });
      });
    };

    if (isPhone) setTimeout(startFly, 420);
    else startFly();
  }

  function readyMark() {
    if (!mark) return Promise.resolve();
    if (mark.complete) {
      return mark.decode?.().catch(() => {}) ?? Promise.resolve();
    }
    return new Promise((res) => {
      mark.addEventListener("load", res, { once: true });
      mark.addEventListener("error", res, { once: true });
    }).then(() => mark.decode?.().catch(() => {}));
  }

  function readyFilm() {
    if (!film || reduced) return Promise.resolve(false);
    if (film.readyState >= 2) return Promise.resolve(true);
    return new Promise((res) => {
      const ok = () => res(true);
      const fail = () => res(false);
      film.addEventListener("loadeddata", ok, { once: true });
      film.addEventListener("playing", ok, { once: true });
      film.addEventListener("error", fail, { once: true });
      // iOS Safari ignores preload and only fetches the film once play() is called
      const kick = film.play();
      if (kick && typeof kick.catch === "function") kick.catch(() => {});
      setTimeout(() => res(film.readyState >= 2), 4000);
    });
  }

  Promise.all([readyFilm(), readyMark()]).then(([filmOk]) => {
    splash.classList.add("is-ready");
    warmHome();
    sizeBrandToFilm();

    if (reduced) {
      brand.hidden = false;
      splash.classList.add("is-handoff", "is-revealing");
      setTimeout(() => {
        revealHome();
        finish();
      }, 200);
      return;
    }

    if (!film || !filmOk) {
      brand.hidden = false;
      setTimeout(whooshToNav, isPhone ? 1000 : 400);
      return;
    }

    let handedOff = false;
    const handoff = () => {
      if (handedOff) return;
      handedOff = true;
      whooshToNav();
    };

    film.addEventListener("ended", handoff, { once: true });
    film.addEventListener(
      "timeupdate",
      () => {
        if (film.duration && film.currentTime >= film.duration - 0.08) handoff();
      },
      { passive: true },
    );

    const play = film.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        if (isPhone && !handedOff) {
          brand.hidden = false;
          setTimeout(handoff, 800);
          return;
        }
        handoff();
      });
    }

    setTimeout(handoff, 7500);
  });
})();
