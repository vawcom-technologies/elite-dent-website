(() => {
  const KEY = "elitedent-lang";
  const html = document.documentElement;
  const titles = {
    de: html.getAttribute("data-title-de") || document.title,
    en: html.getAttribute("data-title-en") || document.title,
  };
  const descs = {
    de: html.getAttribute("data-desc-de") || "",
    en: html.getAttribute("data-desc-en") || "",
  };

  const params = new URLSearchParams(window.location.search);
  const q = params.get("lang");
  let lang = q === "en" || q === "de" ? q : null;
  if (!lang) {
    try {
      lang = localStorage.getItem(KEY);
    } catch (_) {
      lang = null;
    }
  }
  if (lang !== "en") lang = "de";

  function apply(next) {
    html.lang = next;
    try {
      localStorage.setItem(KEY, next);
    } catch (_) {}
    document.title = titles[next];
    const meta = document.getElementById("meta-desc");
    if (meta && descs[next]) meta.setAttribute("content", descs[next]);
    document.querySelectorAll("[data-set-lang]").forEach((btn) => {
      btn.setAttribute(
        "aria-pressed",
        btn.getAttribute("data-set-lang") === next ? "true" : "false"
      );
    });
  }

  apply(lang);
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-set-lang]");
    if (!btn) return;
    e.preventDefault();
    apply(btn.getAttribute("data-set-lang"));
  });
})();
