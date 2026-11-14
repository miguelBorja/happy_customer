// Seller phone helpers.
// `SellerPhone` comes from Crautos as free text, often with several numbers, e.g.
//   "6300-4353     8314-5866"  or  "2290-0505     Ext.     6371     7215"
// Costa Rica numbers have 8 digits; mobiles start with 6, 7 or 8 (WhatsApp-capable),
// landlines start with 2 (call only).

import { translate } from '../translations';

const CR_COUNTRY_CODE = '506';

/** Returns [{ digits: '83145866', display: '8314-5866', mobile: true }, ...] (deduplicated). */
export const parsePhones = (raw) => {
  if (!raw) return [];
  const matches = String(raw).match(/(?:\+?506[\s-]?)?\d{4}[\s-]?\d{4}/g) || [];
  const seen = new Set();
  const phones = [];
  matches.forEach((m) => {
    const digits = m.replace(/\D/g, '').replace(/^506(?=\d{8}$)/, '');
    if (digits.length !== 8 || seen.has(digits)) return;
    seen.add(digits);
    phones.push({
      digits,
      display: `${digits.slice(0, 4)}-${digits.slice(4)}`,
      mobile: /^[678]/.test(digits),
    });
  });
  return phones;
};

/** First WhatsApp-capable (mobile) number, or null. */
export const getWhatsAppPhone = (raw) => parsePhones(raw).find((p) => p.mobile) || null;

const INTENT_KEY_MAP = {
  availability: 'whatsappPreFill',
  cash: 'whatsappPreFillCash',
  tradeIn: 'whatsappPreFillTradeIn',
};

/** wa.me link with a prefilled message about the car and optional intent ('availability' | 'cash' | 'tradeIn'). */
export const buildWhatsAppLink = (phone, car, language = 'es', intent = 'availability') => {
  if (!phone) return null;
  const subject = [car?.Title, car?.Year].filter(Boolean).join(' ');
  const key = INTENT_KEY_MAP[intent] || 'whatsappPreFill';
  const text = translate(language, key, { subject, url: car?.URL || '' });
  return `https://wa.me/${CR_COUNTRY_CODE}${phone.digits}?text=${encodeURIComponent(text)}`;
};

/** Builds a WhatsApp share link summarizing the compared cars and a shareable compare URL. */
export const buildComparisonWhatsAppLink = (cars, shareUrl, language = 'es') => {
  if (!Array.isArray(cars) || cars.length === 0) return null;
  const header = translate(language, 'compareWhatsAppMsgHeader');
  const lines = cars.map((car) => {
    const price = car?.Price > 0 ? `$${Math.round(car.Price).toLocaleString('en-US')}` : '—';
    const rawKm = car?.Kilometraje ?? car?.Mileage ?? 0;
    const km = rawKm > 0 ? `${Math.round(rawKm).toLocaleString('en-US')} km` : '—';
    return translate(language, 'compareWhatsAppMsgItem', {
      title: car?.Title || '—',
      year: car?.Year || '—',
      price,
      km,
    });
  });
  const body = [header, ...lines, shareUrl].filter(Boolean).join('\n');
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
};

export const buildTelLink = (phone) => (phone ? `tel:+${CR_COUNTRY_CODE}${phone.digits}` : null);

/** wa.me link with an arbitrary custom draft message (e.g., drafted by Copilot Negotiator). */
export const buildCustomWhatsAppLink = (phone, message) => {
  if (!phone?.digits) return null;
  const text = String(message || '').trim();
  if (!text) return null;
  return `https://wa.me/${CR_COUNTRY_CODE}${phone.digits}?text=${encodeURIComponent(text)}`;
};
