(() => {
  const KEY = "elitedent-assess-expand";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cta = document.querySelector("[data-assess-expand]");
  if (cta) {
    cta.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (reduced) return;

      event.preventDefault();
      const href = cta.href;
      const rect = cta.getBoundingClientRect();

      cta.classList.add("is-armed");

      const veil = document.createElement("div");
      veil.className = "assess-expand-veil";
      veil.setAttribute("aria-hidden", "true");
      Object.assign(veil.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      document.body.appendChild(veil);

      try {
        sessionStorage.setItem(KEY, "1");
      } catch (_) {}

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          veil.classList.add("is-expanding");
        });
      });

      window.setTimeout(() => {
        location.href = href;
      }, 480);
    });
  }

  // Assess page: hold navy veil, then reveal content from center
  if (!document.body.classList.contains("page--assess")) return;

  let pending = false;
  try {
    pending = sessionStorage.getItem(KEY) === "1";
    sessionStorage.removeItem(KEY);
  } catch (_) {}

  if (!pending || reduced) return;

  document.documentElement.classList.add("assess-reveal");
  const veil = document.createElement("div");
  veil.className = "assess-expand-veil is-expanding assess-expand-veil--arrive";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      veil.classList.add("is-revealing");
      document.documentElement.classList.add("assess-reveal-ready");
    });
  });

  window.setTimeout(() => {
    veil.remove();
    document.documentElement.classList.remove("assess-reveal", "assess-reveal-ready");
  }, 520);
})();
