const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "hkp.json");
const FILES_DIR = path.join(DATA_DIR, "hkp-files");
const MAX_BYTES = 8 * 1024 * 1024;

const STATUSES = ["new", "approved", "rejected", "in_progress", "done"];
const CONSENT_VERSION = "website-consult-2026-09";
// ponytail: plaintext local store; encrypt at rest when hosting holds real patient volume
const DEFAULT_RETENTION_DAYS = 730;

const ALLOWED = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

function retentionDays() {
  const n = Number(process.env.HKP_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RETENTION_DAYS;
}

function load() {
  ensureDirs();
  if (!fs.existsSync(STORE_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(rows) {
  ensureDirs();
  fs.writeFileSync(STORE_FILE, JSON.stringify(rows, null, 2));
}

function unlinkFile(record) {
  const abs = filePath(record);
  if (abs) {
    try {
      fs.unlinkSync(abs);
    } catch (_) {}
  }
}

function purgeExpired(rows) {
  const days = retentionDays();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let changed = false;
  const kept = [];
  for (const row of rows) {
    const created = Date.parse(row.createdAt || "");
    if (Number.isFinite(created) && created < cutoff) {
      unlinkFile(row);
      changed = true;
      continue;
    }
    kept.push(row);
  }
  if (changed) save(kept);
  return kept;
}

function makeId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `HKP-${stamp}${rand}`;
}

function makeToken() {
  return crypto.randomBytes(24).toString("hex");
}

function fileExt(mime, name) {
  if (ALLOWED[mime]) return ALLOWED[mime];
  const ext = path.extname(String(name || "")).toLowerCase();
  if (ext === ".jpeg") return ".jpg";
  if (ext === ".pdf" || ext === ".jpg" || ext === ".png") return ext;
  return "";
}

function mimeFromName(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "";
}

function publicView(record) {
  if (!record) return null;
  return {
    refId: record.id,
    status: record.status,
  };
}

function getByToken(token) {
  if (!token) return null;
  return load().find((row) => row.token === token) || null;
}

function getById(id) {
  if (!id) return null;
  return load().find((row) => row.id === id) || null;
}

function list() {
  return purgeExpired(load())
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      message: row.message,
      status: row.status,
      notes: row.notes || "",
      fileName: row.fileName,
      fileMime: row.fileMime,
      consentAt: row.consentAt || null,
    }));
}

function create({ fullName, email, phone, message, fileName, fileMime, fileBuf, validation, consent }) {
  if (!consent) {
    throw Object.assign(new Error("Privacy consent is required."), { status: 400 });
  }
  const ext = fileExt(fileMime, fileName);
  if (!ext || !fileBuf || !fileBuf.length) {
    throw Object.assign(new Error("Please upload a PDF, JPG, or PNG file."), { status: 400 });
  }
  if (fileBuf.length > MAX_BYTES) {
    throw Object.assign(new Error("File is too large (max 8 MB)."), { status: 400 });
  }

  const id = makeId();
  const storedName = `${id}${ext}`;
  ensureDirs();
  fs.writeFileSync(path.join(FILES_DIR, storedName), fileBuf);

  const now = new Date().toISOString();
  const row = {
    id,
    token: makeToken(),
    createdAt: now,
    updatedAt: now,
    fullName,
    email,
    phone,
    message: message || "",
    status: "new",
    notes: "",
    fileName: String(fileName || storedName).slice(0, 180),
    fileMime: fileMime || mimeFromName(fileName),
    storedName,
    validation: validation || null,
    consentAt: now,
    consentVersion: CONSENT_VERSION,
  };

  const rows = purgeExpired(load());
  rows.push(row);
  save(rows);
  return row;
}

function update(id, patch) {
  const rows = load();
  const row = rows.find((item) => item.id === id);
  if (!row) return null;
  if (patch.status) {
    if (!STATUSES.includes(patch.status)) {
      throw Object.assign(new Error("Unknown status."), { status: 400 });
    }
    row.status = patch.status;
  }
  if (typeof patch.notes === "string") {
    row.notes = patch.notes.slice(0, 4000);
  }
  row.updatedAt = new Date().toISOString();
  save(rows);
  return row;
}

function remove(id) {
  const rows = load();
  const idx = rows.findIndex((item) => item.id === id);
  if (idx < 0) return false;
  unlinkFile(rows[idx]);
  rows.splice(idx, 1);
  save(rows);
  return true;
}

function filePath(record) {
  if (!record?.storedName) return null;
  const abs = path.normalize(path.join(FILES_DIR, record.storedName));
  if (!abs.startsWith(FILES_DIR)) return null;
  return fs.existsSync(abs) ? abs : null;
}

module.exports = {
  STATUSES,
  CONSENT_VERSION,
  ALLOWED,
  MAX_BYTES,
  retentionDays,
  publicView,
  getByToken,
  getById,
  list,
  create,
  update,
  remove,
  filePath,
  fileExt,
  mimeFromName,
};
