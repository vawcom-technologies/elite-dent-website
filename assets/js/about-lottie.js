(() => {
  const host = document.getElementById("about-preview-lottie");
  if (!host || typeof lottie === "undefined") return;

  const section = host.closest(".about-preview");
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
      path: "assets/lottie/lottie2.json?v=2",
    });

    if (reduced) {
      anim.addEventListener("DOMLoaded", () => {
        anim.goToAndStop(Math.floor(anim.totalFrames * 0.45), true);
      });
    }
  };

  const tryStart = () => {
    if (!section || section.classList.contains("is-in")) start();
  };

  const boot = () => {
    if (!section) {
      start();
      return;
    }

    tryStart();

    const classObserver = new MutationObserver(tryStart);
    classObserver.observe(section, { attributes: true, attributeFilter: ["class"] });

    if (!("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        tryStart();
        io.disconnect();
      },
      { threshold: 0.2, rootMargin: "0px 0px 10% 0px" }
    );
    io.observe(section);
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
