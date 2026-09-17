/**
 * Tiny headshot of assets/grudentist.glb inside the guide circle.
 * Loads Three.js only when the widget mounts.
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
    antialias: true,
    powerPreference: "low-power",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  let disposed = false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const baseY = { value: 0 };

  function sizeToHost() {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
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
    // Small dock: head crop. Intro: show more of the figure.
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
    renderer.render(scene, camera);
  } catch (err) {
    console.warn("guide dentist:", err);
  }

  sizeToHost();
  const ro = new ResizeObserver(() => {
    sizeToHost();
    if (model) frameHead(model);
  });
  ro.observe(host);

  const clock = new THREE.Clock();
  function tick() {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    if (model && !reduced) {
      const talking = talkingRef ? talkingRef() : false;
      // Soft head nod only — keep the circle still.
      model.rotation.x = talking ? Math.sin(t * 3.2) * 0.045 : Math.sin(t * 0.7) * 0.012;
      model.rotation.y = 0;
      model.position.y = baseY.value;
    }
    renderer.render(scene, camera);
  }
  tick();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
    canvas.remove();
    host.classList.remove("has-model");
  };
}
