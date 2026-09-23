/**
 * GET /api/tts?lang=de|en&text=… — Piper speech for the page guide via sherpa-onnx.
 * Lines are generated on first request; the long s-maxage lets Vercel's CDN keep each one,
 * so a given line is normally generated once rather than per visitor.
 * Voice models are downloaded into voices/ by scripts/fetch-voices.js on npm install.
 */

const path = require("path");

const MAX_CHARS = 600;
const VOICES_DIR = path.join(__dirname, "..", "voices");
const VOICE = { de: "de_DE-thorsten-medium", en: "en_GB-alan-medium" };
const ESPEAK = path.join(VOICES_DIR, `vits-piper-${VOICE.de}`, "espeak-ng-data");
// Pace relative to Piper's default; Alan reads slowly, so English gets a bit more
const SPEED = { de: 1.08, en: 1.2 };

const engines = {};
const memo = new Map();
const MEMO_LIMIT = 200;
// One line at a time: parallel jobs fill libuv's threadpool and stall file reads for page loads
let queue = Promise.resolve();

function engine(lang) {
  if (!engines[lang]) {
    const { OfflineTts } = require("sherpa-onnx-node");
    const dir = path.join(VOICES_DIR, `vits-piper-${VOICE[lang]}`);
    engines[lang] = OfflineTts.createAsync({
      model: {
        vits: {
          model: path.join(dir, `${VOICE[lang]}.onnx`),
          tokens: path.join(dir, "tokens.txt"),
          dataDir: ESPEAK,
        },
        numThreads: 2,
      },
      maxNumSentences: 1,
    });
    engines[lang].catch(() => delete engines[lang]);
  }
  return engines[lang];
}

function toWav(samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function speech(text, lang) {
  const key = lang + "\n" + text;
  if (!memo.has(key)) {
    const job = queue
      .then(() => engine(lang))
      .then((tts) => tts.generateAsync({ text, sid: 0, speed: SPEED[lang] }))
      .then((audio) => toWav(audio.samples, audio.sampleRate));
    queue = job.catch(() => {});
    job.catch(() => memo.delete(key));
    memo.set(key, job);
    if (memo.size > MEMO_LIMIT) memo.delete(memo.keys().next().value);
  }
  return memo.get(key);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const params = new URL(req.url || "/", "http://localhost").searchParams;
  const text = String(params.get("text") || "").trim();
  const lang = params.get("lang") === "en" ? "en" : "de";
  if (!text || text.length > MAX_CHARS) {
    return json(res, 400, { error: "Missing or too-long text." });
  }

  let wav;
  try {
    wav = await speech(text, lang);
  } catch (err) {
    console.error("tts:", err.message);
    return json(res, 503, { error: "Voice is temporarily unavailable." });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", wav.length);
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=31536000, immutable");
  res.end(wav);
};

module.exports.warm = () => {
  engine("de").catch((err) => console.error("tts warm:", err.message));
};
