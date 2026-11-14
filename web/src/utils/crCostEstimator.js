import { isTaxesUnpaid } from './crVehicleInfo';

export const DEFAULT_FX_RATE = 510;
const FX_RATE_KEY = 'crautosdb_fx_rate';
const MIN_FX_RATE = 350;
const MAX_FX_RATE = 850;

export const getStoredFxRate = () => {
  try {
    const raw = Number(localStorage.getItem(FX_RATE_KEY));
    if (Number.isFinite(raw) && raw >= MIN_FX_RATE && raw <= MAX_FX_RATE) {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_FX_RATE;
};

export const setStoredFxRate = (rate) => {
  const num = Number(rate);
  if (!Number.isFinite(num) || num < MIN_FX_RATE || num > MAX_FX_RATE) return;
  try {
    localStorage.setItem(FX_RATE_KEY, String(Math.round(num)));
  } catch {
    // Ignore storage access errors
  }
};

export const formatCRC = (amount) => {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return '—';
  return `₡${Math.round(Number(amount)).toLocaleString('en-US')}`;
};

/**
 * Estimates Costa Rica buyer-side transfer cost in USD (2.5% Impuesto de Traspaso
 * + ~1.5% Registro stamps/notary arancel + fixed stamps), floored at $250 for active prices.
 */
export const estimateTransferCostUSD = (priceUSD) => {
  const price = Number(priceUSD) || 0;
  if (price <= 0) return 0;
  return Math.max(250, Math.round(price * 0.04 + 90));
};

/**
 * Indicative annual Marchamo estimate in USD based on CR Ley 10390 progressive brackets
 * on approximate fiscal value (~85% of market price), SOA + stamps, and partial EV tax relief.
 */
export const estimateMarchamoUSD = (car, fxRate = DEFAULT_FX_RATE) => {
  const priceUSD = Number(car?.Price) || 0;
  if (priceUSD <= 0) return 0;

  const rate = Number(fxRate) > 0 ? Number(fxRate) : DEFAULT_FX_RATE;
  const fiscalCRC = priceUSD * rate * 0.85;

  let propertyTaxCRC;
  const b1 = 7_000_000;
  const b2 = 15_000_000;
  const b3 = 30_000_000;

  if (fiscalCRC <= b1) {
    propertyTaxCRC = fiscalCRC * 0.015;
  } else if (fiscalCRC <= b2) {
    propertyTaxCRC = b1 * 0.015 + (fiscalCRC - b1) * 0.021;
  } else if (fiscalCRC <= b3) {
    propertyTaxCRC = b1 * 0.015 + (b2 - b1) * 0.021 + (fiscalCRC - b2) * 0.028;
  } else {
    propertyTaxCRC =
      b1 * 0.015 + (b2 - b1) * 0.021 + (b3 - b2) * 0.028 + (fiscalCRC - b3) * 0.032;
  }

  const fuel = String(car?.Combustible || car?.FuelType || '').toLowerCase();
  if (fuel.includes('eléctric') || fuel.includes('electric')) {
    propertyTaxCRC *= 0.6;
  }

  propertyTaxCRC = Math.max(30_000, propertyTaxCRC);
  const soaAndStampsCRC = 36_000;
  return Math.round((propertyTaxCRC + soaAndStampsCRC) / rate);
};

export const calculateMonthlyLoan = (principal, annualRatePct, termMonths) => {
  const p = Number(principal) || 0;
  const n = Math.max(1, Number(termMonths) || 1);
  if (p <= 0) return 0;
  const r = (Number(annualRatePct) || 0) / 100 / 12;
  if (r <= 0) return p / n;
  const factor = Math.pow(1 + r, n);
  return (p * (r * factor)) / (factor - 1);
};

/**
 * Computes full CR ownership/purchase estimates for a listing.
 */
export const estimateCrCosts = (car, options = {}) => {
  const priceUSD = Number(car?.Price) || 0;
  const fxRate = Number(options.fxRate) || getStoredFxRate();
  const downPaymentPct = options.downPaymentPct ?? 20;
  const termMonths = options.termMonths ?? 72;
  const annualRatePct = options.annualRatePct ?? 9.5;

  const transferUSD = estimateTransferCostUSD(priceUSD);
  const marchamoUSD = estimateMarchamoUSD(car, fxRate);
  const turnkeyUSD = priceUSD > 0 ? priceUSD + transferUSD : 0;

  const downPaymentUSD = Math.round(priceUSD * (downPaymentPct / 100));
  const initialOutlayUSD = priceUSD > 0 ? downPaymentUSD + transferUSD : 0;
  const loanAmountUSD = Math.max(0, priceUSD - downPaymentUSD);
  const monthlyUSD = Math.round(calculateMonthlyLoan(loanAmountUSD, annualRatePct, termMonths));

  return {
    fxRate,
    priceUSD,
    priceCRC: Math.round(priceUSD * fxRate),
    transferUSD,
    transferCRC: Math.round(transferUSD * fxRate),
    marchamoUSD,
    marchamoCRC: Math.round(marchamoUSD * fxRate),
    turnkeyUSD,
    turnkeyCRC: Math.round(turnkeyUSD * fxRate),
    downPaymentPct,
    downPaymentUSD,
    initialOutlayUSD,
    loanAmountUSD,
    termMonths,
    annualRatePct,
    monthlyUSD,
    monthlyCRC: Math.round(monthlyUSD * fxRate),
    unpaidTaxes: isTaxesUnpaid(car?.PagoImpuestos ?? car?.TaxesPaid),
  };
};

const MONTHLY_KM_KEY = 'crautosdb_monthly_km';

export const DEFAULT_MONTHLY_KM = 1200;

// Reference Costa Rica tariffs (RECOPE & CNFL/ICE residential bracket).
export const CR_FUEL_TARIFF_CRC = Object.freeze({
  gasoline: 720,
  diesel: 615,
  evKwh: 95,
});

export const getStoredMonthlyKm = () => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MONTHLY_KM_KEY) : null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 200 && parsed <= 5000) {
      return Math.round(parsed);
    }
  } catch {
    // Ignore storage errors in sandboxed/private browsing contexts.
  }
  return DEFAULT_MONTHLY_KM;
};

export const setStoredMonthlyKm = (km) => {
  const num = Number(km);
  if (!Number.isFinite(num) || num <= 0) return DEFAULT_MONTHLY_KM;
  const clamped = Math.min(5000, Math.max(200, Math.round(num)));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MONTHLY_KM_KEY, String(clamped));
    }
  } catch {
    // Ignore storage errors.
  }
  return clamped;
};

const normalizeText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const classifyPowertrain = (car) => {
  const fuel = normalizeText(car?.Combustible ?? car?.FuelType ?? car?.combustible);
  if (fuel.includes('elect')) return 'ev';
  if (fuel.includes('hibr') || fuel.includes('hybrid') || fuel.includes('phev')) return 'hybrid';
  if (fuel.includes('dies')) return 'diesel';
  return 'gasoline';
};

const parseDisplacementCC = (car) => {
  const raw = String(car?.Cilindrada ?? car?.EngineCC ?? car?.cilindrada ?? '').trim();
  if (!raw) return 0;
  const num = Number(raw.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num < 15 ? Math.round(num * 1000) : Math.round(num);
};

const isHeavyBody = (car) => {
  const style = normalizeText(car?.Estilo ?? car?.BodyStyle ?? car?.estilo ?? car?.Title ?? '');
  return (
    style.includes('suv') ||
    style.includes('4x4') ||
    style.includes('pick') ||
    style.includes('micro') ||
    style.includes('panel') ||
    style.includes('van')
  );
};

export const estimateConsumptionPer100Km = (car, powertrain = classifyPowertrain(car)) => {
  const cc = parseDisplacementCC(car);
  const heavy = isHeavyBody(car);

  if (powertrain === 'ev') {
    return {
      unit: 'kWh/100km',
      value: heavy ? 19 : 16,
    };
  }
  if (powertrain === 'hybrid') {
    return {
      unit: 'L/100km',
      value: heavy || cc >= 2400 ? 6.2 : 5.2,
    };
  }
  if (powertrain === 'diesel') {
    if (cc >= 2800 || heavy) return { unit: 'L/100km', value: 8.8 };
    if (cc > 0 && cc <= 1700) return { unit: 'L/100km', value: 6.0 };
    return { unit: 'L/100km', value: 7.2 };
  }

  // Gasoline consumption scaled by displacement when available, otherwise by body class.
  if (cc > 0) {
    if (cc <= 1400) return { unit: 'L/100km', value: 7.0 };
    if (cc <= 1800) return { unit: 'L/100km', value: 8.2 };
    if (cc <= 2400) return { unit: 'L/100km', value: 9.8 };
    return { unit: 'L/100km', value: 12.5 };
  }
  return { unit: 'L/100km', value: heavy ? 10.5 : 8.5 };
};

const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));

const estimate3YrDepreciation = (car, priceUSD, powertrain, depCurve) => {
  if (priceUSD <= 0) {
    return { depreciationUSD: 0, depreciationPct: 0, depreciationSource: 'fallback' };
  }

  const points = Array.isArray(depCurve?.points)
    ? [...depCurve.points]
        .filter((p) => Number(p?.median) > 0 && Number(p?.year) > 0)
        .sort((a, b) => a.year - b.year)
    : [];

  const reliable = points.filter((p) => !p.lowSample && (Number(p.count) || 0) >= 2);
  const usable = reliable.length >= 2 ? reliable : points;

  if (usable.length >= 2) {
    const carYear = Number(car?.Year) || 0;
    const directNow = usable.find((p) => p.year === carYear);
    const direct3Yr = usable.find((p) => Math.abs(p.year - (carYear - 3)) <= 1 && p.year < carYear);

    if (directNow && direct3Yr && directNow.median > direct3Yr.median) {
      const span = directNow.year - direct3Yr.year;
      const annualRate = clampNum(1 - Math.pow(direct3Yr.median / directNow.median, 1 / span), 0.03, 0.16);
      const pct3Yr = 1 - Math.pow(1 - annualRate, 3);
      return {
        depreciationUSD: Math.round(priceUSD * pct3Yr),
        depreciationPct: Math.round(pct3Yr * 1000) / 10,
        depreciationSource: 'curve',
      };
    }

    const rates = [];
    for (let i = 1; i < usable.length; i += 1) {
      const older = usable[i - 1];
      const newer = usable[i];
      const span = newer.year - older.year;
      if (span <= 0 || newer.median <= 0 || older.median <= 0) continue;
      const implied = 1 - Math.pow(older.median / newer.median, 1 / span);
      if (implied >= -0.02 && implied <= 0.28) {
        rates.push(clampNum(implied, 0.03, 0.16));
      }
    }
    if (rates.length > 0) {
      const avgAnnual = rates.reduce((sum, r) => sum + r, 0) / rates.length;
      const pct3Yr = clampNum(1 - Math.pow(1 - avgAnnual, 3), 0.09, 0.38);
      return {
        depreciationUSD: Math.round(priceUSD * pct3Yr),
        depreciationPct: Math.round(pct3Yr * 1000) / 10,
        depreciationSource: 'curve',
      };
    }
  }

  // Segment fallback when no brand/model curve is available.
  const currentYear = new Date().getFullYear();
  const carYear = Number(car?.Year) || currentYear - 5;
  const age = Math.max(0, currentYear - carYear);
  let pct3Yr;
  if (age <= 2) pct3Yr = 0.27;
  else if (age <= 6) pct3Yr = 0.21;
  else if (age <= 10) pct3Yr = 0.16;
  else pct3Yr = 0.12;

  const brandLower = normalizeText(car?.Brand);
  if (brandLower === 'toyota' || brandLower === 'honda' || powertrain === 'hybrid') {
    pct3Yr -= 0.025;
  } else if (powertrain === 'ev' && age <= 4) {
    pct3Yr += 0.02;
  }

  const finalPct = clampNum(pct3Yr, 0.09, 0.36);
  return {
    depreciationUSD: Math.round(priceUSD * finalPct),
    depreciationPct: Math.round(finalPct * 1000) / 10,
    depreciationSource: 'fallback',
  };
};

/**
 * Estimates 3-year Costa Rica Total Cost of Ownership (36 months) combining:
 * initial traspaso, 3 annual marchamo periods, RECOPE/CNFL energy cost for monthlyKm,
 * and projected 3-year market depreciation.
 */
export const estimateCrTco3Yr = (car, { fxRate, monthlyKm, depCurve } = {}) => {
  const numericFx = Number(fxRate);
  const effectiveFx = Number.isFinite(numericFx) && numericFx > 0 ? numericFx : getStoredFxRate();
  const numericKm = Number(monthlyKm);
  const effectiveKm =
    Number.isFinite(numericKm) && numericKm > 0
      ? Math.min(5000, Math.max(200, Math.round(numericKm)))
      : getStoredMonthlyKm();

  const priceUSD = Number(car?.Price) || 0;
  const powertrain = classifyPowertrain(car);
  const consumption = estimateConsumptionPer100Km(car, powertrain);

  let tariffCRC = CR_FUEL_TARIFF_CRC.gasoline;
  if (powertrain === 'ev') tariffCRC = CR_FUEL_TARIFF_CRC.evKwh;
  else if (powertrain === 'diesel') tariffCRC = CR_FUEL_TARIFF_CRC.diesel;

  if (priceUSD <= 0) {
    return {
      fxRate: effectiveFx,
      monthlyKm: effectiveKm,
      powertrain,
      consumption,
      tariffCRC,
      transferUSD: 0,
      marchamo3YrUSD: 0,
      energy3YrUSD: 0,
      energy3YrCRC: 0,
      monthlyEnergyUSD: 0,
      depreciationUSD: 0,
      depreciationPct: 0,
      depreciationSource: 'fallback',
      estimatedResaleUSD: 0,
      netTco3YrUSD: 0,
      netTco3YrCRC: 0,
      netMonthlyTcoUSD: 0,
    };
  }

  const km3Yr = effectiveKm * 36;
  const energy3YrCRC = Math.round((km3Yr / 100) * consumption.value * tariffCRC);
  const energy3YrUSD = Math.round(energy3YrCRC / effectiveFx);
  const monthlyEnergyUSD = Math.round(energy3YrUSD / 36);

  const transferUSD = estimateTransferCostUSD(priceUSD);
  const marchamoY1 = estimateMarchamoUSD(car, effectiveFx);
  const marchamoY2 = estimateMarchamoUSD({ ...car, Price: priceUSD * 0.94 }, effectiveFx);
  const marchamoY3 = estimateMarchamoUSD({ ...car, Price: priceUSD * 0.88 }, effectiveFx);
  const marchamo3YrUSD = marchamoY1 + marchamoY2 + marchamoY3;

  const { depreciationUSD, depreciationPct, depreciationSource } = estimate3YrDepreciation(
    car,
    priceUSD,
    powertrain,
    depCurve,
  );

  const estimatedResaleUSD = Math.max(0, Math.round(priceUSD - depreciationUSD));
  const netTco3YrUSD = transferUSD + marchamo3YrUSD + energy3YrUSD + depreciationUSD;

  return {
    fxRate: effectiveFx,
    monthlyKm: effectiveKm,
    powertrain,
    consumption,
    tariffCRC,
    transferUSD,
    marchamo3YrUSD,
    energy3YrUSD,
    energy3YrCRC,
    monthlyEnergyUSD,
    depreciationUSD,
    depreciationPct,
    depreciationSource,
    estimatedResaleUSD,
    netTco3YrUSD,
    netTco3YrCRC: Math.round(netTco3YrUSD * effectiveFx),
    netMonthlyTcoUSD: Math.round(netTco3YrUSD / 36),
  };
};
