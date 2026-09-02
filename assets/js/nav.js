(() => {
  const nav = document.querySelector(".nav");
  const toggle = document.querySelector(".nav__toggle");
  const panel = document.getElementById("nav-panel");
  if (!nav || !panel) return;

  const mq = window.matchMedia("(max-width: 767px)");
  const services = nav.querySelector(".nav__services");
  const servicesToggle = nav.querySelector(".nav__services-toggle");
  const PILL_KEY = "elitedent-nav-pill";
  const DOCK_KEY = "elitedent-dock-tab";
  const DOCK_PILL_KEY = "elitedent-dock-pill";
  const DESKTOP_SPILL_MS = 150;
  const MOBILE_SPILL_MS = 280;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let dock = null;
  let dockPill = null;
  let dockBackdrop = null;

  const DOCK_ICONS = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>',
    services:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a2 2 0 0 1 2 2v14l-8-3-8 3V6a2 2 0 0 1 2-2z"/></svg>',
    assess:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M8.5 12.5c.6 1.2 1.7 2 3 2.2 1.8.3 3.4-.8 3.9-2.4"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>',
  };

  function inSubpage() {
    return /\/(services|about|assess|book)(\/|$)/.test(location.pathname);
  }

  function pagePrefix() {
    return inSubpage() ? "../" : "";
  }

  function dockHref(key) {
    const up = inSubpage() ? "../" : "";
    if (key === "home") return inSubpage() ? "../" : "./";
    if (key === "services") return `${up}services/`;
    if (key === "assess") return `${up}assess/`;
    return "#";
  }

  function currentDockKey() {
    const path = location.pathname.replace(/\/index\.html$/, "");
    if (/\/assess\/?$/.test(path)) return "assess";
    if (/\/services\/?$/.test(path)) return "services";
    if (!inSubpage() || path === "" || path === "/") return "home";
    return null;
  }

  function dockLabel(key) {
    const lang = document.documentElement.lang === "en" ? "en" : "de";
    const labels = {
      home: { de: "Start", en: "Home" },
      services: { de: "Leistungen", en: "Services" },
      assess: { de: "Check", en: "Check" },
      more: { de: "Mehr", en: "More" },
    };
    return labels[key]?.[lang] || key;
  }

  function destroyDock() {
    dock?.remove();
    dockBackdrop?.remove();
    dock = null;
    dockPill = null;
    dockBackdrop = null;
  }

  function warmDockTargets() {
    ["home", "services", "assess"].forEach((key) => {
      try {
        const keyPath = new URL(dockHref(key), location.href).pathname;
        if (warmedPaths.has(keyPath)) return;
        warmedPaths.add(keyPath);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "document";
        link.href = keyPath;
        document.head.appendChild(link);
      } catch (_) {}
    });
  }

  const warmedPaths = new Set();

  function mountMobilePanel() {
    if (!mq.matches || panel.parentElement === document.body) return;
    document.body.appendChild(panel);
  }

  function restorePanel() {
    if (panel.parentElement !== document.body) return;
    nav.appendChild(panel);
  }

  function buildDock() {
    destroyDock();
    if (!mq.matches) return;

    mountMobilePanel();

    dockBackdrop = document.createElement("button");
    dockBackdrop.type = "button";
    dockBackdrop.className = "nav-dock__backdrop";
    dockBackdrop.setAttribute("aria-label", "Menü schließen");
    dockBackdrop.hidden = true;

    dock = document.createElement("nav");
    dock.className = "nav-dock notranslate";
    dock.setAttribute("translate", "no");
    dock.setAttribute("aria-label", "App-Navigation");

    const track = document.createElement("div");
    track.className = "nav-dock__track";

    dockPill = document.createElement("span");
    dockPill.className = "nav-dock__pill";
    dockPill.setAttribute("aria-hidden", "true");
    track.appendChild(dockPill);

    const activeKey = currentDockKey();

    ["home", "services", "assess"].forEach((key) => {
      const link = document.createElement("a");
      link.className = "nav-dock__item";
      link.href = dockHref(key);
      link.dataset.dock = key;
      link.innerHTML = `${DOCK_ICONS[key]}<span>${dockLabel(key)}</span>`;
      if (key === activeKey) link.setAttribute("aria-current", "page");
      track.appendChild(link);
    });

    const more = document.createElement("button");
    more.type = "button";
    more.className = "nav-dock__item";
    more.dataset.dock = "more";
    more.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-controls", "nav-panel");
    more.innerHTML = `${DOCK_ICONS.more}<span>${dockLabel("more")}</span>`;
    track.appendChild(more);

    dock.appendChild(track);
    document.body.appendChild(dockBackdrop);
    document.body.appendChild(dock);

    more.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!nav.classList.contains("is-open"));
    });

    dockBackdrop.addEventListener("click", close);

    dock.querySelectorAll("a.nav-dock__item").forEach((link) => {
      link.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (link.getAttribute("aria-current") === "page") return;
        resetNavState();
        rememberDockTab(link.dataset.dock);
        applyDockPill(link, true);
      });

      link.addEventListener("click", (event) => {
        if (link.getAttribute("aria-current") === "page") {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        resetNavState();
        const fromTab = dock.querySelector('.nav-dock__item[aria-current="page"]');
        if (fromTab) rememberDockPill(fromTab);
        rememberDockTab(link.dataset.dock);
        applyDockPill(link, true);
        const dest = link.getAttribute("href");
        if (dest) window.location.href = dest;
      });
    });

    warmDockTargets();
    requestAnimationFrame(() => placeDockPill(true));
  }

  function measureDockItem(el) {
    const track = dock?.querySelector(".nav-dock__track");
    if (!track || !el) return null;
    const trackBox = track.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (box.width < 2) return null;
    return {
      left: box.left - trackBox.left,
      width: box.width,
    };
  }

  function rememberDockPill(fromEl) {
    const rect = measureDockItem(fromEl);
    if (!rect) return;
    try {
      sessionStorage.setItem(DOCK_PILL_KEY, JSON.stringify(rect));
    } catch (_) {}
  }

  function spillDockFromStored() {
    if (!mq.matches || reduced) {
      placeDockPill(true);
      return;
    }

    let from = null;
    try {
      from = JSON.parse(sessionStorage.getItem(DOCK_PILL_KEY) || "null");
      sessionStorage.removeItem(DOCK_PILL_KEY);
    } catch (_) {}

    const target = dock?.querySelector('.nav-dock__item[aria-current="page"]');
    if (!target || !from?.width) {
      placeDockPill(true);
      return;
    }

    const to = measureDockItem(target);
    if (!to) {
      placeDockPill(true);
      return;
    }

    const midLeft = Math.min(from.left, to.left);
    const midWidth = Math.abs(to.left - from.left) + Math.max(from.width, to.width);
    const sxFrom = from.width / to.width;
    const sxMid = midWidth / to.width;

    dockPill.classList.add("is-instant", "is-ready");
    dockPill.style.width = `${to.width}px`;
    dockPill.style.transformOrigin = "left center";

    dock.querySelectorAll(".nav-dock__item").forEach((item) => {
      item.classList.toggle("is-active", item === target);
    });

    const anim = dockPill.animate(
      [
        { transform: `translate3d(${from.left}px, 0, 0) scaleX(${sxFrom})` },
        {
          transform: `translate3d(${midLeft}px, 0, 0) scaleX(${sxMid})`,
          offset: 0.45,
        },
        { transform: `translate3d(${to.left}px, 0, 0) scaleX(1)` },
      ],
      {
        duration: MOBILE_SPILL_MS,
        easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        fill: "forwards",
      }
    );

    anim.onfinish = () => {
      dockPill.classList.remove("is-instant");
      applyDockPill(target, false);
    };
    anim.oncancel = () => {
      dockPill.classList.remove("is-instant");
      applyDockPill(target, false);
    };
  }

  function rememberDockTab(key) {
    if (!key || key === "more") return;
    try {
      sessionStorage.setItem(DOCK_KEY, key);
    } catch (_) {}
  }

  function readDockTab() {
    try {
      const key = sessionStorage.getItem(DOCK_KEY);
      sessionStorage.removeItem(DOCK_KEY);
      return key;
    } catch (_) {
      return null;
    }
  }

  function syncDockActive() {
    if (!dock) return;
    const activeKey = currentDockKey();
    dock.querySelectorAll("a.nav-dock__item").forEach((link) => {
      if (link.dataset.dock === activeKey) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function applyDockPill(target, instant = false) {
    if (!mq.matches || !dockPill || !dock || !target) return;
    const track = dock.querySelector(".nav-dock__track");
    if (!track) return;

    const trackBox = track.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    if (box.width < 2) return;

    dockPill.classList.toggle("is-instant", instant);
    dockPill.style.width = `${box.width}px`;
    dockPill.style.transform = `translate3d(${box.left - trackBox.left}px, 0, 0)`;
    dockPill.classList.add("is-ready");

    dock.querySelectorAll(".nav-dock__item").forEach((item) => {
      item.classList.toggle("is-active", item === target);
    });

    if (instant) {
      requestAnimationFrame(() => dockPill.classList.remove("is-instant"));
    }
  }

  function placeDockPill(instant = false) {
    if (!mq.matches || !dockPill || !dock) return;

    const target =
      (nav.classList.contains("is-open")
        ? dock.querySelector('.nav-dock__item[data-dock="more"]')
        : null) || dock.querySelector('.nav-dock__item[aria-current="page"]');

    if (!target) {
      dockPill.classList.remove("is-ready");
      dock.querySelectorAll(".nav-dock__item").forEach((item) => {
        item.classList.remove("is-active");
      });
      return;
    }

    applyDockPill(target, instant);
  }

  function resetNavState() {
    nav.classList.remove("is-open");
    document.documentElement.classList.remove("nav-lock");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    const moreBtn = dock?.querySelector('.nav-dock__item[data-dock="more"]');
    moreBtn?.setAttribute("aria-expanded", "false");
    dockBackdrop?.classList.remove("is-visible");
    if (dockBackdrop) dockBackdrop.hidden = true;
    collapseServices();
  }

  function setOpen(open) {
    if (open) nav.classList.add("is-open");
    else nav.classList.remove("is-open");

    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const moreBtn = dock?.querySelector('.nav-dock__item[data-dock="more"]');
    moreBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    dockBackdrop?.classList.toggle("is-visible", open && mq.matches);
    if (dockBackdrop) dockBackdrop.hidden = !(open && mq.matches);
    const openText = toggle?.getAttribute("data-label-open");
    const closeText = toggle?.getAttribute("data-label-close");
    if (toggle) {
      if (openText && closeText) {
        toggle.setAttribute("aria-label", open ? closeText : openText);
      } else {
        toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
      }
    }
    document.documentElement.classList.toggle("nav-lock", open && mq.matches);
    if (!open) collapseServices();
    if (open && !mq.matches) requestAnimationFrame(placePill);
    requestAnimationFrame(() => placeDockPill(false));
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

  toggle?.addEventListener("click", () => {
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
    if (!mq.matches || !nav.classList.contains("is-open")) return;
    if (panel.contains(event.target)) return;
    if (dock?.contains(event.target)) return;
    if (dockBackdrop?.contains(event.target)) return;
    close();
  });

  window.addEventListener("pagehide", () => {
    resetNavState();
  });

  window.addEventListener("pageshow", () => {
    resetNavState();
    if (mq.matches) {
      if (!dock) buildDock();
      else syncDockActive();
      warmDockTargets();
    }
    requestAnimationFrame(() => spillDockFromStored());
  });

  const onMq = () => {
    if (!mq.matches) {
      close();
      collapseServices();
      destroyDock();
      restorePanel();
    } else {
      buildDock();
    }
    requestAnimationFrame(placePill);
    requestAnimationFrame(placeDockPill);
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
      { duration: DESKTOP_SPILL_MS, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "forwards" }
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
    if (link.closest(".nav-dock")) return;
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.getAttribute("aria-current") === "page") return;
      if (mq.matches) return;
      rememberPill();
    });
  });

  let resizeTick = 0;
  window.addEventListener("resize", () => {
    if (resizeTick) return;
    resizeTick = requestAnimationFrame(() => {
      resizeTick = 0;
      placePill();
      placeDockPill();
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
            dock: "App navigation",
            backdrop: "Close menu",
          }
        : {
            open: "Menü öffnen",
            close: "Menü schließen",
            show: "Leistungen anzeigen",
            hide: "Leistungen ausblenden",
            dock: "App-Navigation",
            backdrop: "Menü schließen",
          };
    toggle?.setAttribute("data-label-open", labels.open);
    toggle?.setAttribute("data-label-close", labels.close);
    toggle?.setAttribute("aria-label", labels.open);
    dock?.setAttribute("aria-label", labels.dock);
    dockBackdrop?.setAttribute("aria-label", labels.backdrop);
    if (servicesToggle) {
      servicesToggle.setAttribute("data-label-show", labels.show);
      servicesToggle.setAttribute("data-label-hide", labels.hide);
      servicesToggle.setAttribute("aria-label", labels.show);
    }
    if (mq.matches && dock) {
      dock.querySelectorAll(".nav-dock__item").forEach((item) => {
        const key = item.dataset.dock;
        const label = item.querySelector("span");
        if (label && key) label.textContent = dockLabel(key);
      });
    }
  }

  const READY = "elitedent:ready";
  let pendingFrom = null;
  if (!mq.matches) {
    try {
      pendingFrom = JSON.parse(sessionStorage.getItem(PILL_KEY) || "null");
      sessionStorage.removeItem(PILL_KEY);
    } catch (_) {
      pendingFrom = null;
    }
  } else {
    try {
      sessionStorage.removeItem(PILL_KEY);
    } catch (_) {}
  }

  function spillWithPending() {
    if (mq.matches) {
      spillDockFromStored();
      return;
    }

    if (pendingFrom) {
      try {
        sessionStorage.setItem(PILL_KEY, JSON.stringify(pendingFrom));
      } catch (_) {}
      pendingFrom = null;
    }
    spillFromStored();
  }

  function whenLayoutStable(fn) {
    const run = () => requestAnimationFrame(() => requestAnimationFrame(fn));
    if (document.fonts?.ready) {
      document.fonts.ready.then(run).catch(run);
    } else {
      run();
    }
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

  function settleNavPill() {
    whenUiReady(() => whenLayoutStable(spillWithPending));
  }

  function bootMobileDock() {
    buildDock();
    cacheToggleLabels();
    requestAnimationFrame(() => spillDockFromStored());
  }

  function bootDesktopNav() {
    cacheToggleLabels();
    const homeEl = document.querySelector(".home");
    if (homeEl && !homeEl.classList.contains("is-splash-complete")) {
      document.addEventListener("elitedent:splash-complete", settleNavPill, { once: true });
      return;
    }
    settleNavPill();
  }

  const start = () => {
    if (mq.matches) bootMobileDock();
    else bootDesktopNav();
  };

  document.addEventListener("elitedent:ready", () => {
    cacheToggleLabels();
    if (mq.matches) whenLayoutStable(() => placeDockPill(true));
    else whenLayoutStable(placePill);
  });

  document.addEventListener("elitedent:splash-complete", () => {
    if (mq.matches) whenLayoutStable(() => placeDockPill(true));
    else settleNavPill();
  });

  const home = document.querySelector(".home");
  if (mq.matches) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } else if (home?.hidden) {
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
