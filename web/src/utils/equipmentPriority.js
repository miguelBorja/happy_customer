// Priority ordering for car equipment/features.
// Used to surface the most desirable features first on the car card and
// to highlight the top "featured" ones with a distinct visual style.

export const FEATURED_EQUIPMENTS = [
  'Apple CarPlay',
  'Android Auto',
  'Cámara 360',
  'Sunroof/techo panorámico',
  'Cámara de retroceso',
  'Tapicería de cuero',
  'Llave inteligente/botón de arranque',
  'Turbo',
  'Control crucero',
  'Asientos eléctricos',
  'Asiento con memoria',
  'Sensores frontales',
  'Sensores de retroceso',
  'Control de descenso',
  'Aire acondicionado climatizado',
  'Luces de Xenón/Bixenón',
  'Caja de cambios dual',
  'Retrovisores auto-retractibles',
  'Control electrónico de estabilidad',
  'Aros de lujo',
  'Bluetooth',
  'Sensor de lluvia',
  'Revisión Técnica al día',
];

// The top-tier featured features get a highlighted pill style on the cards.
export const TOP_FEATURED_SET = new Set(FEATURED_EQUIPMENTS.slice(0, 8));

export const isFeaturedEquipment = (eq) => TOP_FEATURED_SET.has(eq);

const priorityIndex = (eq) => {
  const idx = FEATURED_EQUIPMENTS.indexOf(eq);
  return idx === -1 ? FEATURED_EQUIPMENTS.length : idx;
};

// Accepts an object map (car.Equipments) or an array of strings and returns a
// new array of equipment keys sorted by featured priority. Unknown keys come
// last, ordered alphabetically (Spanish locale).
export const sortEquipments = (equipments) => {
  if (!equipments) return [];

  let items;
  if (Array.isArray(equipments)) {
    items = equipments.filter(Boolean);
  } else {
    items = Object.keys(equipments).filter((key) => equipments[key]);
  }

  const unknownIndex = FEATURED_EQUIPMENTS.length;
  return items.slice().sort((a, b) => {
    const ia = priorityIndex(a);
    const ib = priorityIndex(b);
    if (ia !== ib) return ia - ib;
    if (ia === unknownIndex) return a.localeCompare(b, 'es');
    return 0;
  });
};
