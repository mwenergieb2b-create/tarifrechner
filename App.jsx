import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  Lock,
  MessageCircle,
  ArrowRight,
  ArrowLeft,
  Check,
  Info,
  Camera,
  Share2,
  Home,
  Flame,
  Zap,
  UserCheck,
  X,
  AlertTriangle,
} from "lucide-react";
import { usePreis } from "./usePreis";

/* ---------------------------------------------------------
   Design-Tokens — identisch zur Website kwh-beratung.de
--------------------------------------------------------- */
const c = {
  blue: "#1473EB",
  blueDark: "#0F5BC0",
  blueDeep: "#0E2A54",
  blueTint: "#EAF2FE",
  ink: "#16181D",
  inkSoft: "#4C525C",
  green: "#1FA463",
  greenDark: "#157A4A",
  greenTint: "#E7F6EE",
  red: "#C6494B",
  redTint: "#FCF1EE",
  bg: "#F5F8FC",
  surface: "#FFFFFF",
  line: "#E2E7EF",
  stone: "#8A93A1",
};

const fontDisplay = "'Manrope', -apple-system, sans-serif";
const fontBody = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const WA_LINK =
  "https://api.whatsapp.com/send/?phone=4915114168093&text=Hallo%2C%20ich%20f%C3%BClle%20gerade%20den%20Tarifrechner%20aus%20und%20habe%20eine%20Frage.";

/* ---------------------------------------------------------
   Schrittfolgen
   Kernidee: Kontaktdaten kommen DIREKT nach der Tarif-
   empfehlung (höchste Motivation) — damit ist der Lead
   gesichert, bevor die aufwendigeren Felder kommen.
--------------------------------------------------------- */
const STEPS_FIRST = ["basics", "wechselweg", "empfehlung", "kontakt", "dokumente", "vertrag", "bankdaten", "zaehler"];
const STEPS_SECOND = ["basics", "wechselweg", "empfehlung", "dokumente", "bankdaten", "zaehler"];
const STEPS_INDIVIDUELL_FIRST = ["basics", "wechselweg", "empfehlung", "kontakt", "dokumente"];
const STEPS_INDIVIDUELL_SECOND = ["basics", "wechselweg", "empfehlung", "dokumente"];

const STEP_TITLES = {
  basics: "Verbrauch",
  wechselweg: "Wechselweg",
  empfehlung: "Ihr Tarif",
  kontakt: "Kontakt",
  dokumente: "Unterlagen",
  vertrag: "Vertragsdaten",
  bankdaten: "Zahlung",
  zaehler: "Zähler",
};

const HOUSEHOLD_PRESETS = [
  { label: "1 Person", kwh: 1500 },
  { label: "2 Personen", kwh: 2400 },
  { label: "3 Personen", kwh: 3400 },
  { label: "4+ Personen", kwh: 4400 },
];

const GAS_PRESETS = [
  { label: "1–2 Zimmer", kwh: 6000 },
  { label: "3–4 Zimmer", kwh: 10000 },
  { label: "Haus, freistehend", kwh: 18000 },
  { label: "Großes Haus", kwh: 25000 },
];

/* ---------------------------------------------------------
   Validierung
--------------------------------------------------------- */
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40}$/;

const validators = {
  vorname: (v) => NAME_RE.test(v.trim()),
  nachname: (v) => NAME_RE.test(v.trim()),
  ort: (v) => NAME_RE.test(v.trim()),
  strasse: (v) => /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]{2,60}$/.test(v.trim()) && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v),
  hausnummer: (v) => /^\d{1,4}\s?[a-zA-Z]?$/.test(v.trim()),
  plz: (v) => /^\d{5}$/.test(v.trim()),
  telefon: (v) => /^\+?\d{7,15}$/.test(v.replace(/[\s()\/-]/g, "")),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  einzugsdatum: (v) => {
    if (!v) return false;
    const d = new Date(v + "T00:00:00");
    if (isNaN(d.getTime())) return false;
    return d.getTime() >= minEinzugsdatum().setHours(0, 0, 0, 0);
  },
  kundennummerAlt: (v) => v.trim().length > 1,
  geburtsdatum: (v) => {
    if (!v) return false;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    if (d > now) return false;
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 18 && age <= 110;
  },
};

const errorText = {
  vorname: "Bitte nur Buchstaben verwenden",
  nachname: "Bitte nur Buchstaben verwenden",
  ort: "Bitte einen gültigen Ort eingeben",
  strasse: "Bitte eine gültige Straße eingeben",
  hausnummer: "Bitte eine gültige Hausnummer eingeben, z. B. 12 oder 12a",
  plz: "Bitte eine gültige 5-stellige Postleitzahl eingeben",
  geburtsdatum: "Bitte ein gültiges Geburtsdatum eingeben (mind. 18 Jahre)",
  telefon: "Bitte eine gültige Handynummer eingeben",
  email: "Bitte eine gültige E-Mail-Adresse eingeben",
  einzugsdatum: "Bitte ein Datum ab dem frühestmöglichen Termin wählen",
  kundennummerAlt: "Bitte die Kundennummer Ihres aktuellen Anbieters eingeben",
};

function isValidIBAN(raw) {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());
  let rem = 0;
  for (let i = 0; i < numeric.length; i++) rem = (rem * 10 + Number(numeric[i])) % 97;
  return rem === 1;
}

function formatIBAN(v) {
  return v
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

/* ---------------------------------------------------------
   UI-Bausteine
--------------------------------------------------------- */
function ProgressBar({ fraction, current, total, label }) {
  return (
    <div className="w-full" aria-label={`Schritt ${current} von ${total}: ${label}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold" style={{ fontFamily: fontDisplay, color: c.blue }}>
          {label}
        </span>
        <span className="text-[11px] font-semibold" style={{ fontFamily: fontDisplay, color: c.stone }}>
          Schritt {current} von {total}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: c.line }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.round(fraction * 100)}%`, background: c.blue, transition: "width 0.4s ease" }}
        />
      </div>
    </div>
  );
}

function Badge({ tone = "blue", children }) {
  const styles =
    tone === "blue"
      ? { background: c.blueTint, color: c.blue }
      : tone === "green"
      ? { background: c.greenTint, color: c.greenDark }
      : { background: c.line, color: c.inkSoft };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ ...styles, fontFamily: fontDisplay }}>
      {children}
    </span>
  );
}

function InfoNote({ children, tone = "blue" }) {
  const bg = tone === "blue" ? c.blueTint : tone === "warn" ? c.redTint : c.greenTint;
  const iconColor = tone === "blue" ? c.blue : tone === "warn" ? c.red : c.greenDark;
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className="flex gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed text-left" style={{ background: bg, color: c.ink }}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color: iconColor }} />
      <p className="m-0">{children}</p>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1.5" style={{ color: c.ink, fontFamily: fontDisplay }}>
        {label}
      </span>
      {children}
      {error ? (
        <span className="block text-xs mt-1" style={{ color: c.red }}>
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs mt-1" style={{ color: c.stone }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function TextInput({ isError, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none transition-colors"
      style={{
        background: c.surface,
        border: `1.5px solid ${isError ? c.red : focused ? c.blue : c.line}`,
        color: c.ink,
        fontFamily: fontBody,
        boxShadow: focused ? `0 0 0 3px ${isError ? c.redTint : c.blueTint}` : "none",
      }}
    />
  );
}

function StepShell({ eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="step-enter">
      <div className="text-xs font-extrabold tracking-widest uppercase mb-2" style={{ color: c.blue, fontFamily: fontDisplay }}>
        {eyebrow}
      </div>
      <h2 className="text-2xl sm:text-[27px] leading-tight mb-2 font-extrabold" style={{ fontFamily: fontDisplay, color: c.ink }}>
        {title}
      </h2>
      {subtitle && (
        <p className="text-[15px] leading-relaxed mb-4" style={{ color: c.inkSoft }}>
          {subtitle}
        </p>
      )}
      <div className="space-y-3.5">{children}</div>
      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel = "Weiter", disabled, loading }) {
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button
          onClick={onBack}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full px-4 py-3 text-sm font-bold"
          style={{ color: c.inkSoft, fontFamily: fontDisplay, opacity: loading ? 0.5 : 1 }}
        >
          <ArrowLeft size={16} /> Zurück
        </button>
      )}
      <button
        onClick={onNext}
        disabled={disabled || loading}
        className="flex-1 flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-extrabold transition-all"
        style={{
          background: disabled || loading ? c.line : c.blue,
          color: disabled || loading ? c.stone : "#fff",
          cursor: disabled || loading ? "not-allowed" : "pointer",
          fontFamily: fontDisplay,
          boxShadow: disabled || loading ? "none" : "0 6px 20px rgba(20,115,235,0.34)",
        }}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" /> Wird gesendet…
          </>
        ) : (
          <>
            {nextLabel} <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}

function ToggleCard({ selected, onClick, title, sub, badge, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left rounded-2xl px-4 py-4 transition-colors flex items-start justify-between gap-3"
      style={{
        border: `1.5px solid ${selected ? c.blue : c.line}`,
        background: selected ? c.blueTint : c.surface,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-bold" style={{ color: c.ink, fontFamily: fontDisplay }}>
            {title}
          </span>
          {badge && (
            <span className="text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5" style={{ background: c.greenTint, color: c.greenDark, fontFamily: fontDisplay }}>
              {badge}
            </span>
          )}
        </div>
        {sub && (
          <div className="text-xs mt-1 leading-relaxed" style={{ color: c.inkSoft }}>
            {sub}
          </div>
        )}
      </div>
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ border: `2px solid ${selected ? c.blue : c.line}`, background: selected ? c.blue : "transparent" }}
      >
        {selected && <Check size={12} color="#fff" strokeWidth={3.5} />}
      </div>
    </button>
  );
}

function CheckboxRow({ checked, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: checked ? c.blueTint : c.surface, border: `1.5px solid ${checked ? c.blue : c.line}` }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: checked ? c.blue : c.surface, border: `1.5px solid ${checked ? c.blue : c.line}` }}
      >
        {checked && <Check size={13} color="#fff" />}
      </div>
      <span className="text-sm" style={{ color: c.ink }}>
        {children}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------
   n8n-Anbindung
--------------------------------------------------------- */
// TODO Max: Fortschritts-Webhook eintragen, sobald der n8n-Workflow existiert
const N8N_PROGRESS_URL = "https://kwh-beratung.app.n8n.cloud/webhook/HIER-PROGRESS-WEBHOOK-EINTRAGEN";
const N8N_WEBHOOK_URL = "https://kwh-beratung.app.n8n.cloud/webhook/b4438f04-ad90-4dc8-9281-b62536cf532a";

const STEP_LABELS = {
  geoeffnet: "Link geöffnet, noch nicht gestartet",
  basics: "Verbrauch eingegeben",
  wechselweg: "Wechselweg gewählt",
  empfehlung: "Tarif-Empfehlung gesehen",
  kontakt: "Kontaktdaten eingegeben",
  vertrag: "Vertragsdaten eingegeben",
  bankdaten: "Zahlungsart gewählt",
  zaehler: "Zählerdaten eingegeben",
};

function sendProgressPing(data, step) {
  const label = STEP_LABELS[step];
  if (!label || !data.telefon || N8N_PROGRESS_URL.includes("HIER-PROGRESS")) return;
  fetch(N8N_PROGRESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telefon: data.telefon, sparte: data.sparte, rechner_status: label }),
  }).catch(() => {});
}

function minEinzugsdatum() {
  let d = new Date();
  let added = 0;
  while (added < 5) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}
function minEinzugsdatumStr() {
  return minEinzugsdatum().toISOString().slice(0, 10);
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------
   Payload — Feldnamen bleiben KOMPATIBEL zum bestehenden
   n8n/Pipedrive-Workflow.
   Neu: submission_typ ("lead_vorab" | "vollstaendig") —
   nach dem Kontakt-Schritt wird der Lead sofort gesichert,
   der finale Submit aktualisiert denselben Deal (Suche per
   Telefonnummer im n8n-Workflow).
--------------------------------------------------------- */
function buildPayload(data, submissionTyp) {
  const dokumente =
    data.dokumentUpload && data.dokumentUpload.length
      ? data.dokumentUpload.map((f) => ({ dateiname: f.name, mimetype: f.mimetype, base64: f.base64 }))
      : [];

  const hasDocs = !!(data.dokumentUpload && data.dokumentUpload.length);

  const zaehlernummerValue = data.zaehlernummer && data.zaehlernummer.trim()
    ? data.zaehlernummer
    : hasDocs
    ? "siehe Dokument-Upload"
    : "";
  const maloIdValue = data.maloId && data.maloId.trim()
    ? data.maloId
    : hasDocs
    ? "siehe Dokument-Upload"
    : "nicht angegeben";

  const base = {
    submission_typ: submissionTyp,
    telefon: data.telefon,
    email: data.email,
    vorname: data.vorname || (hasDocs ? "siehe Dokument-Upload" : ""),
    nachname: data.nachname || (hasDocs ? "siehe Dokument-Upload" : ""),
    geburtsdatum: data.geburtsdatum,
    strasse: hasDocs && !data.strasse ? "siehe Dokument-Upload" : data.strasse,
    hausnummer: hasDocs && !data.hausnummer ? "-" : data.hausnummer,
    plz: data.plz,
    ort: hasDocs && !data.ort ? "siehe Dokument-Upload" : data.ort,
    neueinzug: data.neueinzug,
    einzugsdatum: data.neueinzug ? data.einzugsdatum : "",
    kundennummer_alt: data.neueinzug ? "" : hasDocs && !data.kundennummerAlt ? "siehe Dokument-Upload" : data.kundennummerAlt,
    dokumente: dokumente,
    zaehler_foto: data.zaehlerFoto ? data.zaehlerFoto.base64 : "",
    zaehler_foto_dateiname: data.zaehlerFoto ? data.zaehlerFoto.name : "",
    zaehler_foto_mimetype: data.zaehlerFoto ? data.zaehlerFoto.mimetype : "",
    aktueller_anbieter: data.neueinzug ? "" : data.aktuellerAnbieter,
    iban: data.zahlungsart === "selbstzahler" || data.bankdatenSpaeter ? "" : data.iban.replace(/\s+/g, ""),
    iban_status: data.zahlungsart === "selbstzahler" ? "selbstzahler" : data.bankdatenSpaeter ? "folgt_spaeter" : data.iban ? "vorhanden" : "offen",
    bonitaet: data.bonitaet,
    sparte: data.sparte,
    tarif_name: data.tarifName || "",
  };

  const zaehlerStatus = data.zaehlerSpaeter
    ? "folgt_per_whatsapp"
    : data.zaehlerFoto
    ? "foto_hochgeladen"
    : data.zaehlernummer && data.zaehlernummer.trim()
    ? "nummer_eingegeben"
    : hasDocs
    ? "siehe_dokument_upload"
    : "offen";

  const sparteFields =
    data.sparte === "strom"
      ? {
          strom_tarif: data.tarif,
          strom_verbrauch_kwh: data.verbrauch,
          strom_heizungstyp: data.heizungstyp,
          strom_zaehlernummer: zaehlernummerValue,
          strom_malo_id: maloIdValue,
          strom_zaehler_status: zaehlerStatus,
        }
      : {
          gas_tarif: data.tarif,
          gas_verbrauch_kwh: data.verbrauch,
          gas_zaehlernummer: zaehlernummerValue,
          gas_malo_id: maloIdValue,
          gas_zaehler_status: zaehlerStatus,
        };

  return { ...base, ...sparteFields };
}

async function submitToPipedrive(data, submissionTyp) {
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(data, submissionTyp)),
    });
    return res.ok;
  } catch (e) {
    console.error("Übermittlung fehlgeschlagen:", e);
    return false;
  }
}

const initialData = {
  sparte: "strom",
  telefon: "",
  plz: "",
  verbrauch: 3400,
  heizungstyp: "normal",
  bonitaet: true,
  tarif: "bonitaetsfrei",
  tarifName: "",
  dokumentUpload: null,
  dokumentSpaeter: false,
  neueinzug: false,
  einzugsdatum: "",
  kundennummerAlt: "",
  aktuellerAnbieter: "",
  vorname: "",
  email: "",
  nachname: "",
  geburtsdatum: "",
  strasse: "",
  hausnummer: "",
  ort: "",
  iban: "",
  zahlungsart: "lastschrift",
  bankdatenSpaeter: false,
  zaehlernummer: "",
  maloId: "",
  zaehlerFoto: null,
  zaehlerSpaeter: false,
};

export default function TarifRechner() {
  const [step, setStep] = useState("basics");
  const [secondPass, setSecondPass] = useState(false);
  const [data, setData] = useState(initialData);
  const [touched, setTouched] = useState({});
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [leadSecured, setLeadSecured] = useState(false);
  const [telefonFromLink, setTelefonFromLink] = useState(false);
  const [showHeizungChooser, setShowHeizungChooser] = useState(false);
  const [completedSpartes, setCompletedSpartes] = useState([]);
  const [heizungAbschluss, setHeizungAbschluss] = useState(null);

  /* Vorbefüllung aus dem Link */
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const patch = {};
      ["plz", "vorname", "nachname", "telefon", "email"].forEach((k) => {
        const v = params.get(k);
        if (v) patch[k] = v;
      });
      if (Object.keys(patch).length) setData((d) => ({ ...d, ...patch }));
      if (patch.telefon) {
        setTelefonFromLink(true);
        sendProgressPing({ ...initialData, ...patch }, "geoeffnet");
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (step !== "abschluss") sendProgressPing(data, step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const gruppe = data.bonitaet ? "bonitaetsfrei" : "normal";
  const preis = usePreis(gruppe, data.sparte, data.plz, data.verbrauch);
  const istIndividuell = preis.individuell;

  const activeSteps = useMemo(() => {
    if (istIndividuell) return secondPass ? STEPS_INDIVIDUELL_SECOND : STEPS_INDIVIDUELL_FIRST;
    return secondPass ? STEPS_SECOND : STEPS_FIRST;
  }, [istIndividuell, secondPass]);

  const stepIndex = activeSteps.indexOf(step);
  const fraction = step === "abschluss" ? 1 : (stepIndex + 1) / activeSteps.length;

  useEffect(() => {
    if (istIndividuell) {
      setData((d) => ({ ...d, tarif: "individuell", tarifName: "Individuelle Prüfung" }));
    } else if (preis.tarifName) {
      setData((d) => ({ ...d, tarif: gruppe, tarifName: preis.tarifName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preis.tarifName, istIndividuell, gruppe]);

  function update(patch) {
    setData((d) => ({ ...d, ...patch }));
  }
  function touch(name) {
    setTouched((t) => ({ ...t, [name]: true }));
  }
  function goTo(s) {
    setSubmitError(false);
    setStep(s);
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  async function next() {
    const i = activeSteps.indexOf(step);

    // Lead-Sicherung TEMPORÄR DEAKTIVIERT:
    // Der Lead-Vorab-Submit wurde ausgebaut, weil er zusammen mit dem
    // finalen "vollstaendig"-Submit zwei Deals in Pipedrive angelegt hat
    // (Race Condition: der zweite Request kam bei Pipedrive an, bevor
    // der erste Deal indexiert war). Für den Livegang reicht der finale
    // Submit am Ende. Später wieder aktivieren, sobald in n8n ein
    // Wait-Node den zweiten Durchlauf verzögert.
    // if (step === "kontakt" && !leadSecured && !secondPass) {
    //   setLeadSecured(true);
    //   submitToPipedrive(data, "lead_vorab").catch(() => {});
    // }

    if (i < activeSteps.length - 1) return goTo(activeSteps[i + 1]);

    // Finaler Submit — mit echter Fehlerbehandlung:
    // Bei Fehlschlag KEINE falsche Erfolgsmeldung, sondern
    // Fehlerhinweis mit Retry + WhatsApp-Eskalation.
    setSending(true);
    setSubmitError(false);
    const ok = await submitToPipedrive(data, "vollstaendig");
    setSending(false);
    if (!ok) {
      setSubmitError(true);
      return;
    }
    setCompletedSpartes((s) => (s.includes(data.sparte) ? s : [...s, data.sparte]));
    return goTo("abschluss");
  }

  function back() {
    const i = activeSteps.indexOf(step);
    if (i <= 0) return;
    return goTo(activeSteps[i - 1]);
  }

  function startGasFlow() {
    setSecondPass(true);
    update({
      sparte: "gas",
      verbrauch: 10000,
      zaehlernummer: "",
      zaehlerFoto: null,
      zaehlerSpaeter: false,
      dokumentUpload: null,
      dokumentSpaeter: false,
    });
    setStep("basics");
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }

  async function startHeizungFlow(type) {
    const merged = {
      ...data,
      heizungstyp: type,
      sparte: "strom",
      tarif: "individuell",
      tarifName: type === "waermepumpe" ? "Wärmepumpe (individuell)" : "Nachtspeicher (individuell)",
    };
    update({ heizungstyp: type, sparte: "strom", tarif: "individuell" });
    setSending(true);
    await submitToPipedrive(merged, "vollstaendig");
    setSending(false);
    setShowHeizungChooser(false);
    setHeizungAbschluss(type);
    goTo("abschluss");
  }

  async function handleShare() {
    const shareData = {
      title: "Energie-Tarifcheck – kWh Beratung",
      text: "Ich hab gerade meinen Tarif geprüft – lohnt sich, auch mal reinzuschauen:",
      url: "https://rechner.kwh-beratung.de",
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (e) {}
    try {
      await navigator.clipboard.writeText(shareData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  }

  function removeDokument(idx) {
    const rest = (data.dokumentUpload || []).filter((_, i) => i !== idx);
    update({ dokumentUpload: rest.length ? rest : null });
  }

  const householdPresets = data.sparte === "gas" ? GAS_PRESETS : HOUSEHOLD_PRESETS;

  const canNext = useMemo(() => {
    switch (step) {
      case "basics":
        return validators.plz(data.plz) && Number(data.verbrauch) > 0;
      case "wechselweg":
        return true;
      case "empfehlung":
        return !preis.loading;
      case "kontakt":
        return (
          validators.vorname(data.vorname) &&
          validators.nachname(data.nachname) &&
          (telefonFromLink || validators.telefon(data.telefon)) &&
          validators.email(data.email)
        );
      case "dokumente":
        return !!data.dokumentUpload || data.dokumentSpaeter;
      case "vertrag":
        if (data.dokumentUpload) return validators.geburtsdatum(data.geburtsdatum);
        return (
          validators.geburtsdatum(data.geburtsdatum) &&
          validators.strasse(data.strasse) &&
          validators.hausnummer(data.hausnummer) &&
          validators.ort(data.ort) &&
          validators.plz(data.plz) &&
          (data.neueinzug
            ? validators.einzugsdatum(data.einzugsdatum)
            : data.aktuellerAnbieter.trim().length > 1 && validators.kundennummerAlt(data.kundennummerAlt))
        );
      case "bankdaten":
        return data.zahlungsart === "selbstzahler" || data.bankdatenSpaeter || isValidIBAN(data.iban);
      case "zaehler":
        return !!data.dokumentUpload || data.zaehlerSpaeter || data.zaehlernummer.trim() || data.zaehlerFoto;
      default:
        return true;
    }
  }, [step, data, preis.loading, telefonFromLink]);

  const err = (name) => (touched[name] && !validators[name](data[name]) ? errorText[name] : null);
  const isLastStep = stepIndex === activeSteps.length - 1;

  return (
    <div className="min-h-screen w-full" style={{ background: c.bg, fontFamily: fontBody }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap');
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .step-enter { animation: fadeSlideIn 0.4s ease; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { display:inline-block; width:15px; height:15px; border:2.5px solid rgba(255,255,255,0.35); border-top-color:#fff; border-radius:50%; animation: spin 0.7s linear infinite; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.6; }
        @media (prefers-reduced-motion: reduce) { .step-enter { animation: none; } .spinner { animation-duration: 1.4s; } }
      `}</style>

      <div className="max-w-md mx-auto px-5 py-4 sm:py-6">
        {/* Kopfzeile */}
        <div className="flex items-center justify-between mb-2">
          <a href="https://kwh-beratung.de" className="text-[16px] font-extrabold tracking-tight no-underline" style={{ fontFamily: fontDisplay, color: c.ink }}>
            kWh Beratung
          </a>
          <div className="flex items-center gap-2">
            {step !== "abschluss" && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: c.blueTint, color: c.blue, fontFamily: fontDisplay }}>
                {data.sparte === "strom" ? <Zap size={11} /> : <Flame size={11} />}
                {data.sparte === "strom" ? "Strom" : "Gas"}
              </span>
            )}
            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full no-underline"
              style={{ background: c.greenTint, color: c.greenDark, fontFamily: fontDisplay }}
              aria-label="Fragen? Per WhatsApp schreiben"
            >
              <MessageCircle size={11} /> Hilfe
            </a>
          </div>
        </div>

        {step !== "abschluss" && (
          <div className="mb-3">
            <ProgressBar fraction={fraction} current={stepIndex + 1} total={activeSteps.length} label={STEP_TITLES[step] || ""} />
          </div>
        )}

        {/* Vertrauensleiste */}
        <div className="flex items-center justify-between gap-2 mb-4 rounded-2xl px-4 py-2.5" style={{ background: c.surface, border: `1px solid ${c.line}` }}>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: c.inkSoft }}>
            <ShieldCheck size={14} style={{ color: c.green }} />
            Kostenlos
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: c.inkSoft }}>
            <Lock size={14} style={{ color: c.green }} />
            Sicher übertragen
          </div>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: c.inkSoft }}>
            <MessageCircle size={14} style={{ color: c.green }} />
            Persönlich begleitet
          </div>
        </div>

        {/* Hauptkarte */}
        <div
          className="rounded-3xl p-5 sm:p-6"
          style={{ background: c.surface, border: `1px solid ${c.line}`, boxShadow: "0 2px 4px rgba(14,42,84,0.04), 0 14px 36px -16px rgba(14,42,84,0.14)" }}
        >
          {/* ---------- BASICS ---------- */}
          {step === "basics" && (
            <StepShell
              eyebrow={secondPass ? "Ihr Gasverbrauch" : "Ihr Verbrauch"}
              title={secondPass ? "Wo und wie viel Gas verbrauchen Sie?" : "Wo wohnen Sie und wie groß ist Ihr Haushalt?"}
              subtitle="Postleitzahl und Haushaltsgröße reichen für eine erste Einschätzung — Ihr Ergebnis sehen Sie sofort."
              footer={<NavButtons onNext={next} disabled={!canNext} />}
            >
              <Field label="Postleitzahl" error={err("plz")}>
                <TextInput
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={5}
                  placeholder="z. B. 44135"
                  value={data.plz}
                  isError={!!err("plz")}
                  onBlur={() => touch("plz")}
                  onChange={(e) => update({ plz: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                />
              </Field>

              <div>
                <span className="block text-sm font-semibold mb-2" style={{ color: c.ink, fontFamily: fontDisplay }}>
                  {data.sparte === "strom" ? "Wie viele Personen leben in Ihrem Haushalt?" : "Wie groß ist Ihre Wohnfläche / Ihr Haus?"}
                </span>
                <div className="flex flex-wrap gap-2">
                  {householdPresets.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => update({ verbrauch: p.kwh })}
                      className="rounded-full px-3.5 py-2 text-xs font-bold transition-colors"
                      style={{
                        background: Number(data.verbrauch) === p.kwh ? c.blue : c.blueTint,
                        color: Number(data.verbrauch) === p.kwh ? "#fff" : c.blue,
                        fontFamily: fontDisplay,
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Jahresverbrauch (kWh)" hint="Automatisch anhand Ihrer Auswahl gesetzt — bei Bedarf anpassbar.">
                <TextInput inputMode="numeric" value={data.verbrauch} onChange={(e) => update({ verbrauch: e.target.value.replace(/\D/g, "") })} />
              </Field>
            </StepShell>
          )}

          {/* ---------- WECHSELWEG ---------- */}
          {step === "wechselweg" && (
            <StepShell
              eyebrow="Ihr Wechselweg"
              title="Wie möchten Sie wechseln?"
              subtitle="Die meisten Stromanbieter führen bei der Anmeldung eine Schufa-/Bonitätsprüfung durch. Wir bieten beide Wege an:"
              footer={<NavButtons onBack={back} onNext={next} disabled={!canNext} />}
            >
              <ToggleCard
                selected={data.bonitaet}
                onClick={() => update({ bonitaet: true })}
                title="Ohne Bonitätsprüfung wechseln"
                badge="Empfohlen"
                sub="Der Anbieter fragt keine Schufa ab. Keine Ablehnung möglich — die Anmeldung klappt garantiert. Ideal, wenn es früher schon mal Probleme gab oder Sie auf Nummer sicher gehen wollen."
              />
              <ToggleCard
                selected={!data.bonitaet}
                onClick={() => update({ bonitaet: false })}
                title="Regulärer Wechsel mit Bonitätsprüfung"
                sub="Der Anbieter führt die übliche Schufa-Prüfung durch. Bei negativen Einträgen kann die Anmeldung abgelehnt werden — dann müssten wir erneut ansetzen."
              />
              <p className="text-xs leading-relaxed" style={{ color: c.stone }}>
                Beide Wege sind für Sie kostenlos. Unsicher? Wählen Sie „Ohne Bonitätsprüfung" — das erspart im Zweifel allen Beteiligten Aufwand.
              </p>
            </StepShell>
          )}

          {/* ---------- EMPFEHLUNG ---------- */}
          {step === "empfehlung" && (
            <StepShell
              eyebrow="Unsere Empfehlung für Sie"
              title={istIndividuell ? "Ihr Fall braucht einen kurzen persönlichen Blick" : "Dieser Tarif passt zu Ihrer Situation"}
              subtitle={
                istIndividuell
                  ? "Bei Ihrem Jahresverbrauch prüfen wir die beste Option persönlich — das dauert bei uns nur wenige Stunden. Hinterlassen Sie einfach Ihre Kontaktdaten."
                  : "Basierend auf Ihrem Wohnort, Verbrauch und gewähltem Wechselweg."
              }
              footer={<NavButtons onBack={back} onNext={next} nextLabel={istIndividuell ? "Weiter zur Kontaktaufnahme" : "Diesen Tarif anfragen"} disabled={!canNext} />}
            >
              {preis.loading && (
                <div className="rounded-2xl p-5 text-center" style={{ border: `1.5px solid ${c.line}` }}>
                  <p className="text-sm m-0" style={{ color: c.stone }}>
                    Ihr Tarif wird ermittelt…
                  </p>
                </div>
              )}

              {!preis.loading && !istIndividuell && (
                <div className="rounded-2xl p-5" style={{ border: `2px solid ${c.blue}`, background: c.blueTint }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <span className="text-[19px] font-extrabold" style={{ fontFamily: fontDisplay, color: c.ink }}>
                        {preis.anzeigeName || "Ihr passender Tarif"}
                      </span>
                      {preis.tarifSub && (
                        <p className="text-xs mt-1 mb-0" style={{ color: c.inkSoft }}>
                          {preis.tarifSub}
                        </p>
                      )}
                    </div>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: c.blue }}>
                      <UserCheck size={16} color="#fff" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {preis.laufzeit && <Badge tone="blue">{preis.laufzeit}</Badge>}
                    {preis.preisgarantie && <Badge tone="blue">{preis.preisgarantie}</Badge>}
                    {preis.badge && <Badge tone={preis.badge.includes("Keine") ? "green" : "neutral"}>{preis.badge}</Badge>}
                  </div>

                  {preis.found && preis.monatlich != null ? (
                    <>
                      <div className="mt-4">
                        <span className="text-3xl font-extrabold" style={{ fontFamily: fontDisplay, color: c.ink, whiteSpace: "nowrap" }}>
                          ca. {preis.monatlich.toFixed(2).replace(".", ",")}&thinsp;€
                        </span>
                        <span className="text-xs ml-1.5" style={{ color: c.inkSoft }}>
                          / Monat (geschätzter Abschlag)
                        </span>
                      </div>

                      <div className="mt-4 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.75)", border: `1px solid ${c.line}` }}>
                        <div className="flex items-center justify-between px-4 py-2.5 text-sm" style={{ borderBottom: `1px solid ${c.line}` }}>
                          <span style={{ color: c.inkSoft }}>Grundpreis</span>
                          <span className="font-bold" style={{ color: c.ink, fontFamily: fontDisplay }}>
                            {preis.grundpreisMonat.toFixed(2).replace(".", ",")} € / Monat
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                          <span style={{ color: c.inkSoft }}>Arbeitspreis</span>
                          <span className="font-bold" style={{ color: c.ink, fontFamily: fontDisplay }}>
                            {preis.arbeitspreis.toFixed(2).replace(".", ",")} ct / kWh
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm mt-4 mb-0" style={{ color: c.inkSoft }}>
                      Der genaue Preis für Ihre Postleitzahl wird individuell berechnet und Ihnen vor Abschluss transparent mitgeteilt.
                    </p>
                  )}
                </div>
              )}

              {!preis.loading && istIndividuell && (
                <InfoNote>
                  Für Jahresverbräuche {data.sparte === "gas" ? "unter 5.000 kWh (Gas)" : "unter 500 kWh (Strom)"} gibt es aktuell keinen pauschalen bonitätsfreien Tarif — wir finden aber fast immer eine Lösung. Ihr persönlicher Ansprechpartner meldet sich dazu direkt bei Ihnen.
                </InfoNote>
              )}

              {!istIndividuell && (
                <p className="text-xs leading-relaxed" style={{ color: c.stone }}>
                  Berechnung auf Basis Ihres geschätzten Jahresverbrauchs von {Number(data.verbrauch).toLocaleString("de-DE")} kWh. Der endgültige Preis wird Ihnen im Angebot bestätigt. Mit der Anfrage gehen Sie keinerlei Verpflichtung ein — der Wechsel startet erst, wenn Sie das Angebot ausdrücklich bestätigen.
                </p>
              )}
            </StepShell>
          )}

          {/* ---------- KONTAKT (direkt nach der Empfehlung — Lead-Sicherung) ---------- */}
          {step === "kontakt" && (
            <StepShell
              eyebrow="Fast geschafft"
              title="Wohin dürfen wir Ihr Angebot schicken?"
              subtitle="Sie erhalten Ihr persönliches Angebot innerhalb weniger Stunden — per E-Mail oder SMS. Kein Spam, keine Werbeanrufe."
              footer={<NavButtons onBack={back} onNext={next} disabled={!canNext} />}
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vorname" error={err("vorname")}>
                  <TextInput autoComplete="given-name" value={data.vorname} isError={!!err("vorname")} onBlur={() => touch("vorname")} onChange={(e) => update({ vorname: e.target.value })} />
                </Field>
                <Field label="Nachname" error={err("nachname")}>
                  <TextInput autoComplete="family-name" value={data.nachname} isError={!!err("nachname")} onBlur={() => touch("nachname")} onChange={(e) => update({ nachname: e.target.value })} />
                </Field>
              </div>

              {!telefonFromLink && (
                <Field label="Handynummer" hint="Für Rückfragen und die Status-Updates zu Ihrem Wechsel." error={err("telefon")}>
                  <TextInput
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="z. B. 0176 12345678"
                    value={data.telefon}
                    isError={!!err("telefon")}
                    onBlur={() => touch("telefon")}
                    onChange={(e) => update({ telefon: e.target.value })}
                  />
                </Field>
              )}

              <Field label="E-Mail-Adresse" error={err("email")}>
                <TextInput type="email" autoComplete="email" inputMode="email" placeholder="z. B. max@beispiel.de" value={data.email} isError={!!err("email")} onBlur={() => touch("email")} onChange={(e) => update({ email: e.target.value })} />
              </Field>

              <p className="text-xs leading-relaxed" style={{ color: c.stone }}>
                Ihre Daten werden ausschließlich für Ihre Tarifanfrage verwendet und nicht an unbeteiligte Dritte weitergegeben.
              </p>
            </StepShell>
          )}

          {/* ---------- DOKUMENTE ---------- */}
          {step === "dokumente" && (
            <StepShell
              eyebrow="Schneller mit Unterlagen"
              title="Haben Sie eine Rechnung oder Vertragsbestätigung zur Hand?"
              subtitle="Foto oder Datei hochladen — dann müssen Sie weniger von Hand eintragen. Nichts zur Hand? Kein Problem."
              footer={<NavButtons onBack={back} onNext={next} nextLabel={isLastStep ? "Angaben absenden" : "Weiter"} disabled={!canNext} loading={isLastStep && sending} />}
            >
              <label
                className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl px-5 py-8 text-sm font-bold cursor-pointer text-center"
                style={{
                  border: `1.5px dashed ${data.dokumentUpload ? c.green : c.line}`,
                  background: data.dokumentUpload ? c.greenTint : c.surface,
                  color: data.dokumentUpload ? c.greenDark : c.inkSoft,
                  fontFamily: fontDisplay,
                }}
              >
                <Camera size={20} />
                {data.dokumentUpload && data.dokumentUpload.length > 0 ? "Weitere Datei hinzufügen" : "Foto aufnehmen oder Datei hochladen"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;
                    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
                    if (tooBig) {
                      alert(`Die Datei "${tooBig.name}" ist größer als 10 MB. Bitte ein kleineres Foto wählen oder per WhatsApp nachreichen.`);
                      e.target.value = "";
                      return;
                    }
                    const newFiles = await Promise.all(
                      files.map(async (f) => ({ name: f.name, mimetype: f.type, base64: await readFileAsBase64(f) }))
                    );
                    update({ dokumentUpload: [...(data.dokumentUpload || []), ...newFiles], dokumentSpaeter: false });
                    e.target.value = "";
                  }}
                />
              </label>

              {data.dokumentUpload && data.dokumentUpload.length > 0 && (
                <div className="space-y-2">
                  {data.dokumentUpload.map((file, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-xl px-4 py-2.5" style={{ background: c.greenTint, border: `1px solid #C8EBD8` }}>
                      <span className="flex items-center gap-2 text-sm truncate" style={{ color: c.greenDark }}>
                        <Check size={15} className="flex-shrink-0" /> <span className="truncate">{file.name}</span>
                      </span>
                      <button onClick={() => removeDokument(i)} aria-label={`${file.name} entfernen`} className="flex-shrink-0 p-1 rounded-full" style={{ color: c.inkSoft }}>
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs" style={{ color: c.stone }}>
                <span className="h-px flex-1" style={{ background: c.line }} />
                oder
                <span className="h-px flex-1" style={{ background: c.line }} />
              </div>

              <CheckboxRow checked={data.dokumentSpaeter} onClick={() => update({ dokumentSpaeter: !data.dokumentSpaeter, dokumentUpload: null })}>
                Ich habe nichts vorliegen — Daten selbst eingeben
              </CheckboxRow>
            </StepShell>
          )}

          {/* ---------- VERTRAG ---------- */}
          {step === "vertrag" && (
            <StepShell
              eyebrow="Vertragsdaten"
              title={data.dokumentUpload ? "Nur noch Ihr Geburtsdatum" : data.neueinzug ? "Auf wen soll der neue Vertrag laufen?" : "Auf wen läuft der aktuelle Vertrag?"}
              subtitle={
                data.dokumentUpload
                  ? "Alle weiteren Daten entnehmen wir Ihrem hochgeladenen Dokument."
                  : data.neueinzug
                  ? "Da Sie neu einziehen, kann der Vertrag direkt auf Sie angemeldet werden."
                  : "Für den Anbieterwechsel muss der Name exakt mit dem bisherigen Vertragsinhaber übereinstimmen."
              }
              footer={<NavButtons onBack={back} onNext={next} nextLabel={isLastStep ? "Angaben absenden" : "Weiter"} disabled={!canNext} loading={isLastStep && sending} />}
            >
              {!data.dokumentUpload && (
                <div>
                  <span className="block text-sm font-semibold mb-2" style={{ color: c.ink, fontFamily: fontDisplay }}>
                    Um welche Situation handelt es sich?
                  </span>
                  <div className="grid grid-cols-1 gap-2">
                    <ToggleCard selected={!data.neueinzug} onClick={() => update({ neueinzug: false })} title="Bestehender Anschluss wird gewechselt" sub="Es gibt schon einen laufenden Vertrag an dieser Adresse" />
                    <ToggleCard selected={data.neueinzug} onClick={() => update({ neueinzug: true, aktuellerAnbieter: "" })} title="Neueinzug" sub="Es besteht noch kein eigener Vertrag an dieser Adresse" />
                  </div>
                </div>
              )}

              {data.dokumentUpload && <InfoNote>Name, Adresse und Vertragsdaten entnehmen wir Ihrem hochgeladenen Dokument.</InfoNote>}

              {!data.dokumentUpload && !data.neueinzug && (
                <Field
                  label={data.sparte === "strom" ? "Welcher Anbieter beliefert Sie aktuell mit Strom?" : "Welcher Anbieter beliefert Sie aktuell mit Gas?"}
                  hint="So wissen wir, welchen Vertrag wir für Sie kündigen müssen."
                >
                  <TextInput placeholder="z. B. Stadtwerke, E.ON, Vattenfall …" value={data.aktuellerAnbieter} onChange={(e) => update({ aktuellerAnbieter: e.target.value })} />
                </Field>
              )}

              {!data.dokumentUpload && !data.neueinzug && (
                <Field label="Ihre Kundennummer beim aktuellen Anbieter" error={err("kundennummerAlt")} hint="Steht auf Ihrer letzten Abrechnung.">
                  <TextInput placeholder="z. B. K-4471293" value={data.kundennummerAlt} isError={!!err("kundennummerAlt")} onBlur={() => touch("kundennummerAlt")} onChange={(e) => update({ kundennummerAlt: e.target.value })} />
                </Field>
              )}

              {!data.dokumentUpload && data.neueinzug && (
                <Field
                  label="Gewünschtes Einzugs- / Lieferdatum"
                  error={err("einzugsdatum")}
                  hint={`Frühestens möglich ab ${minEinzugsdatumStr()} (5 Werktage Vorlauf). Rückwirkende Anmeldungen sind nicht mehr möglich.`}
                >
                  <input
                    type="date"
                    min={minEinzugsdatumStr()}
                    value={data.einzugsdatum}
                    onBlur={() => touch("einzugsdatum")}
                    onChange={(e) => update({ einzugsdatum: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl text-[15px] outline-none transition-colors"
                    style={{ border: `1.5px solid ${err("einzugsdatum") ? c.red : c.line}`, background: c.surface, color: c.ink }}
                  />
                </Field>
              )}

              <Field label="Geburtsdatum" error={err("geburtsdatum")}>
                <TextInput type="date" autoComplete="bday" value={data.geburtsdatum} isError={!!err("geburtsdatum")} onBlur={() => touch("geburtsdatum")} onChange={(e) => update({ geburtsdatum: e.target.value })} />
              </Field>

              {!data.dokumentUpload && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Field label="Straße" error={err("strasse")}>
                        <TextInput autoComplete="address-line1" value={data.strasse} isError={!!err("strasse")} onBlur={() => touch("strasse")} onChange={(e) => update({ strasse: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Nr." error={err("hausnummer")}>
                      <TextInput value={data.hausnummer} isError={!!err("hausnummer")} onBlur={() => touch("hausnummer")} onChange={(e) => update({ hausnummer: e.target.value })} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Postleitzahl" error={err("plz")}>
                      <TextInput inputMode="numeric" autoComplete="postal-code" maxLength={5} value={data.plz} isError={!!err("plz")} onBlur={() => touch("plz")} onChange={(e) => update({ plz: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
                    </Field>
                    <Field label="Ort" error={err("ort")}>
                      <TextInput autoComplete="address-level2" value={data.ort} isError={!!err("ort")} onBlur={() => touch("ort")} onChange={(e) => update({ ort: e.target.value })} />
                    </Field>
                  </div>
                </>
              )}
            </StepShell>
          )}

          {/* ---------- BANKDATEN ---------- */}
          {step === "bankdaten" && (
            <StepShell
              eyebrow="Bankverbindung"
              title="Wie möchten Sie bezahlen?"
              subtitle="SEPA-Lastschrift oder Selbstzahler — Sie entscheiden."
              footer={<NavButtons onBack={back} onNext={next} disabled={!canNext} />}
            >
              <div className="grid grid-cols-1 gap-2">
                <ToggleCard selected={data.zahlungsart === "lastschrift"} onClick={() => update({ zahlungsart: "lastschrift" })} title="SEPA-Lastschrift" sub="Der Anbieter zieht die Beträge automatisch ein — nichts vergessen, keine Mahnungen" />
                <ToggleCard selected={data.zahlungsart === "selbstzahler"} onClick={() => update({ zahlungsart: "selbstzahler", iban: "", bankdatenSpaeter: false })} title="Selbstzahler / Überweisung" sub="Sie überweisen die Beträge selbst" />
              </div>

              {data.zahlungsart === "lastschrift" && !data.bankdatenSpaeter && (
                <Field label="IBAN" error={touched.iban && data.iban && !isValidIBAN(data.iban) ? "Diese IBAN scheint nicht korrekt zu sein — bitte prüfen" : null} hint="Wird verschlüsselt übertragen und nur für das SEPA-Mandat verwendet.">
                  <TextInput
                    autoComplete="off"
                    inputMode="text"
                    placeholder="DE89 3704 0044 0532 0130 00"
                    value={data.iban}
                    isError={touched.iban && data.iban && !isValidIBAN(data.iban)}
                    onBlur={() => touch("iban")}
                    onChange={(e) => update({ iban: formatIBAN(e.target.value) })}
                  />
                </Field>
              )}

              {data.zahlungsart === "lastschrift" && (
                <CheckboxRow checked={data.bankdatenSpaeter} onClick={() => update({ bankdatenSpaeter: !data.bankdatenSpaeter, iban: "" })}>
                  Ich reiche die IBAN später per WhatsApp nach
                </CheckboxRow>
              )}
            </StepShell>
          )}

          {/* ---------- ZÄHLER ---------- */}
          {step === "zaehler" && (
            <StepShell
              eyebrow="Letzter Schritt"
              title={data.sparte === "strom" ? "Ihre Stromzählernummer" : "Ihre Gaszählernummer"}
              subtitle="Fehlt Ihnen die Nummer gerade, ist das kein Problem — ein Foto genügt, oder Sie reichen sie später nach."
              footer={<NavButtons onBack={back} onNext={next} nextLabel="Angaben absenden" disabled={!canNext} loading={sending} />}
            >
              {data.dokumentUpload && <InfoNote>Falls Ihre Zählernummer bereits im hochgeladenen Dokument sichtbar ist, können Sie diesen Schritt einfach mit „Angaben absenden" abschließen.</InfoNote>}

              {!data.zaehlerSpaeter && (
                <div className="space-y-3">
                  <TextInput placeholder="z. B. 1EMH0012345678" value={data.zaehlernummer} onChange={(e) => update({ zaehlernummer: e.target.value })} />
                  <Field label="Zählpunktbezeichnung / MaLo-ID (optional)" hint="11-stellig — steht auf der letzten Abrechnung.">
                    <TextInput placeholder="z. B. 51234567890" value={data.maloId} onChange={(e) => update({ maloId: e.target.value })} maxLength={11} />
                  </Field>
                  <div className="flex items-center gap-2 text-xs" style={{ color: c.stone }}>
                    <span className="h-px flex-1" style={{ background: c.line }} />
                    oder
                    <span className="h-px flex-1" style={{ background: c.line }} />
                  </div>
                  <label className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold cursor-pointer" style={{ border: `1.5px dashed ${c.line}`, color: c.blue, fontFamily: fontDisplay }}>
                    {data.zaehlerFoto ? (
                      <>
                        <Check size={16} /> {data.zaehlerFoto.name}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            update({ zaehlerFoto: null });
                          }}
                          aria-label="Foto entfernen"
                          className="p-0.5"
                          style={{ color: c.inkSoft }}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <Camera size={16} /> Zählerfoto hochladen
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) {
                          alert("Das Foto ist größer als 10 MB. Bitte ein kleineres Foto wählen.");
                          e.target.value = "";
                          return;
                        }
                        const base64 = await readFileAsBase64(file);
                        update({ zaehlerFoto: { name: file.name, mimetype: file.type, base64 } });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}

              <CheckboxRow checked={data.zaehlerSpaeter} onClick={() => update({ zaehlerSpaeter: !data.zaehlerSpaeter, zaehlernummer: "", zaehlerFoto: null })}>
                Ich reiche die Zählernummer per WhatsApp-Foto nach
              </CheckboxRow>
            </StepShell>
          )}

          {/* ---------- SUBMIT-FEHLER (Eskalation) ---------- */}
          {submitError && (
            <div className="mt-4 space-y-3">
              <InfoNote tone="warn">
                Ihre Angaben konnten gerade nicht übertragen werden — das kann an einer instabilen Internetverbindung liegen. Ihre Eingaben sind noch da: Versuchen Sie es einfach nochmal, oder schreiben Sie uns direkt per WhatsApp — wir kümmern uns sofort darum.
              </InfoNote>
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-extrabold no-underline"
                style={{ background: "#25D366", color: "#073B1D", fontFamily: fontDisplay }}
              >
                <MessageCircle size={16} /> Per WhatsApp melden
              </a>
            </div>
          )}

          {/* ---------- ABSCHLUSS ---------- */}
          {step === "abschluss" && (
            <div className="step-enter text-center py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: c.greenTint }}>
                <Check size={26} style={{ color: c.green }} />
              </div>
              <h2 className="text-2xl mb-2 font-extrabold" style={{ fontFamily: fontDisplay, color: c.ink }}>
                Vielen Dank{data.vorname ? `, ${data.vorname}` : ""}!
              </h2>
              <p className="text-[15px] leading-relaxed mb-6" style={{ color: c.inkSoft }}>
                {heizungAbschluss
                  ? `Ihre Anfrage zu Ihrer ${heizungAbschluss === "waermepumpe" ? "Wärmepumpe" : "Nachtspeicherheizung"} ist bei uns eingegangen. Wir melden uns persönlich bei Ihnen.`
                  : completedSpartes.length >= 2
                  ? "Ihre Anfrage für Strom & Gas ist vollständig bei uns eingegangen. Sie hören in Kürze von uns."
                  : `Ihre ${data.sparte === "gas" ? "Gas" : "Strom"}-Anfrage ist bei uns eingegangen. Sie hören in Kürze von uns.`}
              </p>

              {heizungAbschluss && (
                <div className="mb-4 text-left">
                  <InfoNote>
                    Für {heizungAbschluss === "waermepumpe" ? "Wärmepumpen" : "Nachtspeicherheizungen"} gibt es keine pauschalen Tarife von der Stange — ob und welche Möglichkeiten es für Sie gibt, klären wir gemeinsam in einem kurzen persönlichen Gespräch. Ihr Ansprechpartner meldet sich dazu direkt bei Ihnen.
                  </InfoNote>
                </div>
              )}

              {!heizungAbschluss && data.tarif !== "individuell" && (
                <div className="rounded-2xl p-4 mb-4 text-left" style={{ background: c.bg, border: `1px solid ${c.line}` }}>
                  <div className="text-xs mb-1" style={{ color: c.stone }}>
                    Ihre Anfrage
                  </div>
                  <div className="text-[15px] font-bold" style={{ color: c.ink, fontFamily: fontDisplay }}>
                    {completedSpartes.length >= 2 ? "Strom & Gas" : preis.anzeigeName || (data.sparte === "strom" ? "Stromtarif" : "Gastarif")}
                  </div>
                </div>
              )}

              {/* Wie geht es weiter */}
              <div className="rounded-2xl p-4 mb-4 text-left" style={{ background: c.bg, border: `1px solid ${c.line}` }}>
                <div className="text-sm font-extrabold mb-3" style={{ color: c.ink, fontFamily: fontDisplay }}>
                  So geht es jetzt weiter
                </div>
                <div className="space-y-3">
                  {(heizungAbschluss
                    ? [
                        ["1", "Wir sichten Ihre Angaben und prüfen, welche Möglichkeiten es für Ihre Heizungsart gibt."],
                        ["2", "Ihr persönlicher Ansprechpartner meldet sich bei Ihnen, um alles Weitere direkt zu besprechen."],
                        ["3", "Erst wenn ein passendes Angebot vorliegt und Sie es bestätigen, wird ein Wechsel beauftragt."],
                      ]
                    : data.tarif === "individuell"
                    ? [
                        ["1", "Wir prüfen Ihre Angaben persönlich und suchen die passende Lösung für Ihren Verbrauch."],
                        ["2", "Sobald alles vollständig ist, erhalten Sie umgehend ein Angebot von uns."],
                        ["3", "Sie bestätigen das Angebot — und wechseln innerhalb von 24 bis 48 Stunden Ihren Anbieter."],
                      ]
                    : [
                        ["1", "Wir prüfen Ihre Angaben auf Vollständigkeit."],
                        ["2", "Sobald alles vollständig ist, erhalten Sie umgehend ein persönliches Angebot von uns."],
                        ["3", "Sie bestätigen das Angebot — und wechseln innerhalb von 24 bis 48 Stunden Ihren Anbieter."],
                      ]
                  ).map(([n, txt]) => (
                    <div key={n} className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold mt-0.5" style={{ background: c.blueTint, color: c.blue, fontFamily: fontDisplay }}>
                        {n}
                      </div>
                      <span className="text-sm leading-relaxed" style={{ color: c.inkSoft }}>
                        {txt}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {data.zaehlerSpaeter && (
                <div className="mb-3 text-left">
                  <InfoNote>Bitte halten Sie Ihren Zählerstand griffbereit — wir schreiben Ihnen gleich per WhatsApp, wie Sie das Foto einfach nachreichen können.</InfoNote>
                </div>
              )}
              {data.bankdatenSpaeter && (
                <div className="mb-3 text-left">
                  <InfoNote>Die IBAN können Sie jederzeit direkt im WhatsApp-Chat nachreichen.</InfoNote>
                </div>
              )}

              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-extrabold mt-4 no-underline"
                style={{ background: "#25D366", color: "#073B1D", fontFamily: fontDisplay }}
              >
                <MessageCircle size={16} /> Fragen? Direkt per WhatsApp schreiben
              </a>

              <div className="space-y-2.5 mt-4">
                {!secondPass && !heizungAbschluss && !completedSpartes.includes("gas") && (
                  <button
                    onClick={startGasFlow}
                    className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-extrabold"
                    style={{ background: c.blue, color: "#fff", fontFamily: fontDisplay, boxShadow: "0 6px 20px rgba(20,115,235,0.34)" }}
                  >
                    <Flame size={16} /> Jetzt auch Gas vergleichen
                  </button>
                )}

                {!showHeizungChooser ? (
                  <button
                    onClick={() => setShowHeizungChooser(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-extrabold"
                    style={{ background: c.blueTint, color: c.blue, fontFamily: fontDisplay }}
                  >
                    <Zap size={16} /> Nachtspeicher oder Wärmepumpe vergleichen
                  </button>
                ) : (
                  <div className="rounded-2xl p-4 space-y-2.5" style={{ background: c.bg, border: `1px solid ${c.line}` }}>
                    <p className="text-sm m-0" style={{ color: c.inkSoft }}>
                      Welche Heizungsart nutzen Sie?
                    </p>
                    <ToggleCard selected={false} onClick={() => startHeizungFlow("waermepumpe")} title="Wärmepumpe" sub="Wir prüfen persönlich die passende Option" />
                    <ToggleCard selected={false} onClick={() => startHeizungFlow("nachtspeicher")} title="Nachtspeicherheizung" sub="Wir prüfen persönlich die passende Option" />
                  </div>
                )}

                <button
                  onClick={handleShare}
                  className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-extrabold"
                  style={{ background: c.greenTint, color: c.greenDark, fontFamily: fontDisplay }}
                >
                  <Share2 size={16} /> {copied ? "Link kopiert ✓" : "Kennen Sie jemanden, der zu viel zahlt? Link teilen"}
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-xs mt-6" style={{ color: c.stone }}>
                <Home size={13} /> <a href="https://kwh-beratung.de" className="no-underline" style={{ color: c.stone }}>kwh-beratung.de</a>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-center mt-6 leading-relaxed" style={{ color: c.stone }}>
          Ihre Daten werden ausschließlich zur Tarifprüfung verwendet und nicht an Dritte weitergegeben, die nicht am Wechsel beteiligt sind.
        </p>

        <div className="flex items-center justify-center gap-x-4 gap-y-1 flex-wrap text-xs mt-4 pt-4" style={{ borderTop: `1px solid ${c.line}` }}>
          <a href="https://kwh-beratung.de" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: c.stone }}>
            kwh-beratung.de
          </a>
          <a href="https://kwh-beratung.de/impressum" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: c.stone }}>
            Impressum
          </a>
          <a href="https://kwh-beratung.de/datenschutz" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: c.stone }}>
            Datenschutz
          </a>
        </div>
      </div>
    </div>
  );
}
