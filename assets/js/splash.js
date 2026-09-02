(() => {
  const splash = document.getElementById("splash");
  const app = document.getElementById("app");
  if (!app) return;

  const KEY = "elitedent-splash";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;

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
    setTimeout(() => {
      app.classList.remove("is-splash-handoff", "is-splash-landed");
      splash.remove();
    }, 280);
  }

  function whooshToNav() {
    const navMark = app.querySelector(".nav__brand img");
    if (!brand || !navMark || reduced) {
      revealHome();
      markSplashComplete();
      finish();
      return;
    }

    if (film) {
      try {
        film.pause();
      } catch (_) {}
    }

    const splashImg = brand.querySelector(".splash__mark");
    if (isMobile && splashImg && navMark.src && splashImg.src !== navMark.src) {
      splashImg.src = navMark.src;
      splashImg.width = navMark.width || 400;
      splashImg.height = navMark.height || 221;
    }

    brand.hidden = false;
    splash.classList.add("is-handoff");
    revealHome();
    app.classList.add("is-splash-handoff");

    const runHandoff = () => {
      const from = brand.getBoundingClientRect();
      const to = navMark.getBoundingClientRect();
      if (!to.width || !from.width) {
        app.classList.remove("is-splash-handoff");
        markSplashComplete();
        finish();
        return;
      }

      const scale = to.width / from.width;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);

      brand.style.transition =
        "transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1), filter 0.35s ease";
      brand.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
      brand.style.filter = "drop-shadow(0 1px 4px rgb(0 0 0 / 0.1))";
      brand.style.opacity = "1";
      brand.style.visibility = "visible";

      let settled = false;
      const land = (event) => {
        if (event && event.propertyName && event.propertyName !== "transform") return;
        if (settled) return;
        settled = true;
        brand.removeEventListener("transitionend", land);

        app.classList.add("is-splash-landed", "is-splash-complete");
        app.classList.remove("is-splash-handoff");
        brand.style.transition = "none";
        brand.style.opacity = "0";
        brand.style.visibility = "hidden";

        document.dispatchEvent(new CustomEvent("elitedent:splash-complete"));

        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
      };

      brand.addEventListener("transitionend", land);
      setTimeout(() => land(null), 580);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(runHandoff);
    });
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
    if (!film) return Promise.resolve(false);
    if (film.readyState >= 2) return Promise.resolve(true);
    return new Promise((res) => {
      const ok = () => res(true);
      const fail = () => res(false);
      film.addEventListener("loadeddata", ok, { once: true });
      film.addEventListener("error", fail, { once: true });
      try {
        film.load();
      } catch (_) {}
      setTimeout(() => res(film.readyState >= 2), 4000);
    });
  }

  Promise.all([readyFilm(), readyMark()]).then(([filmOk]) => {
    splash.classList.add("is-ready");

    if (reduced) {
      brand.hidden = false;
      splash.classList.add("is-handoff");
      setTimeout(() => {
        revealHome();
        markSplashComplete();
        finish();
      }, 200);
      return;
    }

    if (isMobile) {
      brand.hidden = false;
      splash.classList.add("is-handoff");
      setTimeout(whooshToNav, 320);
      return;
    }

    if (!film || !filmOk) {
      brand.hidden = false;
      splash.classList.add("is-handoff");
      setTimeout(whooshToNav, 600);
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
      { passive: true }
    );

    const play = film.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        handoff();
      });
    }

    setTimeout(handoff, 7500);
  });
})();
