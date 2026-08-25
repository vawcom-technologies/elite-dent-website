(() => {
  const splash = document.getElementById("splash");
  const app = document.getElementById("app");
  if (!app) return;

  const KEY = "elitedent-splash";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function revealHome() {
    app.hidden = false;
    requestAnimationFrame(() => app.classList.add("is-ready"));
  }

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
  const shell = splash.querySelector(".splash__shell");
  const tooth = splash.querySelector(".splash__tooth");
  const brand = document.getElementById("splash-brand");

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
      finish();
      return;
    }

    // Keep shell + tooth visible for the whoosh (no full-logo black plate)
    if (shell) {
      shell.style.animation = "none";
      shell.style.opacity = "1";
    }
    if (tooth) {
      tooth.style.animation = "none";
      tooth.style.opacity = "1";
      tooth.style.transform = "none";
    }

    revealHome();
    app.classList.add("is-splash-handoff");

    requestAnimationFrame(() => {
      const from = brand.getBoundingClientRect();
      const to = navMark.getBoundingClientRect();
      if (!to.width || !from.width) {
        app.classList.remove("is-splash-handoff");
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

        // Navbar keeps the original full mark only
        navMark.src = "assets/images/elitedentlogo.png?v=21";
        app.classList.add("is-splash-landed");
        app.classList.remove("is-splash-handoff");
        brand.style.transition = "none";
        brand.style.opacity = "0";
        brand.style.visibility = "hidden";

        requestAnimationFrame(() => {
          requestAnimationFrame(finish);
        });
      };

      brand.addEventListener("transitionend", land);
      setTimeout(() => land(null), 580);
    });
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

  Promise.all([ready(shell), ready(tooth), ready(smile)]).then(() => {
    splash.classList.add("is-ready");

    if (reduced) {
      setTimeout(() => {
        revealHome();
        finish();
      }, 200);
      return;
    }

    setTimeout(whooshToNav, 900);
  });
})();
