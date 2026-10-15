/**
 * Gives the guide avatar a mouth. In the scanned model the lips are one closed surface with the lip
 * line only painted on, so opening the jaw just stretched the texture. This:
 *   - cuts the face along the painted lip line: the upper edge stays with the head, the lower edge
 *     follows the "jaw" bone, so the lips part when the jaw opens (and still meet when it is closed)
 *   - adds a dark mouth interior behind the cut (skinned to head and jaw, so it stretches with it)
 *   - adds soft upper teeth (head) and lower teeth (jaw)
 * Teeth and mouth are unlit with their shading baked into vertex colours, like the face itself, which
 * is drawn entirely from its emissive texture. Everything is in the lite model's own mesh coordinates
 * (about 1 unit per metre), the same space as SMILE_CORNERS in site-guide-agent.js; the face keeps its
 * quantized positions untouched apart from the new vertices along the cut.
 *
 *   npm i --no-save @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
 *     @gltf-transform/functions@4.5.1 meshoptimizer@0.22.0
 *   node scripts/add-avatar-mouth.cjs assets/femalebot/femalebot-guide-lite.glb assets/femalebot/femalebot-guide-mouth.glb
 *   node scripts/optimize-glb.cjs assets/femalebot/femalebot-guide-mouth.glb assets/femalebot/femalebot-guide-web.glb
 */

const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, KHRMaterialsUnlit } = require("@gltf-transform/extensions");

const [IN, OUT] = process.argv.slice(2);

// Mouth corners (x) and the dark line between the lips, read off the texture across the mouth
const CORNERS = [-0.0154, 0.0375];
const LIP_Y = 0.7612;
const LIP_Y_CORNER = 0.7604;
const MID = (CORNERS[0] + CORNERS[1]) / 2;
const HALF = (CORNERS[1] - CORNERS[0]) / 2;
const TEETH_INSET = 0.0035; // front of the upper teeth, behind the lips
const TOOTH_SCALE = 0.93; // a touch smaller than average, so they never dominate the soft face

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lipY = (x) => LIP_Y - (LIP_Y - LIP_Y_CORNER) * Math.min(1, ((x - MID) / HALF) ** 4);
// How freely the lips part at x: fully across the middle, not at all at the corners
const parting = (x) => smooth(CORNERS[0], CORNERS[0] + 0.009, x) * smooth(CORNERS[1], CORNERS[1] - 0.009, x);
const srgb = (c) => c.map((v) => Math.pow(v, 2.2)); // vertex colours are linear

(async () => {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(IN);
  const root = doc.getRoot();
  const mesh = root.listMeshes()[0];
  const face = mesh.listPrimitives()[0];
  const jointNames = root.listSkins()[0].listJoints().map((j) => j.getName());
  const HEAD = jointNames.indexOf("mixamorig:Head");
  const JAW = jointNames.indexOf("jaw");
  if (HEAD < 0 || JAW < 0) throw new Error("expected mixamorig:Head and jaw joints");

  const acc = Object.fromEntries(["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"].map((k) => [k, face.getAttribute(k)]));
  const readAll = (a) => Array.from({ length: a.getCount() }, (_, i) => a.getElement(i, []));
  const pos = readAll(acc.POSITION);
  const nrm = readAll(acc.NORMAL);
  const uv = readAll(acc.TEXCOORD_0);
  const skin = readAll(acc.JOINTS_0).map((j, i) => {
    const w = acc.WEIGHTS_0.getElement(i, []);
    const m = new Map();
    j.forEach((joint, k) => w[k] > 0 && m.set(joint, (m.get(joint) || 0) + w[k]));
    return m;
  });
  const index = Array.from(face.getIndices().getArray());

  // Front surface depth at (x, y), from the face triangles around the mouth
  const near = [];
  for (let t = 0; t < index.length; t += 3) {
    const ids = [index[t], index[t + 1], index[t + 2]];
    if (ids.some((i) => pos[i][2] < 0.02 || pos[i][1] < 0.72 || pos[i][1] > 0.8 || pos[i][0] < CORNERS[0] - 0.03 || pos[i][0] > CORNERS[1] + 0.03)) continue;
    near.push(ids);
  }
  // The face's front-most point at (x, y): its depth, and its bone weights (so whatever sits behind it
  // moves with it once the head and neck animate)
  function surfaceAt(x, y) {
    let best = null;
    for (const ids of near) {
      const [a, b, c] = ids.map((i) => pos[i]);
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-12) continue;
      const w0 = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area;
      const w1 = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      if (!best || z > best.z) best = { z, ids, bary: [w0, w1, w2] };
    }
    return best;
  }
  const surfaceZ = (x, y) => surfaceAt(x, y)?.z ?? -Infinity;
  function surfaceSkin(x, y) {
    const hit = surfaceAt(x, y);
    const m = new Map();
    hit.ids.forEach((i, k) => {
      for (const [j, w] of skin[i]) m.set(j, (m.get(j) || 0) + w * hit.bary[k]);
    });
    return m;
  }
  // The lips' depth along the mouth, smoothed with a cubic fit (the scan is noisy)
  const samples = [];
  for (let x = CORNERS[0] + 0.002; x <= CORNERS[1] - 0.002; x += 0.001) {
    const z = Math.min(surfaceZ(x, lipY(x) + 0.003), surfaceZ(x, lipY(x) - 0.003));
    if (Number.isFinite(z)) samples.push([x - MID, z]);
  }
  const lipZ = polyFit(samples, 3);
  const lipDepth = (x) => lipZ.reduce((s, c, k) => s + c * (x - MID) ** k, 0);

  // ---- 1. Cut along the lip line ----
  const side = (i) => (pos[i][1] - lipY(pos[i][0]) >= 0 ? 1 : -1);
  const inMouth = (i) => {
    const [x, y, z] = pos[i];
    return z > 0.08 && y > 0.74 && y < 0.78 && x > CORNERS[0] - 0.004 && x < CORNERS[1] + 0.004;
  };
  // Moves a share of the head's weight onto the jaw (f > 0) or of the jaw's back onto the head (f < 0).
  // Only head and jaw trade: the jaw hangs off the head, so with the jaw closed both edges of the cut
  // still move identically however the neck and spine animate.
  function shiftJaw(m, f) {
    const out = new Map(m);
    const head = m.get(HEAD) || 0;
    const jaw = m.get(JAW) || 0;
    const moved = f > 0 ? head * f : jaw * f;
    out.set(HEAD, head - moved);
    out.set(JAW, jaw + moved);
    return out;
  }
  const upperSkin = (m, x) => shiftJaw(m, -parting(x));
  const lowerSkin = (m, x) => shiftJaw(m, parting(x));
  function addVertex(p, n, t, m) {
    pos.push(p);
    nrm.push(n);
    uv.push(t);
    skin.push(m);
    return pos.length - 1;
  }
  const cuts = new Map();
  function cutPoint(i, j) {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (cuts.has(key)) return cuts.get(key);
    const si = pos[i][1] - lipY(pos[i][0]);
    const sj = pos[j][1] - lipY(pos[j][0]);
    const t = si / (si - sj);
    const lerp = (a, b) => a.map((v, k) => v + (b[k] - v) * t);
    const p = lerp(pos[i], pos[j]);
    const nn = lerp(nrm[i], nrm[j]);
    const len = Math.hypot(...nn) || 1;
    const m = new Map();
    for (const [jn, w] of skin[i]) m.set(jn, (m.get(jn) || 0) + w * (1 - t));
    for (const [jn, w] of skin[j]) m.set(jn, (m.get(jn) || 0) + w * t);
    const n = nn.map((v) => v / len);
    const tc = lerp(uv[i], uv[j]);
    const pair = { up: addVertex(p, n, tc, upperSkin(m, p[0])), down: addVertex(p.slice(), n.slice(), tc.slice(), lowerSkin(m, p[0])) };
    cuts.set(key, pair);
    return pair;
  }
  const out = [];
  let cut = 0;
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    const sides = tri.map(side);
    const cx = (pos[tri[0]][0] + pos[tri[1]][0] + pos[tri[2]][0]) / 3;
    if (!tri.every(inMouth) || sides[0] === sides[1] && sides[1] === sides[2] || cx < CORNERS[0] - 0.003 || cx > CORNERS[1] + 0.003) {
      out.push(...tri);
      continue;
    }
    // Rotate so the lone vertex (alone on its side of the line) comes first, keeping the winding
    const k = sides[0] !== sides[1] && sides[0] !== sides[2] ? 0 : sides[1] !== sides[0] && sides[1] !== sides[2] ? 1 : 2;
    const [L, A, B] = [tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]];
    const e1 = cutPoint(L, A);
    const e2 = cutPoint(L, B);
    const lone = side(L) > 0 ? "up" : "down";
    const rest = lone === "up" ? "down" : "up";
    out.push(L, e1[lone], e2[lone], e1[rest], A, B, e1[rest], B, e2[rest]);
    cut += 1;
  }
  // Upper lip lets go of the jaw near the line, lower lip follows it, so each moves as one piece
  // (the new vertices along the cut already have their weights)
  for (let i = 0; i < acc.POSITION.getCount(); i += 1) {
    if (!inMouth(i)) continue;
    const s = pos[i][1] - lipY(pos[i][0]);
    const open = parting(pos[i][0]);
    if (s >= 0 && s < 0.012) skin[i] = shiftJaw(skin[i], -open * (1 - smooth(0.006, 0.012, s)));
    else if (s < 0 && s > -0.014) skin[i] = shiftJaw(skin[i], open * (1 - smooth(0.008, 0.014, -s)));
  }
  writeFace(face, acc, { pos, nrm, uv, skin, index: out });
  console.log(`cut ${cut} triangles along the lip line, ${cuts.size * 2} new vertices`);

  // ---- 2. Teeth ----
  // Arch: the lips' depth curve pushed back by TEETH_INSET, walked by arc length from the midline
  const arch = [];
  for (const dir of [-1, 1]) {
    let s = 0;
    let prev = [MID, lipDepth(MID) - TEETH_INSET];
    const pts = [{ s: 0, x: prev[0], z: prev[1] }];
    for (let x = MID + dir * 0.0002; Math.abs(x - MID) < HALF; x += dir * 0.0002) {
      const p = [x, lipDepth(x) - TEETH_INSET];
      s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      pts.push({ s, x: p[0], z: p[1] });
      prev = p;
    }
    arch[dir] = pts;
  }
  function archAt(dir, s) {
    const pts = arch[dir];
    let k = pts.findIndex((p) => p.s >= s);
    if (k < 1) k = pts.length - 1;
    const a = pts[k - 1];
    const b = pts[k];
    const tangent = Math.atan2(b.z - a.z, b.x - a.x);
    return { x: a.x + (b.x - a.x) * 0.5, z: a.z + (b.z - a.z) * 0.5, tangent };
  }

  // Width along the arch (m), how far the edge hangs below the lip line, front-to-back depth
  const UPPER = [
    { w: 0.0083, drop: 0.0032, d: 0.0068 }, // central incisor
    { w: 0.0064, drop: 0.0025, d: 0.006 }, // lateral
    { w: 0.0074, drop: 0.0027, d: 0.0075 }, // canine
    { w: 0.0068, drop: 0.0019, d: 0.008 }, // first premolar
  ];
  const LOWER = [
    // Front four only (the rest barely show in a smile and read as stray white bits at the corners);
    // their edges sit just above the upper ones, behind them (a normal overbite)
    { w: 0.0052, drop: 0.0019, d: 0.0055 },
    { w: 0.0058, drop: 0.0018, d: 0.0058 },
  ];
  const teeth = { pos: [], color: [], joint: [], weight: [], index: [] };
  for (const [row, set] of [["upper", UPPER], ["lower", LOWER]]) {
    const upper = row === "upper";
    for (const dir of [-1, 1]) {
      let s = 0;
      set.forEach((t, n) => {
        const w = t.w * TOOTH_SCALE;
        // the two front teeth meet at the midline, neighbours just touch
        const at = archAt(dir, (s + w / 2 - (n === 0 ? 0.0002 : 0)) * (upper ? 1 : 0.94));
        s += w;
        const back = upper ? 0 : 0.0018; // lower teeth sit just behind the upper ones
        const edgeY = lipY(at.x) - t.drop;
        const first = teeth.pos.length;
        tooth(teeth, {
          x: at.x,
          z: at.z - back,
          tangent: at.tangent,
          width: w * 1.01,
          depth: t.d * TOOTH_SCALE,
          edgeY,
          rootY: upper ? lipY(at.x) + 0.008 : lipY(at.x) - 0.009,
          down: upper,
          // Rigid per tooth, weighted like the lip right in front of it
          skin: pack4(surfaceSkin(at.x, lipY(at.x) + (upper ? 0.002 : -0.002))),
          // Further back and under the lip is in shadow; the lower row sits in the upper row's shade
          shade: (1 - 0.08 * n) * (upper ? 1 : 0.72),
          lipY: lipY(at.x),
        });
        // Push the whole tooth back if its visible part would come through the lips, so it stays
        // rigid (the hidden roots are trimmed vertex by vertex later)
        let push = 0;
        for (const q of teeth.pos.slice(first)) {
          if (Math.abs(q[1] - lipY(q[0])) > 0.004) continue;
          push = Math.max(push, q[2] - (surfaceZ(q[0], q[1]) - 0.0012));
        }
        for (const q of teeth.pos.slice(first)) q[2] -= push;
      });
    }
  }

  // ---- 3. Mouth interior: a dark sheet behind the teeth, closing in to the lips at the corners ----
  const mouth = { pos: [], color: [], joint: [], weight: [], index: [] };
  const NX = 28;
  const NY = 12;
  for (let iy = 0; iy <= NY; iy += 1) {
    for (let ix = 0; ix <= NX; ix += 1) {
      const x = CORNERS[0] - 0.001 + ((CORNERS[1] - CORNERS[0] + 0.002) * ix) / NX;
      const y = lipY(x) + 0.011 - (0.028 * iy) / NY;
      const edge = smooth(0.8, 1.02, Math.abs(x - MID) / HALF);
      const z = (lipDepth(x) - TEETH_INSET - 0.011) * (1 - edge) + (lipDepth(x) - 0.0015) * edge;
      const jaw = parting(x) * smooth(0, 0.004, lipY(x) - y);
      const deep = 1 - Math.abs(x - MID) / HALF;
      const c = srgb([0.3 - 0.16 * deep, 0.12 - 0.07 * deep, 0.12 - 0.07 * deep]);
      mouth.pos.push([x, y, z]);
      mouth.color.push(c);
      const [j4, w4] = pack4(shiftJaw(surfaceSkin(x, y), y >= lipY(x) ? -parting(x) : jaw));
      mouth.joint.push(j4);
      mouth.weight.push(w4);
    }
  }
  for (let iy = 0; iy < NY; iy += 1) {
    for (let ix = 0; ix < NX; ix += 1) {
      const a = iy * (NX + 1) + ix;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      mouth.index.push(a, c, b, b, c, d);
    }
  }

  // The face curves back unevenly (deepest in the fold under the lower lip), so nothing added may sit
  // closer than this to its front surface; only hidden parts (roots, the sheet's edges) ever get pushed
  const keepBehind = (points, margin) => {
    let missed = 0;
    for (const p of points) {
      const z = surfaceZ(p[0], p[1]);
      if (!Number.isFinite(z)) missed += 1;
      else if (p[2] > z - margin) p[2] = z - margin;
    }
    if (missed) throw new Error(`${missed} points have no face in front of them`);
  };
  keepBehind(teeth.pos, 0.0012);
  keepBehind(mouth.pos, 0.002);

  const unlit = doc.createExtension(KHRMaterialsUnlit);
  const material = (name, doubleSided) =>
    doc
      .createMaterial(name)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setDoubleSided(doubleSided)
      .setExtension("KHR_materials_unlit", unlit.createUnlit());
  const buffer = root.listBuffers()[0];
  const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  function addPrimitive(geo, mat) {
    const prim = doc
      .createPrimitive()
      .setMaterial(mat)
      .setIndices(accessor("SCALAR", new Uint32Array(geo.index)))
      .setAttribute("POSITION", accessor("VEC3", new Float32Array(geo.pos.flat())))
      .setAttribute("COLOR_0", accessor("VEC3", new Float32Array(geo.color.flat())))
      .setAttribute("JOINTS_0", accessor("VEC4", new Uint8Array(geo.joint.flat())))
      .setAttribute("WEIGHTS_0", accessor("VEC4", new Float32Array(geo.weight.flat())));
    mesh.addPrimitive(prim);
  }
  // Mouth first, so the teeth draw over it
  addPrimitive(mouth, material("mouth", true));
  addPrimitive(teeth, material("teeth", true));

  await io.write(OUT, doc);
  console.log(`teeth: ${teeth.pos.length} vertices, mouth: ${mouth.pos.length} vertices -> ${OUT}`);
})();

// One tooth: rounded-rectangle cross-sections from the root to a rounded biting edge
function tooth(geo, t) {
  const SEG = 14;
  const cos = Math.cos(t.tangent);
  const sin = Math.sin(t.tangent);
  // y offsets from the edge toward the root, with width/depth scale; the first rings round the edge
  const h = Math.abs(t.rootY - t.edgeY);
  const rings = [
    [0, 0.88, 0.3],
    [0.0004, 0.97, 0.55],
    [0.0011, 1, 0.78],
    [0.0025, 1, 0.9],
    ...Array.from({ length: 6 }, (_, k) => {
      const f = (k + 1) / 6;
      return [0.0025 + (h - 0.0025) * f, 1 - 0.16 * f ** 1.5, 0.9 + 0.1 * f];
    }),
  ];
  const sign = t.down ? 1 : -1; // upper teeth grow up from their edge, lower teeth down
  const base = geo.pos.length;
  const ringStart = [];
  for (const [dy, sw, sd] of rings) {
    ringStart.push(geo.pos.length);
    const y = t.edgeY + sign * dy;
    for (let k = 0; k < SEG; k += 1) {
      const a = (k / SEG) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      // superellipse: flat front and back, rounded sides
      const u = ((Math.sign(c) * Math.abs(c) ** 0.5 * t.width) / 2) * sw;
      const w = ((Math.sign(s) * Math.abs(s) ** 0.5 * t.depth) / 2) * sd;
      const wz = w - (t.depth / 2) * sd; // front face stays on the arch line, the edge thins from behind
      geo.pos.push([t.x + u * cos - wz * sin, y, t.z + u * sin + wz * cos]);
      // Fake light: front faces bright, sides and back darker, the part just under the lip shaded,
      // edge slightly translucent
      const facing = Math.max(0, s) ** 0.6;
      const underLip = t.down ? 0.8 + 0.2 * smooth(t.lipY + 0.0005, t.lipY - 0.0015, y) : 1;
      const light = (0.85 + 0.15 * facing) * underLip * t.shade;
      const edgeMix = 1 - smooth(0, 0.0018, dy);
      geo.color.push(toothColor(edgeMix).map((v) => v * light));
      geo.joint.push(t.skin[0]);
      geo.weight.push(t.skin[1]);
    }
  }
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let k = 0; k < SEG; k += 1) {
      const a = ringStart[r] + k;
      const b = ringStart[r] + ((k + 1) % SEG);
      const c = ringStart[r + 1] + k;
      const d = ringStart[r + 1] + ((k + 1) % SEG);
      geo.index.push(a, c, b, b, c, d);
    }
  }
  // close both ends
  for (const [r, dy] of [[0, -0.0001], [rings.length - 1, null]]) {
    const ring = ringStart[r];
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < SEG; k += 1) {
      const p = geo.pos[ring + k];
      cx += p[0] / SEG;
      cy += p[1] / SEG;
      cz += p[2] / SEG;
    }
    if (dy !== null) cy = t.edgeY - sign * 0.0001;
    const centre = geo.pos.length;
    geo.pos.push([cx, cy, cz]);
    geo.color.push(geo.color[ring]);
    geo.joint.push(t.skin[0]);
      geo.weight.push(t.skin[1]);
    for (let k = 0; k < SEG; k += 1) geo.index.push(centre, ring + k, ring + ((k + 1) % SEG));
  }
  return base;
}

// Ivory, turning slightly grey-blue toward the biting edge, which reads as translucent
function toothColor(edge) {
  const ivory = srgb([0.9, 0.87, 0.8]);
  const translucent = srgb([0.78, 0.8, 0.82]);
  return ivory.map((v, k) => v + (translucent[k] - v) * edge * 0.6);
}

// Writes the cut face back with the same component types it was stored in
function writeFace(prim, acc, g) {
  const n = g.pos.length;
  const norm = (a, scale) => a.map((v) => Math.round(v * scale));
  acc.POSITION.setArray(new Int16Array(g.pos.flatMap((p) => norm(p, 32767))));
  acc.NORMAL.setArray(new Int16Array(g.nrm.flatMap((p) => norm(p, 32767))));
  acc.TEXCOORD_0.setArray(new Uint16Array(g.uv.flatMap((p) => norm(p, 65535))));
  const joints = new Uint8Array(n * 4);
  const weights = new Uint8Array(n * 4);
  g.skin.forEach((m, i) => {
    const top = [...m].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
    const q = top.map(([, w]) => Math.round((w / sum) * 255));
    if (q.length) q[0] += 255 - q.reduce((s, v) => s + v, 0); // bytes must add up to exactly 255
    top.forEach(([j], k) => {
      joints[i * 4 + k] = j;
      weights[i * 4 + k] = q[k];
    });
  });
  acc.JOINTS_0.setArray(joints);
  acc.WEIGHTS_0.setArray(weights);
  prim.getIndices().setArray(new Uint32Array(g.index));
}

// Top four bone weights as [joints, weights], summing to 1
function pack4(m) {
  const top = [...m].filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
  const joints = [0, 0, 0, 0];
  const weights = [0, 0, 0, 0];
  top.forEach(([j, w], k) => {
    joints[k] = j;
    weights[k] = w / sum;
  });
  return [joints, weights];
}

// Least-squares polynomial through [x, y] points
function polyFit(points, degree) {
  const m = degree + 1;
  const A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (const [x, y] of points) {
    for (let r = 0; r < m; r += 1) {
      for (let c = 0; c < m; c += 1) A[r][c] += x ** (r + c);
      A[r][m] += y * x ** r;
    }
  }
  for (let c = 0; c < m; c += 1) {
    let p = c;
    for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r += 1) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= m; k += 1) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, r) => row[m] / row[r]);
}
