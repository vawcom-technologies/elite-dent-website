(() => {
  const KEY = "elitedent-ui-lang";
  const SOURCE = "en";

  function storedLang() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "de" || v === "en") return v;
    } catch (_) {}
    return SOURCE;
  }

  function setStored(lang) {
    try {
      localStorage.setItem(KEY, lang);
    } catch (_) {}
  }

  function setGoogTransCookie(lang) {
    const host = location.hostname;
    const clear = "Thu, 01 Jan 1970 00:00:00 GMT";
    // Clear any previous value (host + leading-dot domain)
    document.cookie = `googtrans=; expires=${clear}; path=/`;
    document.cookie = `googtrans=; expires=${clear}; path=/; domain=${host}`;
    if (host !== "localhost" && host !== "127.0.0.1") {
      document.cookie = `googtrans=; expires=${clear}; path=/; domain=.${host}`;
    }
    if (lang === "de") {
      document.cookie = "googtrans=/en/de; path=/";
      if (host !== "localhost" && host !== "127.0.0.1") {
        document.cookie = `googtrans=/en/de; path=/; domain=.${host}`;
      }
    }
  }

  function syncButtons(lang) {
    document.querySelectorAll(".lang-toggle [data-lang]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-lang") === lang ? "true" : "false");
    });
    document.documentElement.lang = lang === "de" ? "de" : "en";
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

  const lang = storedLang();
  setGoogTransCookie(lang);

  // Only pull in Google when German is active (keeps EN pages fast)
  if (lang === "de") {
    document.documentElement.classList.add("is-translating");
    loadGoogleTranslator();

    const done = () => {
      document.documentElement.classList.remove("is-translating");
    };

    // Google marks <html> with translated-ltr when finished
    const obs = new MutationObserver(() => {
      if (document.documentElement.classList.contains("translated-ltr")) {
        obs.disconnect();
        done();
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.setTimeout(done, 4000);
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

      // Instant switch: cookie + reload (no waiting for Google's combo box)
      setStored(next);
      setGoogTransCookie(next);
      syncButtons(next);
      location.reload();
    });
  });
})();
