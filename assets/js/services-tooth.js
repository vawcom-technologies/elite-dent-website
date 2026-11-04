(() => {
  const hero = document.querySelector(".svc-hero");
  const tooth = hero && hero.querySelector("model-viewer");
  if (!tooth) return;

  // Glossy enamel: the Ronin PBR texture is fairly matte, so cut its roughness and drop the
  // metallic tint (enamel isn't metal); highlights then come from the environment reflections
  tooth.addEventListener("load", () => {
    for (const mat of tooth.model?.materials || []) {
      mat.pbrMetallicRoughness.setRoughnessFactor(0.25);
      mat.pbrMetallicRoughness.setMetallicFactor(0);
    }
  });
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
