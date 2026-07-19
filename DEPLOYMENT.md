# Tarifrechner FINAL – Deployment

## Was ist neu in dieser Version

**Lead-Sicherung (wichtigste Änderung):**
Die Kontaktdaten (Name, Handy, E-Mail) werden jetzt DIREKT nach der
Tarif-Empfehlung abgefragt — im Moment der höchsten Motivation.
Sobald der Kunde sie eingibt und auf Weiter klickt, wird der Lead
sofort im Hintergrund an n8n/Pipedrive übermittelt (Feld
submission_typ: "lead_vorab"). Der finale Submit am Ende aktualisiert
denselben Deal (submission_typ: "vollstaendig") — dein n8n-Workflow
sucht ja bereits per Telefonnummer nach bestehenden Deals.
ERGEBNIS: Auch Abbrecher nach dem Kontakt-Schritt sind jetzt Leads!

**Neue Schrittfolge:**
Verbrauch -> Wechselweg -> Tarif -> KONTAKT -> Unterlagen ->
Vertragsdaten -> Zahlung -> Zähler

**Robustheit & Eskalation:**
- Wenn der finale Submit fehlschlägt (z. B. Funkloch), sieht der Kunde
  KEINE falsche Erfolgsmeldung mehr, sondern einen Hinweis mit
  Retry-Möglichkeit + WhatsApp-Button
- "Hilfe"-Button (WhatsApp) oben rechts auf JEDEM Schritt
- Dateigrößen-Limit 10 MB mit verständlicher Meldung
- Hochgeladene Dokumente einzeln entfernbar (X-Button)
- Server-Antwort wird geprüft (res.ok), nicht nur "gesendet"

**UX-Feinschliff:**
- Fortschrittsbalken mit Schritt-Namen ("Ihr Tarif — Schritt 3 von 8")
- IBAN wird beim Tippen automatisch in 4er-Gruppen formatiert
- autoComplete-Attribute: Handy schlägt Name/Tel/E-Mail/Adresse vor
- Lade-Spinner beim Absenden
- Datenschutz-Hinweis direkt unter den Kontaktfeldern

## Hochladen (nur EINE Datei!)

Es hat sich nur App.jsx geändert. Alles andere (api/, usePreis.js,
Preistabellen, Konfiguration) bleibt unverändert.

1. GitHub-Repo "tarifrechner" öffnen
2. Add file -> Upload files
3. Die neue App.jsx reinziehen (überschreibt die alte)
4. Commit changes
5. Vercel deployt automatisch (~1 Minute)

## Testen nach dem Deploy

1. rechner.kwh-beratung.de auf dem HANDY öffnen
2. Flow durchklicken: PLZ -> Wechselweg -> Tarif wird angezeigt?
3. Kontaktdaten eingeben -> Weiter -> JETZT in Pipedrive prüfen:
   Ist bereits ein Deal angelegt? (Lead-Sicherung funktioniert!)
4. Rest durchklicken bis "Vielen Dank"
5. In Pipedrive prüfen: Wurde derselbe Deal aktualisiert (nicht doppelt)?

## Wichtig für n8n (optional, aber empfohlen)

Der Payload enthält jetzt das neue Feld "submission_typ":
- "lead_vorab"    = Kunde hat Kontaktdaten eingegeben, Rest folgt evtl.
- "vollstaendig"  = Kunde hat den Rechner komplett abgeschlossen

Du kannst in n8n darauf filtern, z. B. um bei "lead_vorab"-Deals,
die nach 1 Stunde nicht "vollstaendig" wurden, eine Erinnerung zu
schicken ("Sie waren fast fertig — sollen wir den Rest zusammen
per WhatsApp erledigen?"). Das ist die stärkste Rückholmechanik.
