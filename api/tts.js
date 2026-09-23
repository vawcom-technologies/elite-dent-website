/**
 * POST /api/tts — Piper speech for the page guide, generated on first request and cached.
 * The spoken line is whatever text the client sends (from guideScripts).
 *
 * Env (all optional, defaults point at the local .piper/ setup):
 *   PIPER_PYTHON    Python with piper-tts installed
 *   PIPER_MODEL_DE  German voice (.onnx)
 *   PIPER_MODEL_EN  English voice (.onnx)
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");

const ROOT = path.join(__dirname, "..");
const MAX_CHARS = 2000;
const CACHE_DIR = path.join(ROOT, ".tts-cache");
const PIPER_DIR = path.join(ROOT, ".piper");
const PYTHON = process.env.PIPER_PYTHON || path.join(PIPER_DIR, "venv", "bin", "python");
const MODELS = {
  de: process.env.PIPER_MODEL_DE || path.join(PIPER_DIR, "voices", "de_DE-thorsten-high.onnx"),
  en: process.env.PIPER_MODEL_EN || path.join(PIPER_DIR, "voices", "en_GB-alan-medium.onnx"),
};

let worker = null;
let nextId = 0;
const pending = new Map();
const inflight = new Map();

function startWorker() {
  const proc = spawn(PYTHON, [path.join(ROOT, "lib", "piper_worker.py"), MODELS.de, MODELS.en], {
    stdio: ["pipe", "pipe", "ignore"],
  });
  let markReady;
  let failReady;
  const ready = new Promise((resolve, reject) => {
    markReady = resolve;
    failReady = reject;
  });
  ready.catch(() => {});
  proc.once("error", (err) => failReady(err));
  readline.createInterface({ input: proc.stdout }).on("line", (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.ready) return markReady();
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    msg.ok ? job.resolve() : job.reject(new Error(msg.error || "piper failed"));
  });
  proc.once("exit", () => {
    failReady(new Error("piper exited"));
    if (worker?.proc === proc) worker = null;
    for (const job of pending.values()) job.reject(new Error("piper exited"));
    pending.clear();
  });
  return { proc, ready };
}

async function synthesize(text, lang, out) {
  if (!worker) worker = startWorker();
  const { proc, ready } = worker;
  await ready;
  const id = ++nextId;
  const done = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  proc.stdin.write(JSON.stringify({ id, lang, text, out }) + "\n");
  return done;
}

function cacheFile(text, lang) {
  const hash = crypto.createHash("sha256").update(`piper:${lang}\n${text}`).digest("hex");
  return path.join(CACHE_DIR, `${hash}.wav`);
}

function speech(text, lang) {
  const file = cacheFile(text, lang);
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (inflight.has(file)) return inflight.get(file);
  const tmp = `${file}.${process.pid}.tmp`;
  const job = (async () => {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    await synthesize(text, lang, tmp);
    fs.renameSync(tmp, file);
    return file;
  })().finally(() => inflight.delete(file));
  inflight.set(file, job);
  return job;
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

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "Invalid JSON" });
  }

  const text = String(body?.text || "").trim();
  const lang = body?.lang === "en" ? "en" : "de";
  if (!text || text.length > MAX_CHARS) {
    return json(res, 400, { error: "Missing or too-long text." });
  }

  let file;
  try {
    file = await speech(text, lang);
  } catch (err) {
    console.error("piper:", err.message);
    return json(res, 503, { error: "Voice is temporarily unavailable." });
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.end(fs.readFileSync(file));
};

module.exports.warm = () => {
  if (!worker && fs.existsSync(PYTHON)) worker = startWorker();
};
