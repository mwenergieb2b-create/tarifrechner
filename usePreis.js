// src/usePreis.js
// Fragt die Vercel-Funktion /api/preis ab. Die API entscheidet serverseitig,
// welcher EINE Tarif für die Situation des Kunden empfohlen wird, und liefert
// Name, Beschreibung, Badge und Preis in einem Rutsch zurück.

import { useEffect, useState } from "react";

const EMPTY = {
  loading: false,
  found: false,
  individuell: false,
  tarif: null,
  tarifName: null,
  anzeigeName: null,
  tarifSub: null,
  badge: null,
  laufzeit: null,
  preisgarantie: null,
  grundpreis: null,
  arbeitspreis: null,
};

/**
 * @param {"bonitaetsfrei"|"normal"} gruppe
 * @param {"strom"|"gas"} sparte
 * @param {string} plz            5-stellige Postleitzahl
 * @param {number|string} verbrauch  Jahresverbrauch in kWh
 */
export function usePreis(gruppe, sparte, plz, verbrauch) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    const plzValid = /^\d{5}$/.test(plz || "");
    const verbrauchValid = Number(verbrauch) > 0;

    if (!plzValid || !verbrauchValid || !gruppe || !sparte) {
      setState(EMPTY);
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const params = new URLSearchParams({ gruppe, sparte, plz, verbrauch: String(verbrauch) });

    fetch(`/api/preis?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setState({
          loading: false,
          found: !!data.found,
          individuell: !!data.individuell,
          tarif: data.tarif || null,
          tarifName: data.tarifName || null,
          anzeigeName: data.anzeigeName || data.tarifName || null,
          tarifSub: data.tarifSub || null,
          badge: data.badge || null,
          laufzeit: data.laufzeit || null,
          preisgarantie: data.preisgarantie || null,
          grundpreis: data.found ? data.grundpreis : null,
          arbeitspreis: data.found ? data.arbeitspreis : null,
        });
      })
      .catch(() => {
        if (!cancelled) setState(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [gruppe, sparte, plz, verbrauch]);

  const monatlich =
    state.grundpreis != null && state.arbeitspreis != null
      ? (state.grundpreis + (Number(verbrauch) * state.arbeitspreis) / 100) / 12
      : null;

  // Grundpreis kommt aus der Tabelle in Euro/Jahr -> für die Anzeige pro Monat
  const grundpreisMonat = state.grundpreis != null ? state.grundpreis / 12 : null;

  return { ...state, monatlich, grundpreisMonat };
}
