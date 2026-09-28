(() => {
  const video = document.querySelector(".services-video-hero video");
  if (!video) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    video.removeAttribute("autoplay");
    video.pause();
    return;
  }

  const tryPlay = () => {
    const play = video.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) tryPlay();
        else video.pause();
      },
      { threshold: 0.15 }
    );
    io.observe(video);
  } else {
    tryPlay();
  }
})();
