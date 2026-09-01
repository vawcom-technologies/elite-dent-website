(() => {
  const host = document.getElementById("stats-sparkletooth");
  if (!host || typeof lottie === "undefined") return;

  const card = host.closest(".stats-card");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let started = false;

  const start = () => {
    if (started) return;
    started = true;

    const anim = lottie.loadAnimation({
      container: host,
      renderer: "svg",
      loop: !reduced,
      autoplay: !reduced,
      path: "assets/lottie/sparkletooth.json?v=1",
    });

    if (reduced) {
      anim.addEventListener("DOMLoaded", () => {
        anim.goToAndStop(0, true);
      });
    }
  };

  const tryStart = () => {
    if (card?.classList.contains("is-in")) start();
  };

  const boot = () => {
    if (!card) {
      start();
      return;
    }

    tryStart();

    const classObserver = new MutationObserver(tryStart);
    classObserver.observe(card, { attributes: true, attributeFilter: ["class"] });

    if (!("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        tryStart();
        io.disconnect();
      },
      { threshold: 0.15, rootMargin: "0px 0px 8% 0px" }
    );
    io.observe(card);
  };

  const home = document.querySelector(".home");
  if (home?.hidden) {
    const mo = new MutationObserver(() => {
      if (home.hidden) return;
      mo.disconnect();
      requestAnimationFrame(boot);
    });
    mo.observe(home, { attributes: true, attributeFilter: ["hidden"] });
  } else {
    boot();
  }
})();
