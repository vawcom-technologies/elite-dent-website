/**
 * Tiny headshot of assets/grudentist.glb inside the guide circle.
 * Loads Three.js only when the widget mounts. Renders only while talking.
 */
export async function mountGuideDentist(host, { glbUrl, talkingRef }) {
  if (!host) return () => {};

  const canvas = document.createElement("canvas");
  canvas.className = "site-guide__canvas";
  host.appendChild(canvas);

  const THREE = await import("https://esm.sh/three@0.160.0");
  const { GLTFLoader } = await import(
    "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.001, 20);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa4be, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(0.8, 1.6, 2.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd9ebf9, 0.7);
  fill.position.set(-1.4, 0.6, 1);
  scene.add(fill);

  let model = null;
  let raf = 0;
  let looping = false;
  let disposed = false;
  let inView = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const baseY = { value: 0 };
  const clock = new THREE.Clock();

  function isFlying() {
    return Boolean(host.closest(".site-guide.is-flying"));
  }

  function isTalking() {
    return Boolean(talkingRef && talkingRef());
  }

  function sizeToHost() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const large = w >= 140;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, large ? 1.25 : 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frameHead(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const large = host.clientWidth >= 140;
    const focus = new THREE.Vector3(
      center.x,
      center.y + size.y * (large ? 0.18 : 0.32),
      center.z,
    );
    const span = Math.max(size.x, size.y * (large ? 0.72 : 0.5), size.z) || 1;
    camera.position.set(focus.x, focus.y, focus.z + span * (large ? 1.85 : 1.55));
    camera.near = Math.max(0.001, span * 0.01);
    camera.far = span * 40;
    camera.lookAt(focus);
    camera.updateProjectionMatrix();
  }

  function draw() {
    if (disposed || isFlying()) return;
    if (model && !reduced) {
      const talking = isTalking();
      const t = clock.getElapsedTime();
      model.rotation.x = talking ? Math.sin(t * 3.2) * 0.045 : 0;
      model.rotation.y = 0;
      model.position.y = baseY.value;
    }
    renderer.render(scene, camera);
  }

  function stopLoop() {
    looping = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function tick() {
    if (disposed || !looping) return;
    if (document.hidden || !inView || isFlying() || !isTalking()) {
      draw();
      stopLoop();
      return;
    }
    draw();
    raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (disposed || looping || reduced) return;
    if (document.hidden || !inView || isFlying() || !isTalking()) return;
    looping = true;
    raf = requestAnimationFrame(tick);
  }

  try {
    const gltf = await new GLTFLoader().loadAsync(glbUrl);
    if (disposed) return () => {};
    model = gltf.scene;
    model.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.material) {
          obj.material.side = THREE.FrontSide;
          obj.material.needsUpdate = true;
        }
      }
    });
    scene.add(model);
    frameHead(model);
    baseY.value = model.position.y;
    host.classList.add("has-model");
    sizeToHost();
    draw();
  } catch (err) {
    console.warn("guide dentist:", err);
  }

  sizeToHost();
  draw();

  const ro = new ResizeObserver(() => {
    if (isFlying()) return;
    sizeToHost();
    if (model) frameHead(model);
    draw();
  });
  ro.observe(host);

  const talkingWatch = new MutationObserver(() => {
    if (host.classList.contains("is-talking")) startLoop();
    else {
      draw();
      stopLoop();
    }
  });
  talkingWatch.observe(host, { attributes: true, attributeFilter: ["class"] });

  const vis = new IntersectionObserver(
    (entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      if (inView && host.classList.contains("is-talking")) startLoop();
      else if (!inView) stopLoop();
    },
    { threshold: 0.01 },
  );
  vis.observe(host);

  const onVis = () => {
    if (document.hidden) {
      stopLoop();
      return;
    }
    if (host.classList.contains("is-talking")) startLoop();
    else draw();
  };
  document.addEventListener("visibilitychange", onVis);

  if (host.classList.contains("is-talking")) startLoop();

  return () => {
    disposed = true;
    stopLoop();
    talkingWatch.disconnect();
    vis.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    ro.disconnect();
    renderer.dispose();
    canvas.remove();
    host.classList.remove("has-model");
  };
}
