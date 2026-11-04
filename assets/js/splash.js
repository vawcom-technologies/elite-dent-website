(() => {
  const splash = document.getElementById("splash");
  const app = document.getElementById("app");
  if (!app) return;

  const KEY = "elitedent-splash";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isPhone = window.matchMedia("(max-width: 767px)").matches;

  const MODEL_VIEWER = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
  // Once the last flyer seats, the real arch appears (solid) under the flyers and they fade out
  const MERGE_S = 0.35;
  // Camera of the original splash film (blender/build_splash_scene.py), replayed beat for beat:
  // it pushes in through the rising teeth from high and far, weaving side to side while its aim
  // swings the other way, comes down level with the arch, then (wordmark filling the screen)
  // pulls straight back to the lockup. Beats are [film frame @30fps, camera xyz, aim xyz, lens mm]
  // in the film's Blender units (Z up, looking along +Y at the logo). The flyers' paths in
  // splashteeth-splash.glb are built against the same beats (scripts/build-splash-teeth.cjs).
  const FILM_FPS = 30;
  const FILM_LOGO_AIM = [0, 0.5, 1];
  const FILM_BEATS = [
    [1, [4.2, -26, 8.2], [-2.5, 7, 1.5], 38],
    [12, [3, -23, 6.4], [-1.5, 5.5, 2], 36],
    [18, [-3.5, -20.5, 3.2], [1.2, 4, 2.4], 34],
    [34, [4, -17.5, 4.8], [-1.8, 2.5, 1.2], 33],
    [50, [-2.8, -15, 1.6], [0.6, 1.5, 2.2], 34],
    [78, [-1.2, -13.5, 1], [0, 1.2, 1.8], 34],
    [86, [0, -12, 0.65], FILM_LOGO_AIM, 35],
    [102, [0, -14.8, 0.71], FILM_LOGO_AIM, 35],
    [118, [0, -19.7, 0.815], FILM_LOGO_AIM, 35],
    [134, [0, -26, 0.95], FILM_LOGO_AIM, 35],
  ];
  // The wordmark holds its final place and fades in from here to the lockup, while the camera
  // pulls back and the teeth settle into the arch above it
  const FILM_LOGO_IN = 86;
  // Film units ↔ model metres: where the logo's arch sits in the film, and film units per metre
  const FILM_ARCH = [-1.03, 0.42, 2.66];
  const FILM_SCALE = 1.85;
  const ARCH_MID_Y = 0.207;
  // Where the arch sits in the logo artwork, as fractions of the brand box (centre x/y, width)
  const ARCH_SPOT = { x: 0.45, y: 0.22, w: 0.22 };
  // Arch extremes in model space: left, right, top, bottom
  const ARCH_PROBES = [[-0.95, 0.2, -0.35], [0.95, 0.2, -0.35], [0, 0.37, 0.48], [0, 0, 0.48]];
  // The film held the finished lockup for 20 frames before the nav handoff
  const HOLD_MS = 670;
  // Wait this long for the 3D arch; past it, show the flat logo instead
  const MODEL_WAIT_MS = 3500;
  const WHOOSH_MS = 820;
  const WHOOSH_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";
  const LAND_FADE_MS = 120;
  const REMOVE_MS = 200;
  // Splash fading straight into the welcome, with no logo flight
  const WELCOME_FADE_MS = 600;

  function revealHome() {
    app.hidden = false;
    requestAnimationFrame(() => app.classList.add("is-ready"));
  }

  function markSplashComplete() {
    app.classList.add("is-splash-complete");
    document.dispatchEvent(new CustomEvent("elitedent:splash-complete"));
  }

  try {
    if (sessionStorage.getItem(KEY)) {
      splash?.remove();
      revealHome();
      markSplashComplete();
      return;
    }
  } catch (_) {
    /* private mode: fall through and show splash */
  }

  if (!splash) {
    revealHome();
    markSplashComplete();
    return;
  }

  const brand = document.getElementById("splash-brand");
  const arch = document.getElementById("splash-arch");

  function markSeen() {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch (_) {}
  }

  function finish(fadeMs = REMOVE_MS) {
    markSeen();
    if (fadeMs !== REMOVE_MS) splash.style.transition = `opacity ${fadeMs}ms ease`;
    splash.classList.add("is-done");
    app.classList.add("is-ready");
    markSplashComplete();
    setTimeout(() => {
      app.classList.remove("is-splash-handoff", "is-splash-landed");
      splash.remove();
    }, fadeMs);
  }

  function warmHome() {
    if (!app.hidden) return;
    app.hidden = false;
    app.classList.add("is-splash-handoff");
  }

  function flyBrand(dx, dy, scale) {
    // The arch canvas is full-screen behind the brand; scaling it about the brand's centre keeps
    // the 3D arch locked to the wordmark all the way into the nav
    const b = brand.getBoundingClientRect();
    arch.style.transformOrigin = `${b.left + b.width / 2}px ${b.top + b.height / 2}px`;
    arch.animate?.([{ transform: "none" }, { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` }], {
      duration: WHOOSH_MS,
      easing: WHOOSH_EASE,
      fill: "forwards",
    });
    const from = "translate(-50%, -50%) translateZ(0)";
    const to = `translate(-50%, -50%) translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
    brand.style.willChange = "transform";
    if (typeof brand.animate === "function") {
      const anim = brand.animate([{ transform: from }, { transform: to }], {
        duration: WHOOSH_MS,
        easing: WHOOSH_EASE,
        fill: "forwards",
      });
      return anim.finished.catch(() => {
        brand.style.transform = to;
      });
    }
    brand.style.transition = `transform ${WHOOSH_MS}ms ${WHOOSH_EASE}`;
    brand.style.transform = to;
    return new Promise((resolve) => setTimeout(resolve, WHOOSH_MS));
  }

  function whooshToNav() {
    const navMark = app.querySelector(".nav__brand img");
    if (!brand || !navMark || reduced) {
      revealHome();
      finish();
      return;
    }
    // The welcome is waiting underneath and covers the nav: no flight, the finished logo simply
    // fades away with the splash. The logo flies from the reception wall into the nav when the
    // visitor leaves the welcome (site-guide-agent.js, flyLogoToNav)
    if (document.documentElement.classList.contains("is-gru-intro-pending")) {
      revealHome();
      finish(WELCOME_FADE_MS);
      return;
    }

    brand.style.willChange = "transform";
    warmHome();
    splash.classList.add("is-handoff");

    const startFly = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const from = brand.getBoundingClientRect();
          const to = navMark.getBoundingClientRect();
          if (!to.width || !from.width) {
            revealHome();
            finish();
            return;
          }

          const scale = to.width / from.width;
          const dx = to.left + to.width / 2 - (from.left + from.width / 2);
          const dy = to.top + to.height / 2 - (from.top + from.height / 2);

          splash.classList.add("is-revealing");

          flyBrand(dx, dy, scale).then(() => {
            app.classList.add("is-splash-landed");
            app.classList.remove("is-splash-handoff");
            for (const el of [brand, arch]) {
              el.style.transition = `opacity ${LAND_FADE_MS}ms linear`;
              el.style.opacity = "0";
            }

            setTimeout(() => {
              brand.style.willChange = "auto";
              brand.style.visibility = "hidden";
              finish();
            }, LAND_FADE_MS);
          });
        });
      });
    };

    if (isPhone) setTimeout(startFly, 420);
    else startFly();
  }

  function readyImg(img) {
    const done = () => img.decode?.().catch(() => {});
    if (img.complete) return done() ?? Promise.resolve();
    return new Promise((res) => {
      img.addEventListener("load", res, { once: true });
      img.addEventListener("error", res, { once: true });
    }).then(done);
  }

  function readyArch() {
    if (!arch || reduced) return Promise.resolve(false);
    return new Promise((res) => {
      arch.addEventListener("load", () => res(true), { once: true });
      arch.addEventListener("error", () => res(false), { once: true });
      import(MODEL_VIEWER).catch(() => res(false));
    });
  }

  const frame = () => new Promise((res) => requestAnimationFrame(res));
  // Blender's auto-clamped Bezier, per channel: continuous speed through each key, flat at the
  // ends and at any key that is a local peak, so nothing overshoots. keys: [[frame, value], ...]
  function smoothAt(keys, f) {
    const n = keys.length - 1;
    if (f <= keys[0][0]) return keys[0][1];
    if (f >= keys[n][0]) return keys[n][1];
    let i = 0;
    while (f > keys[i + 1][0]) i++;
    const slope = (j) => {
      if (j === 0 || j === n) return 0;
      const [a, v, b] = [keys[j - 1][1], keys[j][1], keys[j + 1][1]];
      if ((v - a) * (b - v) <= 0) return 0;
      return (b - a) / (keys[j + 1][0] - keys[j - 1][0]);
    };
    const [f0, v0] = keys[i];
    const [f1, v1] = keys[i + 1];
    const h = f1 - f0;
    const u = (f - f0) / h;
    return (
      (2 * u ** 3 - 3 * u ** 2 + 1) * v0 +
      (u ** 3 - 2 * u ** 2 + u) * h * slope(i) +
      (-2 * u ** 3 + 3 * u ** 2) * v1 +
      (u ** 3 - u ** 2) * h * slope(i + 1)
    );
  }
  const channel = (pick) => FILM_BEATS.map((b) => [b[0], pick(b)]);
  const FILM_CHANNELS = [0, 1, 2]
    .map((a) => channel((b) => b[1][a]))
    .concat([0, 1, 2].map((a) => channel((b) => b[2][a])), [channel((b) => b[3])]);
  const toModel = (b) => [
    (b[0] - FILM_ARCH[0]) / FILM_SCALE,
    ARCH_MID_Y + (b[2] - FILM_ARCH[2]) / FILM_SCALE,
    -(b[1] - FILM_ARCH[1]) / FILM_SCALE,
  ];

  function setCamera(theta, phi, r, fov, [x, y, z]) {
    arch.cameraOrbit = `${theta}deg ${phi}deg ${r}m`;
    arch.cameraTarget = `${x}m ${y}m ${z}m`;
    arch.fieldOfView = `${fov}deg`;
    arch.jumpCameraToGoal();
  }

  // The film camera at a frame, as model-viewer orbit parameters around its aim point
  function filmCamera(f) {
    const v = FILM_CHANNELS.map((c) => smoothAt(c, f));
    const cam = toModel(v.slice(0, 3));
    const target = toModel(v.slice(3, 6));
    const d = cam.map((x, a) => x - target[a]);
    const r = Math.hypot(...d);
    // Its 36mm sensor spans the width; phones showed the film's middle 71%, as the portrait cut did
    const aspect = innerWidth / innerHeight;
    const tanHalfW = (18 / v[6]) * (aspect < 1 ? 0.7135 : 1);
    return {
      theta: (Math.atan2(d[0], d[2]) * 180) / Math.PI,
      phi: (Math.acos(d[1] / r) * 180) / Math.PI,
      r,
      fov: (2 * Math.atan(tanHalfW / aspect) * 180) / Math.PI,
      target,
    };
  }

  // Solve the end camera so the finished arch lands exactly on the logo's arch spot: measure where
  // the arch's extremes project (via hotspots), pan and dolly, repeat until it converges
  // Where the arch is on screen right now, from hotspots on its extremes: centre and width
  function archOnScreen(probes) {
    const [L, R, T, B] = probes.map((el) => {
      const q = el.getBoundingClientRect();
      return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
    });
    return { x: (L.x + R.x) / 2, y: (T.y + B.y) / 2, w: R.x - L.x };
  }

  async function frameLockup(end, goal, probes) {
    const phi = (end.phi * Math.PI) / 180;
    let r = 10;
    let t = [0, 0.2, 0];
    for (let i = 0; i < 5; i++) {
      setCamera(end.theta, end.phi, r, end.fov, t);
      await frame();
      await frame();
      const at = archOnScreen(probes);
      if (at.w < 1) continue;
      const mpp = (ARCH_PROBES[1][0] - ARCH_PROBES[0][0]) / at.w;
      const dx = (goal.x - at.x) * mpp;
      const dy = (goal.y - at.y) * mpp;
      // Camera right is +x; camera up at this phi is (0, sin, -cos)
      t = [t[0] - dx, t[1] + dy * Math.sin(phi), t[2] - dy * Math.cos(phi)];
      r *= at.w / goal.w;
    }
    return { r, target: t };
  }

  // Teeth fly in from the baked "assemble" animation; the camera, the wordmark's entrance and the
  // swap into the real arch all run off the same clock
  async function playAssembly() {
    const mat = Object.fromEntries(arch.model.materials.map((m) => [m.name, m]));
    const alpha = (m, a) => {
      const [r, g, b] = m.pbrMetallicRoughness.baseColorFactor;
      m.pbrMetallicRoughness.setBaseColorFactor([r, g, b, a]);
    };
    mat.arch.setAlphaMode("BLEND");
    alpha(mat.arch, 0);

    // The film's last frame, re-solved so the arch lands exactly on this page's logo; the
    // difference is eased in over the pull-back
    const lastBeat = FILM_BEATS[FILM_BEATS.length - 1][0];
    const filmEnd = filmCamera(lastBeat);
    const b = brand.getBoundingClientRect();
    const goal = { x: b.left + b.width * ARCH_SPOT.x, y: b.top + b.height * ARCH_SPOT.y, w: b.width * ARCH_SPOT.w };
    const probes = ARCH_PROBES.map((p, k) => {
      const el = document.createElement("div");
      el.slot = `hotspot-probe-${k}`;
      el.className = "splash__hotspot";
      el.dataset.position = p.map((v) => `${v}m`).join(" ");
      arch.append(el);
      return el;
    });
    const end = await frameLockup(filmEnd, goal, probes);
    const fix = { logR: Math.log(end.r / filmEnd.r), target: end.target.map((v, a) => v - filmEnd.target[a]) };
    const cameraAt = (f) => {
      const c = filmCamera(f);
      const w = smoothAt([[FILM_LOGO_IN, 0], [lastBeat, 1]], f);
      setCamera(c.theta, c.phi, c.r * Math.exp(fix.logR * w), c.fov, c.target.map((v, a) => v + fix.target[a] * w));
    };

    const shell = brand.querySelector(".splash__shell");
    shell.style.transition = "none";
    const shellAt = (f) => {
      shell.style.opacity = String(smoothAt([[FILM_LOGO_IN, 0], [lastBeat, 1]], f));
    };

    arch.play();
    arch.pause();
    arch.currentTime = 0;
    const flight = arch.duration;
    const mergeAt = flight - 0.05;
    cameraAt(1);
    await frame();
    splash.classList.add("is-playing");
    const t0 = performance.now();
    let merging = false;
    while (true) {
      const t = (performance.now() - t0) / 1000;
      const f = 1 + t * FILM_FPS;
      // Stop just short of the end: the clip loops, so its exact end wraps back to the first frame
      arch.currentTime = Math.min(t, flight - 0.001);
      cameraAt(f);
      shellAt(f);
      if (t >= mergeAt) {
        if (!merging) {
          // The arch goes straight in opaque (a half-transparent one would show its inside through
          // its front); the fading flyers sit over it with their cupped backs hidden behind it
          alpha(mat.arch, 1);
          mat.arch.setAlphaMode("OPAQUE");
          mat.tooth.setAlphaMode("BLEND");
          merging = true;
        }
        alpha(mat.tooth, Math.max(0, 1 - (t - mergeAt) / MERGE_S));
      }
      if (f >= lastBeat && t >= mergeAt + MERGE_S) break;
      await frame();
    }
    probes.forEach((el) => el.remove());
  }

  function lockup(archOk) {
    if (!archOk) brand.classList.add("is-flat");
    splash.classList.add("is-seated");
    setTimeout(whooshToNav, HOLD_MS);
  }

  const archReady = readyArch();

  Promise.all([
    Promise.race([archReady, new Promise((res) => setTimeout(() => res(false), MODEL_WAIT_MS))]),
    ...[...brand.querySelectorAll("img")].map(readyImg),
  ]).then(([archOk]) => {
    splash.classList.add("is-ready");
    warmHome();

    if (reduced || !arch) {
      brand.classList.add("is-flat");
      splash.classList.add("is-seated", "is-handoff", "is-revealing");
      setTimeout(() => {
        revealHome();
        finish();
      }, 200);
      return;
    }

    if (!archOk) {
      lockup(false);
      return;
    }
    playAssembly().then(
      () => lockup(true),
      (err) => {
        console.error("Splash 3D assembly failed, showing the flat logo", err);
        lockup(false);
      },
    );
  });
})();
