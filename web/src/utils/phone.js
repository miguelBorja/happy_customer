// Seller phone helpers.
// `SellerPhone` comes from Crautos as free text, often with several numbers, e.g.
//   "6300-4353     8314-5866"  or  "2290-0505     Ext.     6371     7215"
// Costa Rica numbers have 8 digits; mobiles start with 6, 7 or 8 (WhatsApp-capable),
// landlines start with 2 (call only).

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

/** wa.me link with a prefilled message about the car. */
export const buildWhatsAppLink = (phone, car, language = 'es') => {
  if (!phone) return null;
  const subject = [car?.Title, car?.Year].filter(Boolean).join(' ');
  const text = language === 'es'
    ? `Hola, vi su ${subject} en Crautos (${car?.URL || ''}). ¿Todavía está disponible?`
    : `Hi, I saw your ${subject} on Crautos (${car?.URL || ''}). Is it still available?`;
  return `https://wa.me/${CR_COUNTRY_CODE}${phone.digits}?text=${encodeURIComponent(text)}`;
};

export const buildTelLink = (phone) => (phone ? `tel:+${CR_COUNTRY_CODE}${phone.digits}` : null);
