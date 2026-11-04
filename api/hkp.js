/**
 * POST /api/hkp  — consultation request with HKP upload
 * GET  /api/hkp?token=  — lookup a submission by token
 */

const store = require("../lib/hkpStore");
const { validateHkpDocument } = require("../lib/hkpValidate");

const FROM = process.env.RESEND_FROM || "EliteDent <noreply@elitedent.com>";
const BOOKINGS_INBOX = process.env.BOOKINGS_INBOX || "elitedent@outlook.de";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePhone(value) {
  return String(value || "").replace(/[\s()-]/g, "");
}

function readRaw(req) {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function headerValue(part, name) {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(part.headers);
  return match ? match[1] : "";
}

function parseMultipart(buf, contentType) {
  const bound = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  const boundary = bound && (bound[1] || bound[2]);
  if (!boundary) return null;
  const sep = Buffer.from(`--${boundary}`);
  const fields = {};
  let file = null;
  let offset = buf.indexOf(sep);
  while (offset >= 0) {
    let start = offset + sep.length;
    if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
    const next = buf.indexOf(sep, start);
    if (next < 0) break;
    let part = buf.slice(start, next);
    if (part.length >= 2 && part[part.length - 2] === 13 && part[part.length - 1] === 10) {
      part = part.slice(0, -2);
    }
    const split = part.indexOf("\r\n\r\n");
    if (split < 0) {
      offset = next;
      continue;
    }
    const headers = part.slice(0, split).toString("utf8");
    const body = part.slice(split + 4);
    const name = headerValue({ headers }, "name");
    if (!name) {
      offset = next;
      continue;
    }
    if (/filename=/i.test(headers)) {
      const mime = (/Content-Type:\s*([^\r\n]+)/i.exec(headers) || [])[1] || "";
      file = { name: headerValue({ headers }, "filename"), mime: mime.trim(), buf: body };
    } else {
      fields[name] = body.toString("utf8").replace(/\r\n$/, "");
    }
    offset = next;
  }
  return { fields, file };
}

async function sendResend(payload) {
  if (!process.env.RESEND_API_KEY) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || data?.error || "Resend request failed");
  }
}

async function notify(row) {
  const safeName = escapeHtml(row.fullName);
  const userText = [
    `Guten Tag ${row.fullName},`,
    ``,
    `vielen Dank. Wir haben Ihre Anfrage und Ihren Heil- und Kostenplan erhalten (Referenz ${row.id}).`,
    ``,
    `Unser Team prüft Behandlungsplan und Kosten und meldet sich mit den nächsten Schritten.`,
    ``,
    `Mit freundlichen Grüßen`,
    `EliteDent`,
  ].join("\n");

  const clinicText = [
    `Neuer HKP-Eingang`,
    ``,
    `Referenz: ${row.id}`,
    `Name: ${row.fullName}`,
    `E-Mail: ${row.email}`,
    `Telefon: ${row.phone}`,
    row.message ? `Nachricht: ${row.message}` : `Nachricht: (keine)`,
    `Datei: ${row.fileName}`,
    ``,
    `Admin: /admin/hkp/`,
  ].join("\n");

  await sendResend({
    from: FROM,
    to: [row.email],
    subject: `Ihr HKP bei EliteDent (${row.id})`,
    text: userText,
    html: `<p>Guten Tag ${safeName},</p><p>vielen Dank. Wir haben Ihre Anfrage und Ihren Heil- und Kostenplan erhalten (Referenz ${escapeHtml(row.id)}).</p><p>Unser Team prüft Behandlungsplan und Kosten und meldet sich mit den nächsten Schritten.</p><p>Mit freundlichen Grüßen<br />EliteDent</p>`,
  });

  await sendResend({
    from: FROM,
    to: [BOOKINGS_INBOX],
    reply_to: row.email,
    subject: `Neuer HKP ${row.id}: ${row.fullName}`,
    text: clinicText,
    html: `<p><strong>Neuer HKP-Eingang</strong></p><p>Referenz: ${escapeHtml(row.id)}<br />Name: ${safeName}<br />E-Mail: ${escapeHtml(row.email)}<br />Telefon: ${escapeHtml(row.phone)}<br />Nachricht: ${row.message ? escapeHtml(row.message) : "(keine)"}<br />Datei: ${escapeHtml(row.fileName)}</p><p>Admin: /admin/hkp/</p>`,
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return json(res, 204, {});
  }

  if (req.method === "GET") {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const token = url.searchParams.get("token") || "";
    const record = store.getByToken(token);
    if (!record) return json(res, 404, { error: "HKP not found." });
    return json(res, 200, store.publicView(record));
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const checkOnly = new URL(req.url || "/", "http://127.0.0.1").searchParams.get("check") === "1";

  const contentType = req.headers["content-type"] || "";
  let fields = {};
  let file = null;

  try {
    const raw = await readRaw(req);
    if (contentType.includes("multipart/form-data")) {
      const parsed = parseMultipart(raw, contentType);
      fields = parsed?.fields || {};
      file = parsed?.file;
    } else {
      const body = JSON.parse(raw.toString("utf8") || "{}");
      fields = body;
      if (body.fileBase64 && body.fileName) {
        file = {
          name: body.fileName,
          mime: body.fileMime || store.mimeFromName(body.fileName),
          buf: Buffer.from(String(body.fileBase64).replace(/^data:[^;]+;base64,/, ""), "base64"),
        };
      }
    }
  } catch {
    return json(res, 400, { error: "Invalid upload." });
  }

  const mime = (file?.mime || store.mimeFromName(file?.name)).toLowerCase();
  const ext = store.fileExt(mime, file?.name);

  if (!file?.buf?.length || !ext) {
    return json(res, 400, {
      error: "Bitte laden Sie ein PDF, JPG oder PNG hoch.",
      code: "missing_file",
    });
  }

  let verdict;
  try {
    verdict = await validateHkpDocument({
      buf: file.buf,
      mime: mime || store.mimeFromName(file.name),
      fileName: file.name,
    });
  } catch (err) {
    console.error("hkp validate:", err);
    verdict = { ok: true, confidence: "low", method: "error-bypass" };
  }

  if (!verdict?.ok) {
    return json(res, 400, {
      error:
        verdict.reasonDe ||
        "Dieses Dokument wurde nicht als Heil- und Kostenplan erkannt. Bitte laden Sie Ihren HKP hoch.",
      code: "not_hkp",
      confidence: verdict.confidence || "low",
    });
  }

  if (checkOnly) {
    return json(res, 200, {
      ok: true,
      confidence: verdict.confidence || "medium",
      method: verdict.method || "local",
    });
  }

  const fullName = String(fields.fullName || "").trim();
  const email = String(fields.email || "").trim();
  const phone = normalizePhone(fields.phone);
  const phoneDigits = phone.replace(/\D/g, "");
  const message = String(fields.message || "").trim().slice(0, 1000);

  if (!fullName || fullName.length > 120) {
    return json(res, 400, { error: "Please enter your full name." });
  }
  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: "Please enter a valid email." });
  }
  if (phoneDigits.length < 6 || phone.length > 30) {
    return json(res, 400, { error: "Please enter a phone number." });
  }

  const consentRaw = String(fields.consent || "").trim().toLowerCase();
  const consent = consentRaw === "1" || consentRaw === "on" || consentRaw === "true" || consentRaw === "yes";
  if (!consent) {
    return json(res, 400, { error: "Please accept the privacy notice to continue." });
  }

  let row;
  try {
    row = store.create({
      fullName,
      email,
      phone,
      message,
      fileName: file.name,
      fileMime: mime || store.mimeFromName(file.name),
      fileBuf: file.buf,
      consent: true,
      validation: {
        method: verdict.method,
        confidence: verdict.confidence,
      },
    });
  } catch (err) {
    return json(res, err.status || 500, { error: err.message || "Could not save HKP." });
  }

  try {
    await notify(row);
  } catch (err) {
    console.error("hkp/resend:", err);
  }

  return json(res, 200, {
    ok: true,
    token: row.token,
    ...store.publicView(row),
  });
};
