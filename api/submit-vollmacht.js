// /api/submit-vollmacht.js
// Erzeugt aus Vollmachtstext + Signatur ein PDF und hängt es als Datei-Anhang
// an den bereits in submit-lead.js angelegten Pipedrive-Kontakt/Deal.
//
// Benötigte Vercel Environment Variables (identisch zu submit-lead.js):
//   PIPEDRIVE_API_TOKEN
//   PIPEDRIVE_DOMAIN

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PIPEDRIVE_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_DOMAIN;

function baseUrl() {
  return `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1`;
}

/* ---------------------------------------------------------
   Zeilenumbruch-Helfer (pdf-lib bietet kein automatisches Wrapping)
--------------------------------------------------------- */
function wrapText(text, font, fontSize, maxWidth) {
  const paragraphs = text.split("\n");
  const lines = [];

  for (const paragraph of paragraphs) {
    if (paragraph.trim() === "") {
      lines.push("");
      continue;
    }
    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

async function buildVollmachtPdf({ vollmachtText, signatureDataUrl, meta }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 in pt
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const marginX = 50;
  const maxWidth = 595.28 - marginX * 2;
  const fontSize = 11;
  const lineHeight = fontSize * 1.4;

  let y = 780;

  page.drawText("Vollmacht – Energieanbieterwechsel", {
    x: marginX,
    y,
    size: 16,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 40;

  const lines = wrapText(vollmachtText, font, fontSize, maxWidth);
  for (const line of lines) {
    if (y < 220) break; // Sicherheitsabstand für Signatur + Audit-Zeile
    page.drawText(line, { x: marginX, y, size: fontSize, font });
    y -= lineHeight;
  }

  if (signatureDataUrl) {
    const base64 = signatureDataUrl.split(",")[1] || "";
    const sigBytes = Buffer.from(base64, "base64");
    const sigImage = await pdfDoc.embedPng(sigBytes);
    const sigDims = sigImage.scale(0.4);

    page.drawText("Unterschrift:", { x: marginX, y: 150, size: 10, font });
    page.drawImage(sigImage, {
      x: marginX,
      y: 60,
      width: Math.min(sigDims.width, 200),
      height: Math.min(sigDims.height, 80),
    });
  }

  const auditLine = `Erteilt am ${meta.timestamp} · IP: ${meta.ip} · Gerät: ${meta.userAgent}`;
  page.drawText(auditLine, { x: marginX, y: 30, size: 7, font, color: rgb(0.4, 0.4, 0.4) });

  return pdfDoc.save();
}

/* ---------------------------------------------------------
   Datei-Upload zu Pipedrive (analog zu uploadFileToDeal in submit-lead.js)
--------------------------------------------------------- */
async function uploadPdfToPipedrive(pdfBytes, filename, { personId, dealId }) {
  const form = new FormData();
  form.append("file", new Blob([pdfBytes], { type: "application/pdf" }), filename);
  if (dealId) form.append("deal_id", String(dealId));
  if (personId) form.append("person_id", String(personId));

  const url = `${baseUrl()}/files?api_token=${PIPEDRIVE_TOKEN}`;
  const res = await fetch(url, { method: "POST", body: form });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    throw new Error(`Pipedrive-Upload fehlgeschlagen: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

/* ---------------------------------------------------------
   Handler
--------------------------------------------------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!PIPEDRIVE_TOKEN || !PIPEDRIVE_DOMAIN) {
    console.error("PIPEDRIVE_API_TOKEN / PIPEDRIVE_DOMAIN fehlt in den Vercel Environment Variables");
    return res.status(500).json({ error: "Server nicht konfiguriert" });
  }

  try {
    const { formData, personId, dealId, signatureDataUrl, vollmachtText } = req.body || {};

    if (!formData?.vorname || !formData?.nachname || !signatureDataUrl || !vollmachtText) {
      return res.status(400).json({ error: "Fehlende Pflichtfelder." });
    }
    if (!personId && !dealId) {
      return res.status(400).json({ error: "personId oder dealId erforderlich." });
    }

    const meta = {
      timestamp: new Date().toISOString(),
      ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unbekannt",
      userAgent: req.headers["user-agent"] || "unbekannt",
    };

    const pdfBytes = await buildVollmachtPdf({ vollmachtText, signatureDataUrl, meta });
    const filename = `Vollmacht_${formData.nachname}_${formData.vorname}.pdf`.replace(/\s+/g, "_");
    const file = await uploadPdfToPipedrive(pdfBytes, filename, { personId, dealId });

    return res.status(200).json({ ok: true, fileId: file?.id ?? null });
  } catch (err) {
    console.error("submit-vollmacht Fehler:", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
