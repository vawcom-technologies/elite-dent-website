(() => {
  const host = document.getElementById("services-hero-lottie");
  if (!host || typeof lottie === "undefined") return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anim = lottie.loadAnimation({
    container: host,
    renderer: "svg",
    loop: !reduced,
    autoplay: false,
    path: "../assets/lottie/dental-care.json?v=3",
  });

  if (reduced) {
    anim.addEventListener("DOMLoaded", () => {
      anim.goToAndStop(0, true);
    });
    return;
  }

  if ("IntersectionObserver" in window) {
    const vis = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) anim.play();
        else anim.pause();
      },
      { threshold: 0.08 },
    );
    vis.observe(host);
  } else {
    anim.play();
  }
})();
