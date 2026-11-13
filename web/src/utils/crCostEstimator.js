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
