(() => {
  const visual = document.querySelector(".hkp-hero__visual");
  if (!visual) return;

  const model = visual.querySelector("model-viewer");
  const mq = window.matchMedia("(min-width: 768px)");
  let loading = false;
  /** Closest allowed camera distance — model must stay inside the viewer. */
  let minRadius = null;

  const showFallback = () => {
    visual.classList.add("hkp-hero__visual--fallback");
    visual.classList.remove("hkp-hero__visual--ready");
  };

  const showModel = () => {
    visual.classList.add("hkp-hero__visual--ready");
    visual.classList.remove("hkp-hero__visual--fallback");
  };

  const safeMinRadius = () => {
    const dim = model.getDimensions?.();
    const fovDeg = model.getFieldOfView?.();
    if (!dim || !fovDeg) return null;
    const halfDiag = Math.hypot(dim.x, dim.y, dim.z) / 2;
    const halfFov = ((fovDeg * Math.PI) / 180) / 2;
    if (!(halfDiag > 0) || !(halfFov > 0)) return null;
    return (halfDiag / Math.tan(halfFov)) * 1.05;
  };

  const clampEnlarge = () => {
    if (!model || minRadius == null) return;
    const orbit = model.getCameraOrbit?.();
    if (!orbit || orbit.radius + 1e-6 >= minRadius) return;
    model.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${minRadius}m`;
    model.jumpCameraToGoal?.();
  };

  const capEnlarge = () => {
    if (!model) return;
    const computed = safeMinRadius();
    if (!computed || !Number.isFinite(computed)) return;
    minRadius = computed;

    model.setAttribute("min-camera-orbit", `auto auto ${minRadius}m`);
    model.setAttribute("max-camera-orbit", "auto auto Infinity");
    model.minCameraOrbit = `auto auto ${minRadius}m`;
    model.maxCameraOrbit = "auto auto Infinity";

    model.setAttribute("min-field-of-view", "25deg");
    model.setAttribute("max-field-of-view", "45deg");
    model.fieldOfView = "32deg";

    const orbit = model.getCameraOrbit?.();
    if (orbit) {
      model.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${minRadius * 1.06}m`;
      model.jumpCameraToGoal?.();
    }
  };

  const onModelReady = () => {
    showModel();
    requestAnimationFrame(() => requestAnimationFrame(capEnlarge));
  };

  if (model) {
    model.addEventListener("load", onModelReady);
    model.addEventListener("error", showFallback);
    model.addEventListener("camera-change", clampEnlarge);
  }

  const loadViewer = () => {
    if (loading || !mq.matches) return;
    loading = true;
    import("https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js")
      .then(async () => {
        await customElements.whenDefined("model-viewer");
        if (model?.loaded) onModelReady();
      })
      .catch(() => {
        loading = false;
        showFallback();
      });
  };

  // Hero is above the fold on desktop — start immediately, don't wait for IO.
  if (mq.matches) loadViewer();
  mq.addEventListener("change", () => {
    if (mq.matches) loadViewer();
  });
})();
