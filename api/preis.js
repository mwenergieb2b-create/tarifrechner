// /api/preis.js
// Server-seitige Tarif-Empfehlung + Preis-Lookup für den Tarifrechner.
// Läuft als Vercel Serverless Function (ES-Module, da "type": "module").
//
// Empfehlungslogik (immer genau EIN Tarif, je nach Bonität + Sparte):
//   Strom, ohne Bonitätsprüfung -> meinSTADT Strom (SB)  [Stadtwerke Krefeld]
//   Strom, mit Bonitätsprüfung  -> LichtBlick ÖkoStrom 24
//   Gas,   ohne Bonitätsprüfung -> meinSTADT Gas (SB)    [Stadtwerke Krefeld]
//   Gas,   mit Bonitätsprüfung  -> LichtBlick Gas 24
//
// Die JSON-Tabellen werden mit wörtlichen Pfaden per readFileSync geladen,
// damit Vercel sie beim Build erkennt (plus includeFiles in vercel.json).
//
// Aufruf:  /api/preis?gruppe=bonitaetsfrei&sparte=strom&plz=60320&verbrauch=3500
// Antwort: { found, tarif, tarifName, tarifSub, badge, grundpreis, arbeitspreis }
//   oder   { found: false, tarif, ... }  (PLZ nicht in der Tabelle -> Preis individuell)

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const meinstadt_strom = JSON.parse(readFileSync(join(__dirname, "data/meinstadt_strom.json"), "utf-8"));
const meinstadt_gas = JSON.parse(readFileSync(join(__dirname, "data/meinstadt_gas.json"), "utf-8"));
const lichtblick_strom = JSON.parse(readFileSync(join(__dirname, "data/lichtblick_strom.json"), "utf-8"));
const lichtblick_gas = JSON.parse(readFileSync(join(__dirname, "data/lichtblick_gas.json"), "utf-8"));

const TABLES = { meinstadt_strom, meinstadt_gas, lichtblick_strom, lichtblick_gas };

// tarifName    = vollständiger interner Name (geht in den Payload / Pipedrive)
// anzeigeName  = was der Kunde sieht (bewusst OHNE Anbieternamen)
const TARIF_INFO = {
  meinstadt_strom: {
    tarifName: "meinSTADT Strom (SB)",
    anzeigeName: "Strom SB",
    tarifSub: "Bonitätsfreier Stromtarif, deutschlandweit verfügbar",
    badge: "Keine Bonitätsprüfung",
    laufzeit: "24 Monate Laufzeit",
    preisgarantie: "Preisgarantie",
  },
  meinstadt_gas: {
    tarifName: "meinSTADT Gas (SB)",
    anzeigeName: "Gas SB",
    tarifSub: "Bonitätsfreier Gastarif, deutschlandweit verfügbar",
    badge: "Keine Bonitätsprüfung",
    laufzeit: "24 Monate Laufzeit",
    preisgarantie: "Preisgarantie",
  },
  lichtblick_strom: {
    tarifName: "LichtBlick ÖkoStrom 24",
    anzeigeName: "ÖkoStrom 24",
    tarifSub: "Ökostromtarif, bundesweit verfügbar",
    badge: "Bonitätsprüfung durch Anbieter üblich",
    laufzeit: "24 Monate Laufzeit",
    preisgarantie: "Preisgarantie",
  },
  lichtblick_gas: {
    tarifName: "LichtBlick Gas 24",
    anzeigeName: "Gas 24",
    tarifSub: "Gastarif, bundesweit verfügbar",
    badge: "Bonitätsprüfung durch Anbieter üblich",
    laufzeit: "24 Monate Laufzeit",
    preisgarantie: "Preisgarantie",
  },
};

// Bestimmt den EINEN Tarif für die Situation des Kunden.
// Es gibt pro Bonitäts-Gruppe genau einen Anbieter je Sparte, keine
// Verbrauchsstaffelung mehr.
function resolveTarif(gruppe, sparte) {
  if (sparte === "strom") {
    return gruppe === "bonitaetsfrei" ? "meinstadt_strom" : "lichtblick_strom";
  }
  // sparte === "gas"
  return gruppe === "bonitaetsfrei" ? "meinstadt_gas" : "lichtblick_gas";
}

function lookupBand(table, plz, verbrauch) {
  const bands = table[plz];
  if (!bands || bands.length === 0) return null;
  const v = Number(verbrauch) || 0;
  for (const [von, bis, grund, arbeit] of bands) {
    if (v >= von && v <= bis) return { grund, arbeit };
  }
  // Verbrauch außerhalb aller Bänder -> höchstes Band als Näherung
  const [, , grund, arbeit] = bands[bands.length - 1];
  return { grund, arbeit };
}

export default function handler(req, res) {
  try {
    const { gruppe, sparte, plz, verbrauch } = req.query;

    if (!plz || !/^\d{5}$/.test(plz)) {
      res.status(400).json({ found: false, error: "Ungültige oder fehlende PLZ" });
      return;
    }
    if (gruppe !== "bonitaetsfrei" && gruppe !== "normal") {
      res.status(400).json({ found: false, error: "gruppe muss 'bonitaetsfrei' oder 'normal' sein" });
      return;
    }
    if (sparte !== "strom" && sparte !== "gas") {
      res.status(400).json({ found: false, error: "sparte muss 'strom' oder 'gas' sein" });
      return;
    }

    const resolved = resolveTarif(gruppe, sparte);
    const table = TABLES[resolved];
    const info = TARIF_INFO[resolved];
    const result = lookupBand(table, plz, verbrauch);

    if (!result) {
      // PLZ nicht in der Tabelle -> Tarif trotzdem nennen, Preis individuell
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.status(200).json({ found: false, tarif: resolved, ...info });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.status(200).json({
      found: true,
      tarif: resolved,
      ...info,
      grundpreis: result.grund,
      arbeitspreis: result.arbeit,
    });
  } catch (err) {
    console.error("Fehler in /api/preis:", err);
    res.status(500).json({ found: false, error: "Interner Fehler bei der Preisermittlung" });
  }
}
