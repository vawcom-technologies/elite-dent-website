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
        left: "0",
        top: "0",
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        transformOrigin: "0 0",
        transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
        borderRadius: "999px",
      });
      document.body.appendChild(veil);

      try {
        sessionStorage.setItem(KEY, "1");
      } catch (_) {}

      const sx = Math.max(1, window.innerWidth / Math.max(1, rect.width));
      const sy = Math.max(1, window.innerHeight / Math.max(1, rect.height));
      const fly =
        typeof veil.animate === "function"
          ? veil.animate(
              [
                {
                  transform: `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1, 1)`,
                  borderRadius: "999px",
                },
                {
                  transform: `translate3d(0, 0, 0) scale(${sx}, ${sy})`,
                  borderRadius: "0px",
                },
              ],
              {
                duration: 450,
                easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
                fill: "forwards",
              },
            )
          : null;
      if (!fly) veil.classList.add("is-expanding");

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
