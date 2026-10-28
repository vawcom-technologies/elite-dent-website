(() => {
  const hero = document.querySelector(".services-video-hero");
  const video = hero?.querySelector("video");
  if (!video) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    video.removeAttribute("autoplay");
    video.pause();
    return;
  }

  // Muted + inline is what lets mobile browsers start playback without a tap
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = "auto";
  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  let userPaused = false;
  let inView = true;

  const sync = () => {
    if (userPaused || !inView || document.hidden) {
      video.pause();
      return;
    }
    video.muted = true;
    const play = video.play();
    if (play && typeof play.catch === "function") play.catch(() => {});
  };

  hero.addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    userPaused = !video.paused;
    sync();
  });

  video.addEventListener("loadeddata", sync);
  video.addEventListener("canplay", sync);
  video.addEventListener("canplaythrough", sync);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        sync();
      },
      { threshold: 0.15 }
    ).observe(video);
  }

  document.addEventListener("visibilitychange", sync);
  window.addEventListener("pageshow", sync);
  sync();
})();
