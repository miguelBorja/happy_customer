// Helpers for parsing/formatting Costa Rican vehicle metadata (specs, plate info, taxes).
// Used by the details modal and related widgets.

/** Returns a non-empty trimmed string, or null for missing/placeholder values. */
export const cleanSpecText = (val) => {
  if (val == null) return null;
  const trimmed = String(val).trim();
  if (trimmed === '' || /^(-|nd|n\/a|no\s*indica)$/i.test(trimmed)) return null;
  return trimmed;
};

/** True when the "pago de impuestos" field indicates import taxes are not yet paid. */
export const isTaxesUnpaid = (pagoImpuestos) =>
  String(pagoImpuestos || '').trim().toUpperCase() === 'NO';

/** Formats a yes/no spec value using translations; returns null for empty placeholders. */
export const formatYesNo = (val, t) => {
  const cleaned = cleanSpecText(val);
  if (cleaned === null) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'SI' || upper === 'SÍ') return t('yesValue');
  if (upper === 'NO') return t('noValue');
  return cleaned;
};

/** Parses a Costa Rican plate into restriction/day & DEKRA month info. */
export const parsePlateInfo = (placa, combustible, hasRtvUpToDate = false) => {
  const raw = String(placa || '').trim();
  if (raw === '' || /^(-|nd|n\/a|no\s*indica|termina\s+en\s*[-.]?)$/i.test(raw)) {
    return null;
  }
  const match = raw.match(/(\d)\s*$/);
  if (match) {
    const digit = match[1];
    const isElectric = /el[eé]ctric/i.test(String(combustible || ''));
    const restrictionMap = {
      '1': 'restrMonday',
      '2': 'restrMonday',
      '3': 'restrTuesday',
      '4': 'restrTuesday',
      '5': 'restrWednesday',
      '6': 'restrWednesday',
      '7': 'restrThursday',
      '8': 'restrThursday',
      '9': 'restrFriday',
      '0': 'restrFriday',
    };
    const dekraMap = {
      '1': 'monthJan',
      '2': 'monthFeb',
      '3': 'monthMar',
      '4': 'monthApr',
      '5': 'monthMay',
      '6': 'monthJun',
      '7': 'monthJul',
      '8': 'monthAug',
      '9': 'monthSep',
      '0': 'monthOct',
    };
    return {
      digit,
      raw,
      restrictionKey: isElectric ? 'restrExemptElectric' : restrictionMap[digit],
      isElectric,
      dekraMonthKey: dekraMap[digit],
      hasRtvUpToDate: Boolean(hasRtvUpToDate),
    };
  }
  return {
    digit: null,
    raw,
    restrictionKey: null,
    isElectric: false,
    dekraMonthKey: null,
    hasRtvUpToDate: Boolean(hasRtvUpToDate),
  };
};