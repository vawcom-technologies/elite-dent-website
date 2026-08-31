(() => {
  const host = document.getElementById("services-hero-lottie");
  if (!host || typeof lottie === "undefined") return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anim = lottie.loadAnimation({
    container: host,
    renderer: "svg",
    loop: !reduced,
    autoplay: !reduced,
    path: "../assets/lottie/dental-care.json?v=3",
  });

  if (reduced) {
    anim.addEventListener("DOMLoaded", () => {
      anim.goToAndStop(0, true);
    });
  }
})();
