// /api/preis.js
// Server-seitige Tarif-Empfehlung + Preis-Lookup für den Tarifrechner.
// Läuft als Vercel Serverless Function (ES-Module, da "type": "module").
//
// Empfehlungslogik (immer genau EIN Tarif):
//   Strom, mit Bonitätsprüfung ok        -> ÖkoStrom24 Pur (Vattenfall)
//   Strom, ohne Bonitätsprüfung, >=1500  -> Plan B Energie NEO T24
//   Strom, ohne Bonitätsprüfung, 500-1499-> GENO Strom Natur Direkt
//   Strom, ohne Bonitätsprüfung, <500    -> individuelle Prüfung
//   Gas,   mit Bonitätsprüfung ok        -> Easy24 Gas PUR (Vattenfall)
//   Gas,   ohne Bonitätsprüfung, >=5000  -> ELE erdgasFair
//   Gas,   ohne Bonitätsprüfung, <5000   -> individuelle Prüfung
//
// Die JSON-Tabellen werden mit wörtlichen Pfaden per readFileSync geladen,
// damit Vercel sie beim Build erkennt (plus includeFiles in vercel.json).
//
// Aufruf:  /api/preis?gruppe=bonitaetsfrei&sparte=strom&plz=60320&verbrauch=3500
// Antwort: { found, tarif, tarifName, tarifSub, badge, grundpreis, arbeitspreis }
//   oder   { found: false, individuell: true, grund: "verbrauch_zu_niedrig" }

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const planb_strom = JSON.parse(readFileSync(join(__dirname, "data/planb_strom.json"), "utf-8"));
const geno_strom = JSON.parse(readFileSync(join(__dirname, "data/geno_strom.json"), "utf-8"));
const vattenfall_strom = JSON.parse(readFileSync(join(__dirname, "data/vattenfall_strom.json"), "utf-8"));
const ele_gas = JSON.parse(readFileSync(join(__dirname, "data/ele_gas.json"), "utf-8"));
const vattenfall_gas = JSON.parse(readFileSync(join(__dirname, "data/vattenfall_gas.json"), "utf-8"));

const TABLES = { planb_strom, geno_strom, vattenfall_strom, ele_gas, vattenfall_gas };

const TARIF_INFO = {
  planb_strom: {
    tarifName: "Plan B Energie NEO T24",
    tarifSub: "Bonitätsfreier Stromtarif, deutschlandweit verfügbar",
    badge: "Keine Bonitätsprüfung",
  },
  geno_strom: {
    tarifName: "GENO Strom Natur Direkt",
    tarifSub: "Bonitätsfreier Ökostromtarif für kleinere Verbräuche",
    badge: "Keine Bonitätsprüfung",
  },
  vattenfall_strom: {
    tarifName: "ÖkoStrom24 Pur",
    tarifSub: "Bundesweit verfügbarer Ökostromtarif",
    badge: "Bonitätsprüfung durch Anbieter üblich",
  },
  ele_gas: {
    tarifName: "ELE erdgasFair",
    tarifSub: "Bonitätsfreier Gastarif (ab 5.000 kWh Jahresverbrauch)",
    badge: "Keine Bonitätsprüfung",
  },
  vattenfall_gas: {
    tarifName: "Easy24 Gas PUR",
    tarifSub: "Bundesweit verfügbarer Gastarif",
    badge: "Bonitätsprüfung durch Anbieter üblich",
  },
};

// Bestimmt den EINEN empfohlenen Tarif für die Situation des Kunden.
// Rückgabe: Tabellenname oder { individuell: true, grund: string }
function resolveTarif(gruppe, sparte, verbrauch) {
  const v = Number(verbrauch) || 0;

  if (sparte === "strom") {
    if (gruppe === "normal") return "vattenfall_strom";
    if (v >= 1500) return "planb_strom";
    if (v >= 500) return "geno_strom";
    return { individuell: true, grund: "verbrauch_zu_niedrig" };
  }

  // sparte === "gas"
  if (gruppe === "normal") return "vattenfall_gas";
  if (v >= 5000) return "ele_gas";
  return { individuell: true, grund: "verbrauch_zu_niedrig" };
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

    const resolved = resolveTarif(gruppe, sparte, verbrauch);

    // Fall: individuelle Prüfung nötig (Verbrauch unter Mindestgrenze)
    if (typeof resolved === "object" && resolved.individuell) {
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
      res.status(200).json({ found: false, individuell: true, grund: resolved.grund });
      return;
    }

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
