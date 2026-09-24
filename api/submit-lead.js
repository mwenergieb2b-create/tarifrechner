// /api/submit-lead.js
// Nimmt die Rechner-Submits entgegen und legt/aktualisiert Person + Deal
// DIREKT in Pipedrive an — ersetzt den früheren n8n-Webhook.
//
// Benötigte Vercel Environment Variables (Project Settings -> Environment Variables):
//   PIPEDRIVE_API_TOKEN    - dein Pipedrive API-Token
//   PIPEDRIVE_DOMAIN       - deine Subdomain, z.B. "kwhberatung" (NUR der Teil vor .pipedrive.com)
//   PIPEDRIVE_PIPELINE_ID  - optional, Standard 22
//   PIPEDRIVE_STAGE_ID     - optional, Standard 107
//
// Ablauf pro Submit:
//   1. Person per Telefonnummer suchen -> vorhanden? updaten : neu anlegen
//      Die Telefonnummer wird dafür NORMALISIERT (siehe normalizePhone),
//      da z.B. Facebook-Lead-Ads und der manuell ausgefüllte Rechner die
//      Nummer unterschiedlich formatieren (Leerzeichen, +49 vs. 0, etc.)
//      und Pipedrives Textsuche sonst keinen Treffer findet -> Duplikat.
//   2. Offenen Deal dieser Person in der Ziel-Pipeline suchen
//      -> vorhanden? updaten (so wird aus "lead_vorab" + "vollstaendig"
//         am Ende EIN Deal, nicht zwei) : neu anlegen
//   3. Dokumente + Zählerfoto als echte Datei-Anhänge an den Deal hängen
//      (nicht als Base64-Textwurst in ein Custom Field quetschen)
//
// Custom Fields: Pipedrive braucht dafür lange Hash-Keys statt Klarnamen.
// Diese Funktion fragt beim ersten Aufruf einmal alle vorhandenen Felder ab,
// matcht sie über den Klarnamen (Groß-/Kleinschreibung egal) und legt
// fehlende Felder automatisch in Pipedrive an. Ihr müsst also nirgends
// manuell nach Hash-Keys suchen.

const PIPEDRIVE_TOKEN = process.env.PIPEDRIVE_API_TOKEN;
const PIPEDRIVE_DOMAIN = process.env.PIPEDRIVE_DOMAIN;
const PIPELINE_ID = Number(process.env.PIPEDRIVE_PIPELINE_ID || 22);
const STAGE_ID = Number(process.env.PIPEDRIVE_STAGE_ID || 107);

// Bereits in Pipedrive angelegte Deal-Custom-Fields "Telefonnummer" und "Mail"
// (aus dem alten Facebook-Leads/Make-Setup). Diese Hash-Keys sind fix und
// werden NICHT über die Namens-Discovery (ensureField) gesucht, weil der
// Klarname in Pipedrive vom hier verwendeten Payload-Feldnamen abweichen
// könnte. Zusätzlich zu den nativen Person-Feldern (phone/email) werden
// Telefonnummer und E-Mail hierüber auch als Deal-Custom-Field gespiegelt,
// da die Pipedrive-Ansicht des Nutzers auf diese Felder eingerichtet ist.
const FIXED_DEAL_FIELD_KEYS = {
  telefon: "1b1cada39503a8c6f097193c00627e7f727508fd",
  email: "ea26df104846eba020f66dfe128258d9f364fdb9",
};

function baseUrl() {
  return `https://${PIPEDRIVE_DOMAIN}.pipedrive.com/api/v1`;
}

async function pd(path, options = {}) {
  const url = `${baseUrl()}${path}${path.includes("?") ? "&" : "?"}api_token=${PIPEDRIVE_TOKEN}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.success === false) {
    throw new Error(`Pipedrive-Fehler bei ${path}: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

/* ---------------------------------------------------------
   Telefonnummer-Normalisierung
   ---------------------------------------------------------
   Facebook/Instagram-Lead-Ads und das manuelle Ausfüllen im
   Rechner liefern Telefonnummern fast nie im selben Format
   (Leerzeichen, Klammern, Bindestriche, "0176..." vs.
   "+49176..." vs. "0049176..."). Pipedrives Textsuche matcht
   aber nur auf den gespeicherten String -> ohne Normalisierung
   findet findPersonByPhone() den Bestandskontakt nicht und es
   entsteht ein Duplikat. Deshalb wird JEDE Nummer vor dem
   Vergleichen und vor dem Speichern auf ein einheitliches
   Format (E.164, Annahme: Deutschland) gebracht.
--------------------------------------------------------- */
function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).trim().replace(/[^\d+]/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) {
    digits = "+" + digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = "+49" + digits.slice(1);
  } else if (!digits.startsWith("+")) {
    digits = "+49" + digits;
  }
  return digits;
}

// Für die Pipedrive-Suche selbst wird bewusst NICHT die vollständige
// normalisierte Nummer verwendet, sondern nur der national eindeutige
// Ziffernblock ohne Ländervorwahl. Grund: Pipedrives Fuzzy-Suche auf
// Telefonfeldern reagiert empfindlich auf führende Zeichen wie "+" und
// liefert bei unterschiedlicher Formatierung sonst false negatives.
function phoneSearchTerm(raw) {
  const normalized = normalizePhone(raw);
  const nationalDigits = normalized.replace(/^\+49/, "").replace(/^\+/, "");
  return nationalDigits.slice(-9); // letzte 9 Ziffern reichen zur Identifikation
}

/* ---------------------------------------------------------
   Custom-Field-Discovery + Auto-Anlage
--------------------------------------------------------- */
let personFieldCache = null;
let dealFieldCache = null;

async function getFieldMap(entity) {
  if (entity === "person" && personFieldCache) return personFieldCache;
  if (entity === "deal" && dealFieldCache) return dealFieldCache;

  const fields = await pd(entity === "person" ? "/personFields" : "/dealFields");
  const map = new Map();
  for (const f of fields) map.set(String(f.name).trim().toLowerCase(), f.key);

  if (entity === "person") personFieldCache = map;
  else dealFieldCache = map;
  return map;
}

async function ensureField(entity, name, fieldType = "varchar") {
  const map = await getFieldMap(entity);
  const lookupKey = name.trim().toLowerCase();
  if (map.has(lookupKey)) return map.get(lookupKey);

  // Feld existiert in Pipedrive noch nicht -> automatisch anlegen
  const created = await pd(entity === "person" ? "/personFields" : "/dealFields", {
    method: "POST",
    body: JSON.stringify({ name, field_type: fieldType }),
  });
  map.set(lookupKey, created.key);
  return created.key;
}

/* ---------------------------------------------------------
   Mapping: Rechner-Payload-Feld -> Pipedrive-Feldname (+Typ
   für die automatische Neuanlage). Die Namen hier sind exakt
   das, was in Pipedrive als Feldname erscheint — bereits
   vorhandene Felder mit demselben Namen (z.B. aus dem alten
   n8n-Setup) werden automatisch wiederverwendet.
--------------------------------------------------------- */
const DEAL_FIELD_CONFIG = [
  ["anrede", "Anrede", "varchar"],
  ["kontoinhaber", "Kontoinhaber", "varchar"],
  ["submission_typ", "Submission Typ", "varchar"],
  ["geburtsdatum", "Geburtsdatum", "date"],
  ["strasse", "Straße", "varchar"],
  ["hausnummer", "Hausnummer", "varchar"],
  ["plz", "PLZ", "varchar"],
  ["ort", "Ort", "varchar"],
  ["neueinzug", "Neueinzug", "varchar"],
  ["einzugsdatum", "Einzugsdatum", "date"],
  ["kundennummer_alt", "Kundennummer Alt", "varchar"],
  ["aktueller_anbieter", "Aktueller Anbieter", "varchar"],
  ["iban", "IBAN", "varchar"],
  ["iban_status", "IBAN Status", "varchar"],
  ["bonitaet", "Bonität", "varchar"],
  ["sparte", "Sparte", "varchar"],
  ["tarif_name", "Tarif Name", "varchar"],
  ["strom_tarif", "Strom Tarif", "varchar"],
  ["strom_verbrauch_kwh", "Strom Verbrauch kWh", "double"],
  ["strom_heizungstyp", "Strom Heizungstyp", "varchar"],
  ["strom_zaehlernummer", "Strom Zählernummer", "varchar"],
  ["strom_malo_id", "Strom MaLo-ID", "varchar"],
  ["strom_zaehler_status", "Strom Zähler Status", "varchar"],
  ["gas_tarif", "Gas Tarif", "varchar"],
  ["gas_verbrauch_kwh", "Gas Verbrauch kWh", "double"],
  ["gas_zaehlernummer", "Gas Zählernummer", "varchar"],
  ["gas_malo_id", "Gas MaLo-ID", "varchar"],
  ["gas_zaehler_status", "Gas Zähler Status", "varchar"],
  ["rechner_status", "rechner_status", "varchar"],
  ["lead_quelle", "Lead-Quelle", "varchar"],
];

const PERSON_FIELD_CONFIG = [
  ["whatsapp_status", "WhatsApp Status", "varchar"],
  ["letzter_kontaktversuch", "Letzter Kontaktversuch", "varchar"],
];

async function buildCustomFields(entity, config, values) {
  const out = {};
  for (const [payloadKey, fieldName, fieldType] of config) {
    const value = values[payloadKey];
    if (value === undefined || value === null || value === "") continue;
    const key = await ensureField(entity, fieldName, fieldType);
    out[key] = typeof value === "boolean" ? (value ? "ja" : "nein") : value;
  }
  return out;
}

/* ---------------------------------------------------------
   Person + Deal finden/anlegen
--------------------------------------------------------- */
async function findPersonByPhone(telefon) {
  if (!telefon) return null;
  const target = normalizePhone(telefon);
  const searchTerm = phoneSearchTerm(telefon);
  if (searchTerm.length < 6) return null; // zu kurz für eine sinnvolle Suche

  const result = await pd(`/persons/search?term=${encodeURIComponent(searchTerm)}&fields=phone&exact_match=false`);
  const items = result?.items || [];

  // Pipedrives Fuzzy-Suche kann Nachbartreffer liefern. Deshalb wird jeder
  // Treffer zusätzlich anhand seiner hinterlegten Telefonnummer(n) —
  // normalisiert — GENAU gegen die Zielnummer verifiziert, bevor er als
  // "derselbe Kontakt" gilt.
  for (const it of items) {
    const person = it.item;
    const phones = person.phones && person.phones.length
      ? person.phones
      : (person.phone ? [{ value: person.phone }] : []);
    if (phones.some((p) => normalizePhone(p.value) === target)) {
      return person.id;
    }
  }

  // Manche Pipedrive-Pläne liefern in der Suchergebnis-Kurzform keine
  // Telefonnummern mit (nur id/name). In dem Fall die Person einzeln laden
  // und dort verifizieren, statt den ersten Treffer blind zu übernehmen.
  for (const it of items) {
    const personId = it.item?.id;
    if (!personId) continue;
    try {
      const full = await pd(`/persons/${personId}`);
      const phones = full.phones || (full.phone ? [{ value: full.phone }] : []);
      if (phones.some((p) => normalizePhone(p.value) === target)) {
        return personId;
      }
    } catch {
      // ignorieren, nächsten Treffer prüfen
    }
  }

  return null;
}

async function findOpenDealForPerson(personId) {
  if (!personId) return null;
  const deals = await pd(`/persons/${personId}/deals?status=open`);
  const inPipeline = (deals || []).find((d) => d.pipeline_id === PIPELINE_ID);
  return inPipeline ? inPipeline.id : null;
}

async function upsertPerson(payload) {
  const name = [payload.vorname, payload.nachname].filter(Boolean).join(" ") || payload.telefon || "Rechner-Lead";
  const customFields = await buildCustomFields("person", PERSON_FIELD_CONFIG, payload);
  const normalizedPhone = normalizePhone(payload.telefon);

  const body = {
    name,
    ...(payload.email ? { email: [{ value: payload.email, primary: true, label: "work" }] } : {}),
    // Telefonnummer wird normalisiert gespeichert, damit künftige Abgleiche
    // (auch aus anderen Quellen) konsistent funktionieren.
    ...(normalizedPhone ? { phone: [{ value: normalizedPhone, primary: true, label: "mobile" }] } : {}),
    ...customFields,
  };

  const existingId = await findPersonByPhone(payload.telefon);
  if (existingId) {
    return pd(`/persons/${existingId}`, { method: "PUT", body: JSON.stringify(body) });
  }
  return pd("/persons", { method: "POST", body: JSON.stringify(body) });
}

async function upsertDeal(payload, personId) {
  const name = [payload.vorname, payload.nachname].filter(Boolean).join(" ") || payload.telefon || "Rechner-Lead";
  const sparteLabel = payload.sparte === "gas" ? "Gas" : "Strom";
  const title = `${name} – ${sparteLabel} – ${payload.plz || ""}`.trim();
  const customFields = await buildCustomFields("deal", DEAL_FIELD_CONFIG, payload);

  // Feste Deal-Felder "Telefonnummer" / "Mail" zusätzlich befüllen (siehe
  // FIXED_DEAL_FIELD_KEYS oben) — läuft bei JEDEM Aufruf mit, also sowohl
  // beim Neuanlegen als auch beim Aktualisieren eines bestehenden Deals.
  // Sicherheitsnetz: Keys nur senden, wenn sie aktuell in Pipedrive
  // existieren. Sonst würde ein in Pipedrive gelöschtes Feld die ganze
  // /deals-Anfrage mit ERR_SCHEMA_VALIDATION_FAILED abbrechen.
  const dealFieldMap = await getFieldMap("deal");
  const validKeys = new Set(dealFieldMap.values());

  const normalizedPhone = normalizePhone(payload.telefon);
  const fixedTelefonKey = FIXED_DEAL_FIELD_KEYS.telefon;
  const fixedEmailKey = FIXED_DEAL_FIELD_KEYS.email;

  if (normalizedPhone && fixedTelefonKey && validKeys.has(fixedTelefonKey)) {
    customFields[fixedTelefonKey] = normalizedPhone;
  }
  if (payload.email && fixedEmailKey && validKeys.has(fixedEmailKey)) {
    customFields[fixedEmailKey] = payload.email;
  }

  const body = {
    title,
    person_id: personId,
    pipeline_id: PIPELINE_ID,
    stage_id: STAGE_ID,
    ...customFields,
  };

  const existingDealId = await findOpenDealForPerson(personId);
  if (existingDealId) {
    return pd(`/deals/${existingDealId}`, { method: "PUT", body: JSON.stringify(body) });
  }
  return pd("/deals", { method: "POST", body: JSON.stringify(body) });
}

/* ---------------------------------------------------------
   Datei-Uploads (Dokumente + Zählerfoto) als echte Pipedrive-
   Anhänge auf dem Deal, statt Base64 in ein Textfeld zu quetschen.
--------------------------------------------------------- */
function base64ToBlob(dataUrl, fallbackMime) {
  const match = /^data:(.+);base64,(.*)$/.exec(dataUrl || "");
  const mime = match ? match[1] : fallbackMime || "application/octet-stream";
  const base64 = match ? match[2] : dataUrl;
  const buffer = Buffer.from(base64, "base64");
  return new Blob([buffer], { type: mime });
}

async function uploadFileToDeal(dealId, dataUrl, filename, mime) {
  if (!dataUrl || !dealId) return;
  try {
    const blob = base64ToBlob(dataUrl, mime);
    const form = new FormData();
    form.append("file", blob, filename || "upload");
    form.append("deal_id", String(dealId));

    const url = `${baseUrl()}/files?api_token=${PIPEDRIVE_TOKEN}`;
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) {
      console.error("Datei-Upload fehlgeschlagen:", filename, res.status);
    }
  } catch (e) {
    console.error("Datei-Upload-Fehler:", filename, e);
  }
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
    const payload = req.body || {};

    const person = await upsertPerson(payload);
    const deal = await upsertDeal(payload, person.id);

    // Dateien erst NACH dem Deal hochladen, da wir die deal_id brauchen
    if (Array.isArray(payload.dokumente)) {
      for (const doc of payload.dokumente) {
        await uploadFileToDeal(deal.id, doc.base64, doc.dateiname, doc.mimetype);
      }
    }
    if (payload.zaehler_foto) {
      await uploadFileToDeal(deal.id, payload.zaehler_foto, payload.zaehler_foto_dateiname, payload.zaehler_foto_mimetype);
    }

    return res.status(200).json({ ok: true, personId: person.id, dealId: deal.id });
  } catch (err) {
    console.error("submit-lead Fehler:", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
