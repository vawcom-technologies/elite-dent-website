/**
 * GET  /api/hkp-admin              list submissions
 * GET  /api/hkp-admin?id=&download=1  download HKP file
 * POST /api/hkp-admin              { id, status?, notes? } or { id, action: "delete" }
 *
 * Auth: Authorization: Bearer <HKP_ADMIN_PASSWORD>
 */

const fs = require("fs");
const path = require("path");
const store = require("../lib/hkpStore");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function adminPassword() {
  return String(process.env.HKP_ADMIN_PASSWORD || "").trim();
}

function readToken(req, url) {
  const header = String(req.headers.authorization || "");
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  return String(url.searchParams.get("password") || req.body?.password || "").trim();
}

function authorized(req, url) {
  const expected = adminPassword();
  if (!expected) return false;
  const got = readToken(req, url);
  return got && got === expected;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
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
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return json(res, 204, {});
  }

  if (!adminPassword()) {
    return json(res, 503, { error: "Admin password is not configured." });
  }

  if (req.method === "POST") {
    try {
      req.body = await readBody(req);
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
  }

  if (!authorized(req, url)) {
    return json(res, 401, { error: "Unauthorized" });
  }

  if (req.method === "GET") {
    const id = url.searchParams.get("id") || "";
    if (url.searchParams.get("download") === "1") {
      const record = store.getById(id);
      const file = store.filePath(record);
      if (!record || !file) return json(res, 404, { error: "File not found." });
      const ext = path.extname(record.storedName).toLowerCase();
      const mime =
        ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
      res.statusCode = 200;
      res.setHeader("Content-Type", mime);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(record.fileName || record.storedName)}"`
      );
      fs.createReadStream(file).pipe(res);
      return;
    }
    return json(res, 200, {
      ok: true,
      statuses: store.STATUSES,
      retentionDays: store.retentionDays(),
      submissions: store.list(),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const id = String(req.body.id || "").trim();
  if (!id) return json(res, 400, { error: "Missing id." });

  if (req.body.action === "delete") {
    const deleted = store.remove(id);
    if (!deleted) return json(res, 404, { error: "Submission not found." });
    return json(res, 200, { ok: true, deleted: id });
  }

  const updated = store.update(id, {
    status: req.body.status,
    notes: req.body.notes,
  });
  if (!updated) return json(res, 404, { error: "Submission not found." });
  return json(res, 200, { ok: true, submission: store.list().find((row) => row.id === id) });
};
