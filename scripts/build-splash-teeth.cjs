/**
 * Builds the splash scene: the finished arch (splashteeth) plus 12 copies of the single tooth
 * (1tooth) with a baked "assemble" animation in which they fly in one after another, left to
 * right, on the original splash film's paths and timing, each landing sized to fill one tooth of
 * the arch. Once all have seated the page shows the
 * arch under them and fades the flyers out, so the splash ends on the real splashteeth model.
 *
 * Inputs (web-optimised):
 *   assets/splashteeth/splashteeth-web.glb
 *     npx @gltf-transform/cli@4.5.1 optimize assets/splashteeth/base_basic_pbr.glb \
 *       assets/splashteeth/splashteeth-web.glb --compress quantize --texture-compress webp \
 *       --texture-size 1024 --simplify-ratio 0.08 --simplify-error 0.002
 *   assets/1tooth/1tooth-web.glb: base.obj + textures exported to GLB from Blender, then
 *     optimised as above with --texture-size 512
 * Then:
 *   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
 *     @gltf-transform/functions@4.5.1 sharp@0.33.5
 *   node scripts/build-splash-teeth.cjs
 */

const path = require("path");
const sharp = require("sharp");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { mergeDocuments, prune } = require("@gltf-transform/functions");

const ASSETS = path.join(__dirname, "../assets");
const ARCH = path.join(ASSETS, "splashteeth/splashteeth-web.glb");
const TOOTH = path.join(ASSETS, "1tooth/1tooth-web.glb");
const OUT = path.join(ASSETS, "splashteeth/splashteeth-splash.glb");

// The arch's teeth sit between its interproximal gaps, found as dips in the outer radius when
// measured as an angle around this point behind the incisors (model space, metres)
const ARCH_Z = -0.45;
const GAPS = [-74.5, -59.5, -46.5, -34.5, -19.5, 0, 19.5, 34.5, 46.5, 59.5, 74.5];

// Choreography of the original splash film (blender/build_splash_scene.py), replayed here: same
// beats, same camera, same rising flight paths. Film units are its Blender scene (Z up, camera
// looking along +Y at the logo); FILM_ARCH is where the logo's arch sits in it and FILM_SCALE film
// units per model metre, so film positions map onto the 3D arch. The camera beats are mirrored
// in assets/js/splash.js, which drives the camera.
const FILM_FPS = 30;
const FILM_ARCH = [-1.03, 0.42, 2.66];
const FILM_SCALE = 1.85;
const ARCH_MID_Y = 0.207; // model-space height of the arch's centre
const CAM_BEATS = [
  [1, [4.2, -26.0, 8.2]],
  [12, [3.0, -23.0, 6.4]],
  [18, [-3.5, -20.5, 3.2]],
  [34, [4.0, -17.5, 4.8]],
  [50, [-2.8, -15.0, 1.6]],
  [78, [-1.2, -13.5, 1.0]],
  [86, [0.0, -12.0, 0.65]],
  [134, [0.0, -26.0, 0.95]],
];
// Film teeth left one after another (first at beat 12, last at 50); the leftmost flew 58 beats,
// the later ones 74
const FIRST_START = 12;
const LAST_START = 50;
const FLIGHT = [58, 74];
// Crowns run larger while airborne so the modelling reads, easing to seat size (film's profile)
const FLIGHT_SCALE = [
  [0.0, 1.48],
  [0.18, 1.72],
  [0.46, 1.38],
  [0.68, 1.14],
  [0.86, 1.03],
  [1.0, 1.0],
];
// Closest a crown may come to the lens, in film units
const MIN_CAM_DIST = 4.2;

const toFilm = (m) => [FILM_ARCH[0] + FILM_SCALE * m[0], FILM_ARCH[1] - FILM_SCALE * m[2], FILM_ARCH[2] + FILM_SCALE * (m[1] - ARCH_MID_Y)];
const toModel = (b) => [(b[0] - FILM_ARCH[0]) / FILM_SCALE, ARCH_MID_Y + (b[2] - FILM_ARCH[2]) / FILM_SCALE, -(b[1] - FILM_ARCH[1]) / FILM_SCALE];
const lerp3 = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const camAt = (f) => {
  if (f <= CAM_BEATS[0][0]) return CAM_BEATS[0][1];
  for (let i = 1; i < CAM_BEATS.length; i++) {
    const [f0, a] = CAM_BEATS[i - 1];
    const [f1, b] = CAM_BEATS[i];
    if (f <= f1) return lerp3(a, b, (f - f0) / (f1 - f0));
  }
  return CAM_BEATS[CAM_BEATS.length - 1][1];
};
const smootherstep = (t) => {
  t = Math.min(Math.max(t, 0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const profile = (t) => {
  for (let i = 1; i < FLIGHT_SCALE.length; i++) {
    const [t0, v0] = FLIGHT_SCALE[i - 1];
    const [t1, v1] = FLIGHT_SCALE[i];
    if (t <= t1) return v0 + (v1 - v0) * smootherstep((t - t0) / (t1 - t0));
  }
  return 1;
};
// Uniform Catmull-Rom through every control point, t spanning the whole chain
const catmullRom = (pts, t) => {
  const n = pts.length - 1;
  const x = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const u = x - i;
  const [p0, p1, p2, p3] = [pts[Math.max(i - 1, 0)], pts[i], pts[i + 1], pts[Math.min(i + 2, n)]];
  return p1.map(
    (_, a) =>
      0.5 *
      (2 * p1[a] +
        (p2[a] - p0[a]) * u +
        (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * u * u +
        (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * u * u * u),
  );
};
// Keep a crown from crowding the lens, easing the limit in rather than clamping
const holdOffCamera = (loc, cam) => {
  const d = loc.map((v, a) => v - cam[a]);
  const dist = Math.hypot(...d);
  const limit = 2 * MIN_CAM_DIST;
  if (dist >= limit || dist < 1e-6) return loc;
  const eased = MIN_CAM_DIST * (1 + (dist / limit) ** 2);
  return cam.map((v, a) => v + d[a] * (eased / dist));
};
const axisAngle = ([x, y, z], a) => {
  const n = Math.hypot(x, y, z);
  const s = Math.sin(a / 2) / n;
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};
const qmul = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

const qrot = (q, v) => qmul(qmul(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]).slice(0, 3);

// Model-space positions of a quantised mesh node (its TRS undoes quantisation and any export
// rotation)
function positions(node) {
  const o = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  const pos = node.getMesh().listPrimitives()[0].getAttribute("POSITION");
  return Array.from({ length: pos.getCount() }, (_, i) => {
    const q = pos.getElement(i, []);
    return qrot(r, q.map((v, a) => v * s[a])).map((v, a) => v + o[a]);
  });
}

// The scans carry yellow-brown staining and grey shadows baked into their colour; pull them
// toward clean enamel: desaturate, lift the darks a little, cool slightly
async function whiten(texture) {
  const { data, info } = await sharp(Buffer.from(texture.getImage())).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lift = 255 - (255 - l) * 0.85;
    data[i] = Math.min(255, lift + (r - l) * 0.4);
    data[i + 1] = Math.min(255, lift + (g - l) * 0.4 + 1);
    data[i + 2] = Math.min(255, lift + (b - l) * 0.4 + 3);
  }
  const out = await sharp(data, { raw: info }).webp({ quality: 88 }).toBuffer();
  texture.setImage(new Uint8Array(out)).setMimeType("image/webp");
}

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(ARCH);
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const scene = root.listScenes()[0];
  const arch = root.listNodes()[0];

  // Measure each tooth of the arch as a box in its own frame: across the arch (t), up (y) and
  // out along the way it faces (n)
  const slots = GAPS.map(() => []).concat([[]]);
  for (const p of positions(arch)) {
    const deg = (Math.atan2(p[0], p[2] - ARCH_Z) * 180) / Math.PI;
    const k = GAPS.findIndex((g) => deg < g);
    slots[k < 0 ? GAPS.length : k].push(p);
  }
  const seats = slots.map((pts) => {
    const mid = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[2] / pts.length], [0, 0]);
    const facing = Math.atan2(mid[0], mid[1] - ARCH_Z);
    const t = [Math.cos(facing), -Math.sin(facing)];
    const n = [Math.sin(facing), Math.cos(facing)];
    const range = (f) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        const v = f(p);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return [lo, hi];
    };
    const [t0, t1] = range((p) => p[0] * t[0] + p[2] * t[1]);
    const [y0, y1] = range((p) => p[1]);
    const [n0, n1] = range((p) => p[0] * n[0] + p[2] * n[1]);
    const tc = (t0 + t1) / 2;
    const nc = (n0 + n1) / 2;
    return {
      facing,
      centre: [tc * t[0] + nc * n[0], (y0 + y1) / 2, tc * t[1] + nc * n[1]],
      size: [t1 - t0, y1 - y0, n1 - n0],
    };
  });

  arch.getMesh().listPrimitives()[0].getMaterial().setName("arch");

  // Bring in the single tooth
  const toothDoc = await io.read(TOOTH);
  mergeDocuments(doc, toothDoc);
  const toothScene = root.listScenes().find((s) => s !== scene);
  const toothSrc = toothScene.listChildren()[0];
  const toothPts = positions(toothSrc);
  const lo = [0, 1, 2].map((a) => toothPts.reduce((m, p) => Math.min(m, p[a]), Infinity));
  const hi = [0, 1, 2].map((a) => toothPts.reduce((m, p) => Math.max(m, p[a]), -Infinity));
  const toothSize = hi.map((v, a) => v - lo[a]);
  const toothMid = hi.map((v, a) => (v + lo[a]) / 2);
  const toothMesh = toothSrc.getMesh();
  // Single-sided: the mesh is closed, and while a flyer fades out its inner faces must not show
  // through its half-transparent front
  toothMesh.listPrimitives()[0].getMaterial().setName("tooth").setDoubleSided(false);
  const [tx, ty, tz] = toothSrc.getTranslation();
  const tr = toothSrc.getRotation();
  const ts = toothSrc.getScale();
  toothSrc.dispose();
  toothScene.dispose();
  // One buffer for the whole file
  for (const extra of root.listBuffers().slice(1)) {
    for (const acc of root.listAccessors()) if (acc.getBuffer() === extra) acc.setBuffer(buffer);
    extra.dispose();
  }

  for (const tex of root.listTextures()) {
    if (root.listMaterials().some((m) => m.getBaseColorTexture() === tex)) await whiten(tex);
  }

  const anim = doc.createAnimation("assemble");
  const channel = (node, pathName, times, values, interp = "LINEAR") => {
    const sampler = doc
      .createAnimationSampler()
      .setInput(doc.createAccessor().setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer))
      .setOutput(
        doc
          .createAccessor()
          .setType(pathName === "rotation" ? "VEC4" : "VEC3")
          .setArray(new Float32Array(values))
          .setBuffer(buffer),
      )
      .setInterpolation(interp);
    anim.addSampler(sampler).addChannel(
      doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler),
    );
  };

  const n = seats.length - 1;
  seats.forEach(({ facing, centre: c, size }, k) => {
    // Inner node centres the tooth on its pivot; the outer one flies, turns and sizes it
    const inner = doc
      .createNode(`flyer-${k}-mesh`)
      .setMesh(toothMesh)
      .setScale(ts)
      .setRotation(tr)
      .setTranslation([tx - toothMid[0], ty - toothMid[1], tz - toothMid[2]]);
    const outer = doc.createNode(`flyer-${k}`).setTranslation(c).addChild(inner);
    scene.addChild(outer);
    const fit = size.map((v, a) => v / toothSize[a]);

    // The film's flight: up out of the bottom of frame just ahead of the camera, out to a tumble
    // to one side, then curving in to the seat, with an extra ease so the end is a settle
    const startF = FIRST_START + ((LAST_START - FIRST_START) * k) / n;
    const landF = startF + FLIGHT[0] + ((FLIGHT[1] - FLIGHT[0]) * k) / n;
    const side = k % 2 ? 1 : -1;
    const seat = toFilm(c);
    const cam = camAt(startF);
    const route = [
      [seat[0] * 0.34, cam[1] + 3.0, cam[2] - 8.6],
      [seat[0] * 0.55 + side * 0.55, cam[1] + 5.2, cam[2] - 2.4],
      [seat[0] * 0.78 + side * 1.3, -3.2, seat[2] * 0.25 + side * 0.8],
      [seat[0] * 0.93, -0.9, seat[2] * 0.55],
      seat,
    ];
    // Rotation is gentler than the film's whole-turn tumble: the single-tooth scan is hollow
    // behind and underneath, so it only rolls in the picture plane (under 90deg) and turns half
    // way toward its seat's facing
    const roll = side * 0.4 * Math.PI;
    const times = [];
    const trans = [];
    const rots = [];
    const scales = [];
    if (startF > 1) {
      times.push((startF - 2) / FILM_FPS);
      trans.push(...toModel(route[0]));
      rots.push(...axisAngle([0.1, 0.1, 1], roll));
      scales.push(0, 0, 0);
    }
    const steps = Math.ceil(landF - startF);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const f = startF + (landF - startF) * t;
      const travel = 1 - (1 - smootherstep(t)) ** 1.45;
      times.push((f - 1) / FILM_FPS);
      trans.push(...toModel(holdOffCamera(catmullRom(route, travel), camAt(f))));
      const spin = smootherstep(Math.min(t / 0.66, 1));
      const align = smootherstep(Math.min(t / 0.88, 1));
      rots.push(...qmul(axisAngle([0, 1, 0], facing * 0.5 * align), axisAngle([0.1, 0.1, 1], roll * (1 - spin))));
      scales.push(...fit.map((v) => v * profile(t)));
    }
    channel(outer, "translation", times, trans);
    channel(outer, "rotation", times, rots);
    channel(outer, "scale", times, scales);
  });

  await doc.transform(prune());
  await io.write(OUT, doc);
  console.log(`${seats.length} flyers, tooth ${toothSize.map((v) => v.toFixed(2))} → ${path.relative(process.cwd(), OUT)}`);
})();
