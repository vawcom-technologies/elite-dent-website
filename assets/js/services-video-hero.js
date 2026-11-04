(() => {
  const heroes = [...document.querySelectorAll(".services-video-hero")];
  if (!heroes.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  heroes.forEach((hero) => {
    const video = hero.querySelector("video");
    if (!video) return;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    if (reduced) {
      video.removeAttribute("autoplay");
      return;
    }

    let userPaused = false;
    let inView = false;

    const sync = () => {
      if (!userPaused && inView && !document.hidden) {
        const play = video.play();
        if (play && typeof play.catch === "function") play.catch(() => {});
      } else {
        video.pause();
      }
    };

    hero.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      userPaused = !video.paused;
      sync();
    });

    ["loadeddata", "canplay", "canplaythrough"].forEach((type) => {
      video.addEventListener(type, sync);
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (entries) => {
          inView = entries.some((entry) => entry.isIntersecting);
          sync();
        },
        { threshold: 0.15 }
      ).observe(video);
    } else {
      inView = true;
    }

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    sync();
  });
})();
