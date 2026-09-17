/**
 * POST /api/tts — ElevenLabs speech for the page guide.
 * The spoken line is whatever text the client sends (from guideScripts).
 *
 * Env:
 *   ELEVENLABS_API_KEY   required
 *   ELEVENLABS_VOICE_ID  optional male multilingual default (Daniel)
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const MAX_CHARS = 2000;
const CACHE_DIR = path.join(__dirname, "..", ".tts-cache");

/** One ElevenLabs request at a time — free tier caps concurrent calls. */
let elevenQueue = Promise.resolve();
function withElevenLock(fn) {
  const run = elevenQueue.then(fn, fn);
  elevenQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.reject(new Error("Invalid JSON"));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function voiceId() {
  return process.env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";
}

function cacheFile(text) {
  const hash = crypto.createHash("sha256").update(`${voiceId()}\n${text}`).digest("hex");
  return path.join(CACHE_DIR, `${hash}.mp3`);
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return json(res, 204, {});
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return json(res, 503, { error: "TTS is not configured yet." });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "Invalid JSON" });
  }

  const text = String(body?.text || "").trim();
  if (!text || text.length > MAX_CHARS) {
    return json(res, 400, { error: "Missing or too-long text." });
  }

  const file = cacheFile(text);
  if (fs.existsSync(file)) {
    const audio = fs.readFileSync(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-TTS-Cache", "hit");
    return res.end(audio);
  }

  return withElevenLock(async () => {
    if (fs.existsSync(file)) {
      const audio = fs.readFileSync(file);
      res.statusCode = 200;
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.setHeader("X-TTS-Cache", "hit");
      return res.end(audio);
    }

    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId()}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.75,
              style: 0.35,
              use_speaker_boost: true,
              speed: 1.1,
            },
          }),
        },
      );
      if (response.ok) break;
      if (response.status !== 429 || attempt === 3) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("elevenlabs:", response.status, detail.slice(0, 300));
      return json(res, 502, { error: "Voice generation failed." });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, audio);
    } catch (err) {
      console.error("tts cache write:", err);
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-TTS-Cache", "miss");
    res.end(audio);
  });
};
