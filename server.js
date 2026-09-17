/**
 * Local preview: static files + API routes
 *   node server.js
 * Then open http://127.0.0.1:8765/
 */

const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8765;

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();
const tts = require("./api/tts");
const hkp = require("./api/hkp");
const hkpAdmin = require("./api/hkp-admin");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
};

function safeFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  let rel = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  if (rel.endsWith("/")) rel += "index.html";
  if (
    rel.startsWith("data/") ||
    rel.startsWith(".env") ||
    rel.startsWith(".tts-cache") ||
    rel.startsWith("node_modules/")
  ) {
    return null;
  }
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    const index = path.join(abs, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  return fs.existsSync(abs) ? abs : null;
}

async function runApi(handler, req, res, label) {
  try {
    await handler(req, res);
  } catch (err) {
    console.error(`${label}:`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `${label} failed.` }));
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  req.method = req.method || "GET";
  req.url = url.pathname + url.search;

  if (url.pathname === "/api/tts") {
    await runApi(tts, req, res, "tts");
    return;
  }
  if (url.pathname === "/api/hkp") {
    await runApi(hkp, req, res, "hkp");
    return;
  }
  if (url.pathname === "/api/hkp-admin") {
    await runApi(hkpAdmin, req, res, "hkp-admin");
    return;
  }

  const file = safeFile(url.pathname);
  if (!file) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.log("Missing ELEVENLABS_API_KEY in .env — guide will fall back to the system voice.");
  } else if (!key.startsWith("sk_")) {
    console.log("ELEVENLABS_API_KEY should be the secret key (sk_...), not the Key ID.");
  }
  console.log(`http://127.0.0.1:${PORT}/about/`);
});
