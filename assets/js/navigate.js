(() => {
  const warmed = new Set();
  const touch = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
  const isArc = /Arc\//.test(navigator.userAgent);

  // model-viewer reads this when it loads: the decoder for our meshopt-compressed models
  // (scripts/optimize-glb.cjs). Set here because this runs before any page loads model-viewer.
  window.ModelViewerElement = { ...window.ModelViewerElement, meshoptDecoderLocation: "/assets/js/meshopt_decoder.js" };

  /* Arc/Chromium variants: page cross-fades add latency without matching Chrome/Safari smoothness */
  if (isArc) {
    document.documentElement.classList.add("no-page-transition");
    const style = document.createElement("style");
    style.textContent =
      "@media (prefers-reduced-motion: no-preference){@view-transition{navigation:none}}";
    document.head.appendChild(style);
  }

  /* Page veil (critical.css): the page is covered while it is left and while the next one loads, so
     nothing is seen half-built. Arriving: it lifts once what's on screen (images, the hero video,
     3D models, fonts) is ready, or after ARRIVE_MAX_MS at most. Leaving: the page fades out, then
     the browser navigates. A spinner appears whenever the wait gets noticeable. */
  const root = document.documentElement;
  const ARRIVE_MAX_MS = 3500;
  const LEAVE_MS = 220;
  const FILE_EXT = /\.(?!html?$)[a-z0-9]+$/i;
  let leaveTimer = 0;

  // The home splash is its own loading screen
  let splashNext = false;
  try {
    splashNext =
      /^\/(?:home\/?)?(?:index\.html)?$/.test(location.pathname) &&
      !sessionStorage.getItem("elitedent-splash");
  } catch (_) {}

  function arrived() {
    root.classList.remove("is-arriving");
  }

  function onScreenReady() {
    const inView = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const once = (el, ...types) =>
      new Promise((res) => types.forEach((type) => el.addEventListener(type, res, { once: true })));
    const waits = [document.fonts?.ready];
    for (const el of document.querySelectorAll("img, video, model-viewer")) {
      if (el.closest(".site-guide, .guide-hub") || !inView(el)) continue;
      if (el.tagName === "IMG") waits.push(el.decode?.().catch(() => {}));
      else if (el.tagName === "VIDEO") {
        if (el.readyState < 2) waits.push(once(el, "loadeddata", "error"));
      } else if (!el.loaded) waits.push(once(el, "load", "error"));
    }
    return Promise.all(waits);
  }

  // 3D models that finish after the veil has lifted fade in (critical.css) instead of popping.
  // model-viewer's load event doesn't bubble, so it is caught on the way down.
  document.addEventListener(
    "load",
    (event) => {
      if (event.target.tagName === "MODEL-VIEWER") event.target.classList.add("is-loaded");
    },
    true
  );

  if (!splashNext) {
    root.classList.add("is-arriving");
    setTimeout(arrived, ARRIVE_MAX_MS);
    document.addEventListener("DOMContentLoaded", () => {
      onScreenReady().then(() => requestAnimationFrame(arrived));
    });
  }

  function stopLeaving() {
    clearTimeout(leaveTimer);
    root.classList.remove("is-leaving");
  }

  function leave() {
    root.classList.add("is-leaving");
    // A navigation that never happens (cancelled, or a download) hands the page back
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(stopLeaving, 15000);
  }

  // Back/forward can restore this page from the cache exactly as it was left: veiled
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      stopLeaving();
      arrived();
    }
  });
  // Scripted navigations (the guide's topics) announce themselves
  document.addEventListener("elitedent:leave", leave);

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

  /* Email links: a mailto: opens the visitor's own mail app, which many desktop visitors (webmail
     only) don't have set up, so the click seemed to do nothing. Instead a small chooser opens a new
     message in their webmail (or the mail app), or copies the address. */
  const WEBMAIL = [
    ["Gmail", (to) => `https://mail.google.com/mail/?view=cm&fs=1&to=${to}`],
    ["Outlook", (to) => `https://outlook.live.com/mail/0/deeplink/compose?to=${to}`],
    ["Yahoo", (to) => `https://compose.mail.yahoo.com/?to=${to}`],
  ];
  let mailDialog = null;

  // In-app browsers often refuse the Clipboard API; the old copy command still works there
  function legacyCopy(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;opacity:0";
    (mailDialog?.open ? mailDialog : document.body).appendChild(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (_) {}
    field.remove();
    if (!ok) throw new Error("copy failed");
  }

  function openMailChooser(address) {
    const en = root.lang === "en";
    const to = encodeURIComponent(address);
    if (!mailDialog) {
      mailDialog = document.createElement("dialog");
      mailDialog.className = "mail-chooser notranslate";
      mailDialog.setAttribute("translate", "no");
      // A click on the backdrop lands on the dialog itself
      mailDialog.addEventListener("click", (event) => {
        if (event.target === mailDialog) mailDialog.close();
      });
      document.body.appendChild(mailDialog);
    }
    mailDialog.innerHTML =
      `<p class="mail-chooser__title">${en ? "Write to us" : "Schreiben Sie uns"}</p>` +
      `<p class="mail-chooser__address"></p>` +
      `<div class="mail-chooser__options">` +
      WEBMAIL.map(([name, url]) => `<a href="${url(to)}" target="_blank" rel="noopener">${name}</a>`).join("") +
      `<a href="mailto:${to}" data-mail-app>${en ? "Mail app" : "Mail-App"}</a>` +
      `<button type="button" data-copy>${en ? "Copy address" : "Adresse kopieren"}</button>` +
      `</div>` +
      `<button type="button" class="mail-chooser__close" aria-label="${en ? "Close" : "Schließen"}">×</button>`;
    mailDialog.querySelector(".mail-chooser__address").textContent = address;
    mailDialog.querySelector(".mail-chooser__close").addEventListener("click", () => mailDialog.close());
    mailDialog.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => mailDialog.close()));
    const copyBtn = mailDialog.querySelector("[data-copy]");
    copyBtn.addEventListener("click", () => {
      new Promise((resolve) => resolve(navigator.clipboard ? navigator.clipboard.writeText(address) : legacyCopy(address)))
        .catch(() => legacyCopy(address))
        .then(() => {
          copyBtn.textContent = en ? "Copied ✓" : "Kopiert ✓";
        })
        .catch(() => {});
    });
    mailDialog.showModal();
  }

  document.addEventListener("click", (event) => {
    const a = event.target.closest?.('a[href^="mailto:"]');
    if (!a || a.hasAttribute("data-mail-app") || typeof HTMLDialogElement === "undefined") return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openMailChooser(decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]));
  });

  document.addEventListener("click", (event) => {
    const a = fromLink(event);
    if (!a || event.button !== 0 || !urlKey(a.href)) return;
    if (FILE_EXT.test(new URL(a.href).pathname)) return;
    leave();
    // The mobile dock cancels the click and navigates itself; everything else waits for the fade
    if (event.defaultPrevented) return;
    event.preventDefault();
    setTimeout(() => location.assign(a.href), LEAVE_MS);
  });

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
