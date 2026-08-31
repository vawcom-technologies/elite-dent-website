(() => {
  const KEY = "elitedent-ui-lang";
  const SOURCE = "de";
  const DEFAULT = "de";
  const READY = "elitedent:ready";

  const STRINGS = {
    home: { de: "Startseite", en: "Home" },
    services: { de: "Leistungen", en: "Services" },
    about: { de: "Über uns", en: "About" },
    consult: { de: "Jetzt beraten", en: "Consult now" },
    book: { de: "Beratung buchen", en: "Book a consultation" },
    whitening: { de: "Bleaching", en: "Whitening" },
    aligners: { de: "Aligner", en: "Aligners" },
    veneers: { de: "Veneers", en: "Veneers" },
    implants: { de: "Implantate", en: "Implants" },
    preventive: { de: "Prophylaxe", en: "Preventive" },
    restorative: { de: "Zahnerhaltung", en: "Restorative" },
    "nav-label": { de: "Hauptnavigation", en: "Main navigation" },
    "footer-label": { de: "Fußzeile", en: "Footer" },
    "lang-label": { de: "Sprache", en: "Language" },
  };

  function storedLang() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "de" || v === "en") return v;
    } catch (_) {}
    return DEFAULT;
  }

  function setStored(lang) {
    try {
      localStorage.setItem(KEY, lang);
    } catch (_) {}
  }

  function setGoogTransCookie(lang) {
    const host = location.hostname;
    const clear = "Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = `googtrans=; expires=${clear}; path=/`;
    document.cookie = `googtrans=; expires=${clear}; path=/; domain=${host}`;
    if (host !== "localhost" && host !== "127.0.0.1") {
      document.cookie = `googtrans=; expires=${clear}; path=/; domain=.${host}`;
    }
    // Only EN needs Google (DE is the authored source)
    if (lang === "en") {
      document.cookie = "googtrans=/de/en; path=/";
      if (host !== "localhost" && host !== "127.0.0.1") {
        document.cookie = `googtrans=/de/en; path=/; domain=.${host}`;
      }
    }
  }

  function applyUiStrings(lang) {
    const L = lang === "en" ? "en" : "de";
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const entry = STRINGS[key];
      if (!entry) return;
      el.textContent = entry[L];
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      const entry = STRINGS[key];
      if (!entry) return;
      el.setAttribute("aria-label", entry[L]);
    });
  }

  function syncButtons(lang) {
    document.querySelectorAll(".lang-toggle [data-lang]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === lang ? "true" : "false");
    });
    document.documentElement.lang = lang === "de" ? "de" : "en";
    applyUiStrings(lang);
  }

  function loadGoogleTranslator() {
    if (document.getElementById("elitedent-gt-script")) return;

    window.googleTranslateElementInit = function googleTranslateElementInit() {
      new google.translate.TranslateElement(
        {
          pageLanguage: SOURCE,
          includedLanguages: "en,de",
          autoDisplay: false,
        },
        "google_translate_element"
      );
    };

    const script = document.createElement("script");
    script.id = "elitedent-gt-script";
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.head.appendChild(script);
  }

  function signalReady() {
    document.documentElement.classList.remove("is-translating");
    document.documentElement.dataset.uiReady = "1";
    document.dispatchEvent(new Event(READY));
  }

  const lang = storedLang();
  setGoogTransCookie(lang);

  if (!localStorage.getItem(KEY)) {
    try {
      localStorage.setItem(KEY, DEFAULT);
    } catch (_) {}
  }

  // DE is native HTML — instant. Google only when viewing in English.
  if (lang === "en") {
    document.documentElement.classList.add("is-translating");
    loadGoogleTranslator();

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      signalReady();
    };

    const obs = new MutationObserver(() => {
      if (document.documentElement.classList.contains("translated-ltr")) {
        obs.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(done));
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.setTimeout(done, 4000);
  } else {
    signalReady();
  }

  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    syncButtons(lang);

    document.addEventListener("click", (event) => {
      const btn = event.target.closest?.(".lang-toggle [data-lang]");
      if (!btn) return;
      event.preventDefault();

      const next = btn.getAttribute("data-lang");
      if (next !== "en" && next !== "de") return;
      if (next === storedLang()) return;

      setStored(next);
      setGoogTransCookie(next);
      syncButtons(next);
      location.reload();
    });
  });
})();
