/**
 * POST /api/book - consultation request via Resend
 *
 * Env (set in Vercel / host):
 *   RESEND_API_KEY   - required
 *   RESEND_FROM      - optional, default "EliteDent <noreply@elitedent.com>"
 *   BOOKINGS_INBOX   - optional, default djanieverlan@gmail.com
 */

const FROM = process.env.RESEND_FROM || "EliteDent <noreply@elitedent.com>";
const BOOKINGS_INBOX = process.env.BOOKINGS_INBOX || "djanieverlan@gmail.com";

const COMPANY_BLOCK = [
  "EliteDent",
  "[FIRMENNAME - PLACEHOLDER]",
  "[STRASSE / NR. - PLACEHOLDER]",
  "[PLZ ORT - PLACEHOLDER]",
  "Deutschland",
].join("\n");

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

function makeRefId() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return `ED-${stamp}${rand}`;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function sendResend(payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || data?.error || "Resend request failed";
    throw new Error(message);
  }
  return data;
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

  if (!process.env.RESEND_API_KEY) {
    return json(res, 500, { error: "Email is not configured yet." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return json(res, 400, { error: "Invalid JSON" });
    }
  }
  body = body || {};

  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim();
  const phone = normalizePhone(body.phone);
  const phoneDigits = phone.replace(/\D/g, "");
  const message = String(body.message || "").trim().slice(0, 1000);

  if (!fullName || fullName.length > 120) {
    return json(res, 400, { error: "Please enter your full name." });
  }
  if (!email || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { error: "Please enter a valid email." });
  }
  if (phoneDigits.length < 6 || phone.length > 30) {
    return json(res, 400, { error: "Please enter a phone number." });
  }

  const refId = makeRefId();
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);
  const safeMessage = message ? escapeHtml(message).replace(/\n/g, "<br />") : "";
  const safeCompanyHtml = escapeHtml(COMPANY_BLOCK).replace(/\n/g, "<br />");

  const userText = [
    `Guten Tag ${fullName},`,
    ``,
    `vielen Dank. Wir haben Ihre Terminanfrage erhalten.`,
    ``,
    `Ihre Angaben:`,
    `Referenz: ${refId}`,
    `Name: ${fullName}`,
    `E-Mail: ${email}`,
    `Telefon: ${phone}`,
    message ? `Nachricht: ${message}` : null,
    ``,
    `Wir melden uns in Kürze bei Ihnen.`,
    ``,
    `Mit freundlichen Grüßen`,
    `EliteDent`,
    ``,
    COMPANY_BLOCK,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const userHtml = `
    <p>Guten Tag ${safeName},</p>
    <p>vielen Dank. Wir haben Ihre Terminanfrage erhalten.</p>
    <p><strong>Ihre Angaben</strong><br />
    Referenz: ${escapeHtml(refId)}<br />
    Name: ${safeName}<br />
    E-Mail: ${safeEmail}<br />
    Telefon: ${safePhone}${
      message ? `<br />Nachricht: ${safeMessage}` : ""
    }</p>
    <p>Wir melden uns in Kürze bei Ihnen.</p>
    <p>Mit freundlichen Grüßen<br />EliteDent</p>
    <p style="color:#6b7c93;font-size:13px;line-height:1.5">${safeCompanyHtml}</p>
  `.trim();

  const clinicText = [
    `Neue Terminanfrage`,
    ``,
    `Referenz: ${refId}`,
    `Name: ${fullName}`,
    `E-Mail: ${email}`,
    `Telefon: ${phone}`,
    message ? `Nachricht: ${message}` : `Nachricht: (keine)`,
  ].join("\n");

  const clinicHtml = `
    <p><strong>Neue Terminanfrage</strong></p>
    <p>
      Referenz: ${escapeHtml(refId)}<br />
      Name: ${safeName}<br />
      E-Mail: ${safeEmail}<br />
      Telefon: ${safePhone}<br />
      Nachricht: ${message ? safeMessage : "(keine)"}
    </p>
  `.trim();

  try {
    await sendResend({
      from: FROM,
      to: [email],
      subject: `Ihre Anfrage bei EliteDent (${refId})`,
      html: userHtml,
      text: userText,
    });

    await sendResend({
      from: FROM,
      to: [BOOKINGS_INBOX],
      reply_to: email,
      subject: `Neue Terminanfrage ${refId}: ${fullName}`,
      html: clinicHtml,
      text: clinicText,
    });

    return json(res, 200, { ok: true, refId });
  } catch (err) {
    console.error("book/resend:", err);
    return json(res, 502, { error: "Could not send confirmation. Please try again." });
  }
};
