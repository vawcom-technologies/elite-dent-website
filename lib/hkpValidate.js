/**
 * Free, local HKP check — no cloud API.
 *
 * PDF text + optional Tesseract/pdftoppm OCR. Tuned to accept real German
 * Heil- und Kostenpläne even when OCR is messy.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/** One hit from these is enough to accept */
const STRONG = [
  /heil[\s.\-_]*und[\s.\-_]*kosten\s*plan/i,
  /heil.{0,12}kostenplan/i,
  /\bhkp\b/i,
  /fest[\s.\-]*zuschuss/i,
  /\bg[o0]z\b/i,
  /\bbem[a4]\b/i,
  /behandlungs\s*plan/i,
  /kassenzahn/i,
  /eigen[\s.\-]*anteil/i,
];

/** Supporting signals — need a couple if no strong hit */
const SOFT = [
  /krankenkasse|gesetzlich\s+versichert|privat\s+versichert/i,
  /zahnärztlich|zahnaerztlich|\bzahnarzt\b/i,
  /gebühren|gebuehren|honorar|punktwert/i,
  /gesamtkosten|gesamtbetrag|mehrkosten/i,
  /befund|zahnschema|therapieplan/i,
  /parodont|implantat|\bkrone\b|füllung|fuellung|prophylaxe|wurzel/i,
  /bonusheft|festzusch|kzv\b/i,
  /patient\s*zahlt|kasse\s*zahlt/i,
  /\b(1[1-8]|2[1-8]|3[1-8]|4[1-8])\b/, // FDI tooth numbers often on HKP
];

const REJECT = [
  /curriculum vitae|\blebenslauf\b|\bresume\b/i,
  /\bpassport\b|\breisepass\b|\bpersonalausweis\b/i,
  /\bführerschein\b|\bfuehrerschein\b|\bdriver.?s? license\b/i,
  /\bkontoauszug\b|\bbank\s*statement\b/i,
];

const FAIL = {
  reasonDe:
    "Dieses Dokument wurde nicht als Heil- und Kostenplan erkannt. Bitte laden Sie Ihren HKP als PDF oder ein klares Foto hoch.",
  reasonEn:
    "This document was not recognized as a treatment and cost plan. Please upload your HKP as a PDF or a clear photo.",
};

function decodePdfString(raw) {
  return raw
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, n) => String.fromCharCode(parseInt(n, 8)));
}

function stringsFromPdfBytes(bytes) {
  const raw = Buffer.isBuffer(bytes) ? bytes.toString("latin1") : String(bytes);
  const out = [];
  const paren = /\((?:\\.|[^\\)]){2,}\)/g;
  let m;
  while ((m = paren.exec(raw))) {
    const s = decodePdfString(m[0].slice(1, -1));
    if (/[A-Za-zÄÖÜäöüß0-9]{3,}/.test(s)) out.push(s);
  }
  const hex = /<([0-9A-Fa-f\s]{6,})>/g;
  while ((m = hex.exec(raw))) {
    const hexStr = m[1].replace(/\s+/g, "");
    if (hexStr.length % 2) continue;
    try {
      const s = Buffer.from(hexStr, "hex").toString("latin1");
      if (/[A-Za-zÄÖÜäöüß]{3,}/.test(s)) out.push(s);
    } catch (_) {}
  }
  return out.join(" ");
}

function extractPdfText(buf) {
  const parts = [stringsFromPdfBytes(buf)];
  const latin = buf.toString("latin1");
  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let match;
  while ((match = streamRe.exec(latin))) {
    let data = Buffer.from(match[1], "latin1");
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, -2);
    } else if (data.length >= 1 && data[data.length - 1] === 0x0a) {
      data = data.subarray(0, -1);
    }
    try {
      const inflated = zlib.inflateSync(data);
      parts.push(stringsFromPdfBytes(inflated));
      parts.push(inflated.toString("utf8").replace(/[^\x20-\x7EÄÖÜäöüß€§./:-]/g, " "));
    } catch (_) {
      parts.push(stringsFromPdfBytes(data));
    }
  }
  return parts.join("\n").replace(/\s+/g, " ").slice(0, 100000);
}

function scoreText(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 6) {
    return { strong: 0, soft: 0, rejects: 0, textLen: 0, text: "" };
  }
  const strong = STRONG.filter((re) => re.test(cleaned)).length;
  const soft = SOFT.filter((re) => re.test(cleaned)).length;
  const rejects = REJECT.filter((re) => re.test(cleaned)).length;
  return { strong, soft, rejects, textLen: cleaned.length, text: cleaned };
}

function decideFromScore(scored, method) {
  const { strong, soft, rejects, textLen } = scored;

  if (rejects >= 1 && strong < 1 && soft < 2) {
    return { ok: false, confidence: "high", method, ...FAIL };
  }
  if (strong >= 1) {
    return { ok: true, confidence: strong >= 2 ? "high" : "medium", method, reasonDe: null, reasonEn: null };
  }
  if (soft >= 2) {
    return { ok: true, confidence: "medium", method, reasonDe: null, reasonEn: null };
  }
  // Long dental-ish OCR dump with one soft cue
  if (soft >= 1 && textLen > 180) {
    return { ok: true, confidence: "low", method, reasonDe: null, reasonEn: null };
  }
  return { ok: false, confidence: textLen > 40 ? "medium" : "low", method, ...FAIL };
}

function hasBin(bin) {
  return execFileAsync(bin, bin === "tesseract" ? ["--version"] : ["-v"], { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
}

async function preprocessImage(srcPath) {
  const out = path.join(path.dirname(srcPath), `ocr-${path.basename(srcPath)}`);
  // Upscale + grayscale via sips (macOS) when available — helps Tesseract a lot
  try {
    await execFileAsync("sips", ["-s", "format", "png", "--resampleWidth", "1600", srcPath, "--out", out], {
      timeout: 30000,
    });
    return fs.existsSync(out) ? out : srcPath;
  } catch (_) {
    return srcPath;
  }
}

async function ocrImageFile(imgPath) {
  const prepared = await preprocessImage(imgPath);
  const texts = [];
  for (const psm of ["3", "4", "6"]) {
    try {
      const { stdout } = await execFileAsync(
        "tesseract",
        [prepared, "stdout", "-l", "deu+eng", "--psm", psm],
        { timeout: 90000, maxBuffer: 3 * 1024 * 1024 },
      );
      if (stdout && stdout.trim()) texts.push(stdout);
    } catch (_) {}
  }
  if (prepared !== imgPath) {
    try {
      fs.unlinkSync(prepared);
    } catch (_) {}
  }
  return texts.join("\n");
}

async function ocrImageBuffer(buf, ext) {
  if (!(await hasBin("tesseract"))) return "";
  const tmp = path.join(os.tmpdir(), `elitedent-hkp-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  try {
    fs.writeFileSync(tmp, buf);
    return await ocrImageFile(tmp);
  } catch (err) {
    console.warn("tesseract ocr:", err.message || err);
    return "";
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

async function ocrPdfViaPdftoppm(buf) {
  if (!(await hasBin("pdftoppm")) || !(await hasBin("tesseract"))) return "";

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elitedent-hkp-"));
  const pdfPath = path.join(dir, "doc.pdf");
  try {
    fs.writeFileSync(pdfPath, buf);
    await execFileAsync(
      "pdftoppm",
      ["-png", "-f", "1", "-l", "2", "-r", "200", pdfPath, path.join(dir, "page")],
      { timeout: 90000 },
    );
    const pages = fs
      .readdirSync(dir)
      .filter((f) => /^page-\d+\.png$/i.test(f))
      .sort();
    const chunks = [];
    for (const page of pages) {
      chunks.push(await ocrImageFile(path.join(dir, page)));
    }
    return chunks.join("\n");
  } catch (err) {
    console.warn("pdf ocr:", err.message || err);
    return "";
  } finally {
    try {
      for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
      fs.rmdirSync(dir);
    } catch (_) {}
  }
}

function imageExt(mime, fileName) {
  if (mime === "image/png" || /\.png$/i.test(fileName)) return ".png";
  return ".jpg";
}

async function validateHkpDocument({ buf, mime, fileName }) {
  const type = String(mime || "").toLowerCase();
  const name = String(fileName || "");
  const isPdf = type === "application/pdf" || /\.pdf$/i.test(name);
  const isImage = type.startsWith("image/") || /\.(jpe?g|png)$/i.test(name);

  let text = "";
  let method = "pdf-text";

  if (isPdf) {
    text = extractPdfText(buf);
    if (scoreText(text).strong < 1 && scoreText(text).soft < 2) {
      const ocr = await ocrPdfViaPdftoppm(buf);
      if (ocr.trim()) {
        text = `${text}\n${ocr}`;
        method = "pdf-ocr";
      }
    }
  } else if (isImage) {
    method = "image-ocr";
    text = await ocrImageBuffer(buf, imageExt(type, name));
    if (!text.trim()) {
      // Filename hint alone is too weak for photos, but a clearly named HKP
      // with a non-tiny image is often a phone photo of the plan — accept for review.
      const bytes = buf.length || 0;
      if (/hkp|heil|kostenplan|behandlungsplan/i.test(name) && bytes > 80_000) {
        return {
          ok: true,
          confidence: "low",
          method: "image-filename",
          reasonDe: null,
          reasonEn: null,
        };
      }
      return {
        ok: false,
        confidence: "low",
        method: "image-no-ocr",
        reasonDe:
          "Wir konnten den Text des Fotos nicht lesen. Bitte laden Sie den HKP als PDF hoch oder ein schärferes Foto.",
        reasonEn:
          "We could not read the photo text. Please upload the HKP as a PDF or a clearer photo.",
      };
    }
  } else {
    return { ok: false, confidence: "high", method: "type", ...FAIL };
  }

  // Mild filename bonus only after some readable content exists
  if (/hkp|heil|kostenplan|behandlungsplan/i.test(name) && text.trim().length > 20) {
    text += "\nHeil- und Kostenplan HKP";
  }

  return decideFromScore(scoreText(text), method);
}

module.exports = { validateHkpDocument, extractPdfText, scoreText };
