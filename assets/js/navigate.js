(() => {
  const warmed = new Set();
  const touch = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
  const isArc = /Arc\//.test(navigator.userAgent);
  const NAV_KEY = "elitedent-nav";
  const hasViewTransition =
    typeof CSS !== "undefined" &&
    CSS.supports("(view-transition-name: none)") &&
    !document.documentElement.classList.contains("no-page-transition");

  /* Arc/Chromium variants: page cross-fades add latency without matching Chrome/Safari smoothness */
  if (isArc) {
    document.documentElement.classList.add("no-page-transition");
    const style = document.createElement("style");
    style.textContent =
      "@media (prefers-reduced-motion: no-preference){@view-transition{navigation:none}}";
    document.head.appendChild(style);
  }

  if (touch && !hasViewTransition) {
    try {
      if (sessionStorage.getItem(NAV_KEY)) {
        sessionStorage.removeItem(NAV_KEY);
        document.documentElement.classList.add("page-from-nav");
      }
    } catch (_) {}
  }

  function urlKey(href) {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return null;
      if (url.pathname === location.pathname && url.search === location.search) return null;
      return url.pathname + url.search;
    } catch (_) {
      return null;
    }
  }

  function warm(href, prerender = false) {
    const key = urlKey(href);
    if (!key || warmed.has(key)) return;
    warmed.add(key);

    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = key;
    document.head.appendChild(link);

    if (prerender && !touch && !isArc && HTMLScriptElement.supports?.("speculationrules")) {
      const spec = document.createElement("script");
      spec.type = "speculationrules";
      spec.textContent = JSON.stringify({
        prerender: [{ source: "list", urls: [new URL(href, location.href).href] }],
      });
      document.head.appendChild(spec);
    }
  }

  function fromLink(event) {
    const a = event.target.closest?.("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return null;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    return a;
  }

  if (!touch) {
    document.addEventListener(
      "mouseover",
      (event) => {
        const a = fromLink(event);
        if (a) warm(a.href, true);
      },
      { passive: true }
    );
  }

  document.addEventListener(
    "focusin",
    (event) => {
      const a = fromLink(event);
      if (a) warm(a.href, !touch);
    },
    { passive: true }
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const a = fromLink(event);
      if (a) warm(a.href, false);
    },
    { capture: true, passive: true }
  );

  if (touch) {
    document.addEventListener(
      "click",
      (event) => {
        const a = fromLink(event);
        if (!a) return;
        try {
          sessionStorage.setItem(NAV_KEY, "1");
        } catch (_) {}
      },
      { capture: true, passive: true }
    );
  }

  if (HTMLScriptElement.supports?.("speculationrules")) {
    const spec = document.createElement("script");
    spec.type = "speculationrules";
    spec.textContent = JSON.stringify({
      prefetch: [
        {
          where: {
            and: [
              { href_matches: "/*" },
              { not: { selector_matches: "[target=_blank],[download]" } },
            ],
          },
          eagerness: touch ? "moderate" : "eager",
        },
      ],
    });
    document.head.appendChild(spec);
  }
})();
