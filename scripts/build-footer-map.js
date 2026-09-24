// Draws assets/images/footer-map.svg from OpenStreetMap data around the practice.
// Run manually after moving the practice or changing the style: node scripts/build-footer-map.js
const fs = require("fs");
const path = require("path");

const LAT0 = 48.8771112;
const LON0 = 8.6790433;
const W = 1600;
const H = 900;
const KM_W = 3.4;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const S = W / (KM_W * 1000);
const OUT = path.join(__dirname, "..", "assets", "images", "footer-map.svg");

const halfLat = H / 2 / S / M_PER_DEG_LAT;
const halfLon = W / 2 / S / M_PER_DEG_LON;
const BBOX = [LAT0 - halfLat, LON0 - halfLon, LAT0 + halfLat, LON0 + halfLon].map((n) => n.toFixed(4)).join(",");

const QUERY = `[out:json][timeout:60];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street)$"](${BBOX});
  way["waterway"~"^(river|stream|canal)$"](${BBOX});
  way["railway"="rail"](${BBOX});
  node["place"~"^(suburb|quarter|neighbourhood)$"](${BBOX});
);
out geom;`;

const CLASSES = {
  minor: { kinds: ["residential", "unclassified", "living_street"], width: 3.5, opacity: 0.35 },
  mid: { kinds: ["secondary", "tertiary", "secondary_link", "tertiary_link"], width: 7, opacity: 0.7 },
  major: { kinds: ["motorway", "trunk", "primary", "motorway_link", "trunk_link", "primary_link"], width: 11, opacity: 0.9 },
};
const LABELLED_ROADS = ["Hirsauer Straße", "Calwer Straße", "Büchenbronner Straße", "Wildbader Straße", "Habermehlstraße"];
const FONT = 'font-family="Nunito, system-ui, sans-serif" font-weight="700" fill="#fff"';

const xy = (lat, lon) => [W / 2 + (lon - LON0) * M_PER_DEG_LON * S, H / 2 - (lat - LAT0) * M_PER_DEG_LAT * S];
const d = (pts) => "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Longest way of a road that stays inside the frame and is straight enough to carry a label
function labelPath(segments, name) {
  let best = null;
  for (const pts of segments) {
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
    const inside = pts.every(([x, y]) => x > 60 && x < W - 60 && y > 60 && y < H - 60);
    if (inside && dist(pts[0], pts[pts.length - 1]) > 0.7 * length && length > name.length * 11 && (!best || length > best.length)) {
      best = { length, pts };
    }
  }
  if (!best) return null;
  return best.pts[best.pts.length - 1][0] < best.pts[0][0] ? [...best.pts].reverse() : best.pts;
}

async function main() {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "User-Agent": "elitedent-footer-map/1.0" },
    body: new URLSearchParams({ data: QUERY }),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}: try again in a minute`);
  const { elements } = await res.json();

  const roads = Object.fromEntries(Object.keys(CLASSES).map((k) => [k, []]));
  const water = [];
  const rail = [];
  const named = {};
  const places = [];

  for (const e of elements) {
    const t = e.tags || {};
    if (e.type === "node") {
      const [x, y] = xy(e.lat, e.lon);
      if (x > 150 && x < W - 150 && y > 60 && y < H - 60) places.push({ x, y, name: t.name });
      continue;
    }
    const pts = e.geometry.map((p) => xy(p.lat, p.lon));
    if (t.waterway) water.push({ river: t.waterway === "river", pts });
    else if (t.railway === "rail") rail.push(pts);
    else {
      const cls = Object.keys(CLASSES).find((k) => CLASSES[k].kinds.includes(t.highway));
      roads[cls].push(pts);
      if (cls !== "minor" && t.name) (named[t.name] ||= []).push(pts);
    }
  }

  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">`];
  for (const w of water) {
    out.push(`<path d="${d(w.pts)}" stroke="#1d3557" stroke-opacity="0.35" stroke-width="${w.river ? 14 : 5}"/>`);
  }
  for (const pts of rail) {
    out.push(`<path d="${d(pts)}" stroke="#fff" stroke-opacity="0.45" stroke-width="3" stroke-dasharray="2 12"/>`);
  }
  // Grouped so overlapping streets don't stack their opacity
  for (const [k, { width, opacity }] of Object.entries(CLASSES)) {
    out.push(`<g stroke="#fff" stroke-width="${width}" opacity="${opacity}">`);
    for (const pts of roads[k]) out.push(`<path d="${d(pts)}"/>`);
    out.push("</g>");
  }

  const defs = [];
  const labels = [];
  LABELLED_ROADS.forEach((name, i) => {
    const pts = labelPath(named[name] || [], name);
    if (!pts) return;
    defs.push(`<path id="r${i}" d="${d(pts)}"/>`);
    labels.push(`<text ${FONT} font-size="22" opacity="0.9" dy="-12"><textPath href="#r${i}" startOffset="50%" text-anchor="middle">${name}</textPath></text>`);
  });
  out.push(`<defs>${defs.join("")}</defs>`, ...labels);
  for (const p of places) {
    out.push(`<text x="${p.x.toFixed(0)}" y="${p.y.toFixed(0)}" ${FONT} font-size="26" text-anchor="middle" opacity="0.8">${p.name}</text>`);
  }

  // Pin tip sits exactly on the practice
  out.push(
    `<g transform="translate(${W / 2},${H / 2})">` +
      '<path d="M0 0C-8-22-34-38-34-62a34 34 0 1 1 68 0c0 24-26 40-34 62z" fill="#fff"/>' +
      '<circle cx="0" cy="-62" r="14" fill="#428fe6"/>' +
      "</g>",
    `<text x="${W / 2}" y="${H / 2 + 40}" ${FONT} font-size="30" text-anchor="middle">EliteDent</text>`,
    "</svg>",
  );

  fs.writeFileSync(OUT, out.join("\n") + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
