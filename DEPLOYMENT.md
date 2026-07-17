# Tarifrechner V2 – Deployment

## Was ist neu



- **Design:** Identischer Look zur Website (Manrope, Blau #1473EB, Pill-Buttons)
- **Neue Tariflogik:** Es wird immer genau EIN passender Tarif empfohlen:
  - Strom, regulärer Wechsel → ÖkoStrom24 Pur
  - Strom, ohne Bonitätsprüfung, ab 1.500 kWh → Plan B Energie NEO T24
  - Strom, ohne Bonitätsprüfung, 500–1.499 kWh → GENO Strom Natur Direkt
  - Strom, ohne Bonitätsprüfung, unter 500 kWh → individuelle Prüfung
  - Gas, regulärer Wechsel → Easy24 Gas PUR
  - Gas, ohne Bonitätsprüfung, ab 5.000 kWh → ELE erdgasFair
  - Gas, ohne Bonitätsprüfung, unter 5.000 kWh → individuelle Prüfung
- **Neuer Schritt „Wechselweg":** Subtile Bonitätsfrage über die Wahl
  „Ohne Bonitätsprüfung (empfohlen)" vs. „Regulärer Wechsel"
- **Zurück-Button** auf jedem Schritt (auch zurück zum Start)
- **Vorbefüllung** per Link: ?plz=&vorname=&nachname=&telefon=&email=
- **Individuell-Fälle** durchlaufen einen verkürzten Ablauf (keine IBAN/Zähler-Abfrage)
- **Preisdaten:** 5 neue JSON-Tabellen aus deinen CSVs (Lichtblick komplett entfernt)
- **Payload unverändert kompatibel** zum bestehenden n8n/Pipedrive-Workflow,
  neues Zusatzfeld: `tarif_name` (Klartext, z. B. "Plan B Energie NEO T24")

## Deployment (bestehendes Repo überschreiben)

1. GitHub-Repo `mwenergieb2b-create/tarifrechner` öffnen
2. ALLE alten Dateien löschen ODER einfach alle neuen Dateien per
   "Add file → Upload files" hochladen (überschreibt Gleichnamige)
   WICHTIG: Die alten JSON-Dateien in api/data/ (bonitaetsfrei_*.json,
   normal_*.json) manuell löschen — die neuen heißen anders
   (planb_strom.json, geno_strom.json, vattenfall_strom.json,
   ele_gas.json, vattenfall_gas.json)
3. Vercel deployt automatisch nach dem Commit

## Eigene Domain: tarifrechner.kwh-beratung.de

1. Vercel-Dashboard → Projekt „tarifrechner" → Settings → Domains
2. „tarifrechner.kwh-beratung.de" eingeben → Add
3. Vercel zeigt dir einen CNAME-Wert an (z. B. cname.vercel-dns.com)
4. Cloudflare-Dashboard → Domain kwh-beratung.de → DNS → Records → Add record:
   - Type: CNAME
   - Name: tarifrechner
   - Target: cname.vercel-dns.com (den Wert, den Vercel anzeigt)
   - Proxy status: AUS (graue Wolke, „DNS only") — wichtig für Vercel!
5. Speichern, 1–2 Minuten warten, Vercel bestätigt die Domain automatisch
6. Danach auf der Website (index.html im Website-Repo) alle Links von
   https://tarifrechner-g11r.vercel.app auf
   https://tarifrechner.kwh-beratung.de ändern

## Noch offen (aus dem alten Code übernommen)

- N8N_PROGRESS_URL in App.jsx ist weiterhin ein Platzhalter — dort die
  Webhook-URL des „Rechner Fortschritt"-Workflows eintragen, sobald der
  Workflow in n8n existiert. Der Haupt-Webhook (Submission) ist unverändert
  aktiv und funktioniert.
