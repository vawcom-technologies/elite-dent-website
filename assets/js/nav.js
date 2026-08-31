(() => {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  const panel = document.getElementById("nav-panel");
  if (!nav || !toggle || !panel) return;

  const mq = window.matchMedia("(max-width: 767px)");
  const services = nav.querySelector(".nav__services");
  const servicesToggle = nav.querySelector(".nav__services-toggle");
  const PILL_KEY = "elitedent-nav-pill";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const openText = toggle.getAttribute("data-label-open");
    const closeText = toggle.getAttribute("data-label-close");
    if (openText && closeText) {
      toggle.setAttribute("aria-label", open ? closeText : openText);
    } else {
      toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    }
    document.documentElement.classList.toggle("nav-lock", open && mq.matches);
    if (!open) collapseServices();
    if (open) requestAnimationFrame(placePill);
  }

  function close() {
    setOpen(false);
  }

  function collapseServices() {
    if (!services || !servicesToggle) return;
    services.classList.remove("is-expanded");
    servicesToggle.setAttribute("aria-expanded", "false");
    const show = servicesToggle.getAttribute("data-label-show");
    if (show) servicesToggle.setAttribute("aria-label", show);
    else servicesToggle.setAttribute("aria-label", "Leistungen anzeigen");
  }

  function toggleServices() {
    if (!services || !servicesToggle) return;
    const open = !services.classList.contains("is-expanded");
    services.classList.toggle("is-expanded", open);
    servicesToggle.setAttribute("aria-expanded", open ? "true" : "false");
    const show = servicesToggle.getAttribute("data-label-show");
    const hide = servicesToggle.getAttribute("data-label-hide");
    if (show && hide) {
      servicesToggle.setAttribute("aria-label", open ? hide : show);
    } else {
      servicesToggle.setAttribute(
        "aria-label",
        open ? "Leistungen ausblenden" : "Leistungen anzeigen"
      );
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(!nav.classList.contains("is-open"));
  });

  servicesToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleServices();
  });

  panel.addEventListener("click", (event) => {
    if (event.target.closest(".nav__services-toggle")) return;
    const link = event.target.closest("a[href]");
    if (link) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });

  document.addEventListener("click", (event) => {
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(event.target)) return;
    close();
  });

  const onMq = () => {
    if (!mq.matches) {
      close();
      collapseServices();
    }
    requestAnimationFrame(placePill);
  };
  if (mq.addEventListener) mq.addEventListener("change", onMq);
  else mq.addListener(onMq);

  /* —— Current-page pill (GPU transform spill) —— */
  function currentTarget() {
    return nav.querySelector(
      '.nav__links > a[aria-current="page"], .nav__services-head > a[aria-current="page"], .nav__cta[aria-current="page"]'
    );
  }

  function measure(el) {
    const navBox = nav.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return null;
    const height = mq.matches ? box.height : 2.35 * 16;
    return {
      left: box.left - navBox.left,
      top: box.top - navBox.top + (box.height - height) / 2,
      width: box.width,
      height,
    };
  }

  let pill = nav.querySelector(".nav__pill");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "nav__pill";
    pill.setAttribute("aria-hidden", "true");
    nav.appendChild(pill);
  }

  let spillAnim = null;
  let animating = false;

  function applyPill(rect, scaleX = 1) {
    pill.style.width = `${rect.width}px`;
    pill.style.height = `${rect.height}px`;
    pill.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scaleX(${scaleX})`;
  }

  function placePill() {
    if (animating) return;
    const target = currentTarget();
    if (!target || (mq.matches && !nav.classList.contains("is-open"))) {
      pill.classList.remove("is-ready");
      return;
    }
    const to = measure(target);
    if (!to) return;
    if (spillAnim) {
      spillAnim.cancel();
      spillAnim = null;
    }
    pill.style.transformOrigin = "left center";
    applyPill(to, 1);
    pill.classList.add("is-ready");
  }

  function spillFromStored() {
    const target = currentTarget();
    if (!target || reduced) {
      placePill();
      return;
    }
    if (mq.matches && !nav.classList.contains("is-open")) {
      placePill();
      return;
    }

    let from = null;
    try {
      from = JSON.parse(sessionStorage.getItem(PILL_KEY) || "null");
      sessionStorage.removeItem(PILL_KEY);
    } catch (_) {}

    const to = measure(target);
    if (!to) return;
    if (!from || !from.width) {
      placePill();
      return;
    }

    from.height = to.height;
    from.top = to.top;

    const midLeft = Math.min(from.left, to.left);
    const midWidth = Math.abs(to.left - from.left) + Math.max(from.width, to.width);

    pill.style.width = `${to.width}px`;
    pill.style.height = `${to.height}px`;
    pill.style.transformOrigin = "left center";
    pill.classList.add("is-ready");

    const sxFrom = from.width / to.width;
    const sxMid = midWidth / to.width;

    if (spillAnim) spillAnim.cancel();
    animating = true;
    spillAnim = pill.animate(
      [
        { transform: `translate3d(${from.left}px, ${to.top}px, 0) scaleX(${sxFrom})` },
        {
          transform: `translate3d(${midLeft}px, ${to.top}px, 0) scaleX(${sxMid})`,
          offset: 0.42,
        },
        { transform: `translate3d(${to.left}px, ${to.top}px, 0) scaleX(1)` },
      ],
      { duration: 280, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "forwards" }
    );

    spillAnim.onfinish = () => {
      applyPill(to, 1);
      spillAnim = null;
      animating = false;
    };
    spillAnim.oncancel = () => {
      animating = false;
    };
  }

  function rememberPill() {
    const target = currentTarget();
    if (!target) return;
    const rect = measure(target);
    if (!rect) return;
    try {
      sessionStorage.setItem(PILL_KEY, JSON.stringify(rect));
    } catch (_) {}
  }

  nav.querySelectorAll("a[href]").forEach((link) => {
    if (link.classList.contains("nav__brand")) return;
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.getAttribute("aria-current") === "page") return;
      rememberPill();
    });
  });

  /* Prefetch on pointerdown so the next page is warm before navigation */
  const prefetched = new Set();
  function prefetchDoc(href) {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      const key = url.pathname + url.search;
      if (prefetched.has(key)) return;
      prefetched.add(key);
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.as = "document";
      link.href = key;
      document.head.appendChild(link);
    } catch (_) {}
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const a = event.target.closest?.("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      prefetchDoc(a.getAttribute("href"));
    },
    true
  );

  // Chromium: speculative prefetch for same-origin links
  if (HTMLScriptElement.supports?.("speculationrules")) {
    const spec = document.createElement("script");
    spec.type = "speculationrules";
    spec.textContent = JSON.stringify({
      prefetch: [
        {
          where: {
            and: [
              { href_matches: "/*" },
              { not: { selector_matches: "[target=_blank]" } },
            ],
          },
          eagerness: "moderate",
        },
      ],
    });
    document.head.appendChild(spec);
  }

  let resizeTick = 0;
  window.addEventListener("resize", () => {
    if (resizeTick) return;
    resizeTick = requestAnimationFrame(() => {
      resizeTick = 0;
      placePill();
    });
  });

  if (typeof ResizeObserver !== "undefined") {
    let roTick = 0;
    const ro = new ResizeObserver(() => {
      if (animating) return;
      if (roTick) return;
      roTick = requestAnimationFrame(() => {
        roTick = 0;
        placePill();
      });
    });
    const cur = currentTarget();
    if (cur) ro.observe(cur);
  }

  // Sync open/close labels from i18n after strings applied
  function cacheToggleLabels() {
    const lang = document.documentElement.lang === "en" ? "en" : "de";
    const labels =
      lang === "en"
        ? {
            open: "Open menu",
            close: "Close menu",
            show: "Show services",
            hide: "Hide services",
          }
        : {
            open: "Menü öffnen",
            close: "Menü schließen",
            show: "Leistungen anzeigen",
            hide: "Leistungen ausblenden",
          };
    toggle.setAttribute("data-label-open", labels.open);
    toggle.setAttribute("data-label-close", labels.close);
    toggle.setAttribute("aria-label", labels.open);
    if (servicesToggle) {
      servicesToggle.setAttribute("data-label-show", labels.show);
      servicesToggle.setAttribute("data-label-hide", labels.hide);
      servicesToggle.setAttribute("aria-label", labels.show);
    }
  }

  const READY = "elitedent:ready";
  let pendingFrom = null;
  try {
    pendingFrom = JSON.parse(sessionStorage.getItem(PILL_KEY) || "null");
    sessionStorage.removeItem(PILL_KEY);
  } catch (_) {
    pendingFrom = null;
  }

  function spillWithPending() {
    // Re-stash briefly so spillFromStored can read it
    if (pendingFrom) {
      try {
        sessionStorage.setItem(PILL_KEY, JSON.stringify(pendingFrom));
      } catch (_) {}
      pendingFrom = null;
    }
    spillFromStored();
  }

  function whenUiReady(fn) {
    let ran = false;
    const run = () => {
      if (ran) return;
      ran = true;
      fn();
    };

    if (document.documentElement.dataset.uiReady === "1") {
      run();
      return;
    }
    if (!document.documentElement.classList.contains("is-translating")) {
      run();
      return;
    }
    document.addEventListener(READY, run, { once: true });
    window.setTimeout(run, 4200);
  }

  const start = () => {
    cacheToggleLabels();
    whenUiReady(() => requestAnimationFrame(spillWithPending));
  };

  const home = document.querySelector(".home");
  if (home?.hidden) {
    const mo = new MutationObserver(() => {
      if (home.hidden) return;
      mo.disconnect();
      requestAnimationFrame(start);
    });
    mo.observe(home, { attributes: true, attributeFilter: ["hidden"] });
  } else if (document.readyState === "complete") {
    requestAnimationFrame(start);
  } else {
    window.addEventListener("load", () => requestAnimationFrame(start));
  }
})();
