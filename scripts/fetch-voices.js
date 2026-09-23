// Runs on `npm install` (locally and during the Vercel build) so the voice models never live in git.
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const bz2 = require("unbzip2-stream");
const tar = require("tar");

const VOICES_DIR = path.join(__dirname, "..", "voices");
const RELEASE = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models";
// Both archives ship identical espeak-ng-data, so only the German copy is kept
const VOICES = [
  { name: "de_DE-thorsten-medium", espeak: true },
  { name: "en_GB-alan-medium", espeak: false },
];

async function fetchVoice({ name, espeak }) {
  const dir = path.join(VOICES_DIR, `vits-piper-${name}`);
  if (fs.existsSync(path.join(dir, `${name}.onnx`))) return;
  const res = await fetch(`${RELEASE}/vits-piper-${name}.tar.bz2`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  fs.mkdirSync(VOICES_DIR, { recursive: true });
  await pipeline(
    Readable.fromWeb(res.body),
    bz2(),
    tar.x({ cwd: VOICES_DIR, filter: (p) => espeak || !p.includes("/espeak-ng-data") }),
  );
  console.log(`voice ready: ${name}`);
}

(async () => {
  for (const voice of VOICES) await fetchVoice(voice);
})().catch((err) => {
  console.error("fetch-voices:", err.message);
  process.exit(1);
});
