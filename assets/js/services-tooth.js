(() => {
  const hero = document.querySelector(".svc-hero");
  const tooth = hero && hero.querySelector("model-viewer");
  if (!tooth) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    tooth.removeAttribute("auto-rotate");
    return;
  }

  // Cursor across the hero turns the tooth a full 360° (x) and tilts it (y);
  // when the cursor leaves it goes back to the slow auto-rotate.
  hero.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tooth.autoRotate = false;
    tooth.cameraOrbit = `${x * 360 - 180}deg ${55 + y * 45}deg auto`;
  });
  hero.addEventListener("pointerleave", () => {
    tooth.autoRotate = true;
  });
})();
