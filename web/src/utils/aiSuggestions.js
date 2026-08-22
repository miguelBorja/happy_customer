/**
 * aiSuggestions.js
 * Intelligent dynamic question generation engine for the Happy AI Advisor
 * Tailored specifically for the Costa Rican automotive market.
 */

const CHINESE_BRANDS = [
  'byd', 'geely', 'chery', 'haval', 'changan', 'great wall', 'jac', 'mg',
  'omoda', 'jetour', 'baic', 'dongfeng', 'forthing', 'kaiyi', 'maxus',
  'gac', 'zeekr', 'lynk & co', 'jmc', 'foton', 'dfsk', 'shineray'
];

const LUXURY_BRANDS = [
  'bmw', 'mercedes-benz', 'mercedes', 'audi', 'porsche', 'volvo',
  'land rover', 'lexus', 'jaguar', 'maserati', 'alfa romeo', 'lincoln', 'infiniti'
];

const POPULAR_RESALE_BRANDS = [
  'toyota', 'hyundai', 'suzuki', 'nissan', 'honda', 'mitsubishi', 'kia', 'isuzu', 'mazda'
];

/**
 * Normalizes text for matching
 */
const norm = (str) => (str || '').toString().toLowerCase().trim();

/**
 * Checks if vehicle has 4x4 or all-wheel drive
 */
const is4x4OrAllWheel = (car) => {
  if (!car) return false;
  const style = norm(car.Estilo);
  const title = norm(car.Title);
  const comment = norm(car.Comment);
  
  if (car.Equipments && (car.Equipments['4x4'] || car.Equipments['4X4'] || car.Equipments['Todo Terreno'] || car.Equipments['Doble Tracción'])) {
    return true;
  }
  if (style.includes('pick up') || style.includes('pickup')) return true;
  if (title.includes('4x4') || title.includes('awd') || title.includes('4wd') || title.includes('prado') || title.includes('hilux') || title.includes('jimny') || title.includes('d-max')) return true;
  if (comment.includes('4x4') || comment.includes('doble traccion') || comment.includes('doble tracción') || comment.includes('4wd')) return true;
  return false;
};

/**
 * Checks fuel type classification
 */
const getFuelType = (car) => {
  if (!car) return 'gasolina';
  const fuel = norm(car.Combustible);
  const title = norm(car.Title);
  const comment = norm(car.Comment);

  if (fuel.includes('eléctrico') || fuel.includes('electrico') || title.includes(' ev') || title.includes('electric') || comment.includes('100% electrico') || comment.includes('100% eléctrico')) {
    return 'electrico';
  }
  if (fuel.includes('híbrido') || fuel.includes('hibrido') || fuel.includes('hybrid') || title.includes('hybrid') || comment.includes('hibrido') || comment.includes('híbrido')) {
    return 'hibrido';
  }
  if (fuel.includes('diesel') || fuel.includes('diésel') || title.includes('diesel') || title.includes('diésel')) {
    return 'diesel';
  }
  if (fuel.includes('gas') || fuel.includes('glp') || fuel.includes('lp')) {
    return 'gas';
  }
  return 'gasolina';
};

/**
 * Returns dynamic suggestions tailored to the current AI state
 * @param {Object} options
 * @param {Array} options.attachedCars - All attached cars (if any)
 * @param {Object|null} options.car1 - First attached car (legacy fallback)
 * @param {Object|null} options.car2 - Second attached car (legacy fallback)
 * @param {string} options.language - 'es' or 'en'
 * @param {number} options.messageCount - Number of messages in active chat
 * @param {number} options.shuffleIndex - Rotation index for cycling questions
 * @returns {Array<{ id: string, icon: string, text: string }>}
 */
export function getDynamicSuggestions({
  attachedCars = [],
  car1 = null,
  car2 = null,
  language = 'es',
  messageCount = 0,
  shuffleIndex = 0
}) {
  const isEn = language === 'en';
  let pool = [];

  const cars = (attachedCars && attachedCars.length > 0)
    ? attachedCars
    : [car1, car2].filter(Boolean);

  const c1 = cars[0] || null;
  const c2 = cars[1] || null;

  // ==========================================
  // SCENARIO 1: MULTI-CAR (3+ CARS ATTACHED)
  // ==========================================
  if (cars.length >= 3) {
    const count = cars.length;

    // Full Ranking
    pool.push({
      id: 'multi-rank',
      icon: '🏆',
      text: isEn
        ? `How would you rank these ${count} cars from best to worst value for money?`
        : `¿Cómo rankearías estos ${count} autos del mejor al peor según precio-calidad?`
    });

    // Lowest 3-Year Maintenance & Marchamo
    pool.push({
      id: 'multi-cost',
      icon: '📋',
      text: isEn
        ? `Which of these ${count} has the lowest marchamo and spare parts costs in Costa Rica?`
        : `¿Cuál de estos ${count} tendrá los costos de marchamo y repuestos más bajos en Costa Rica?`
    });

    // Fuel Efficiency in GAM
    pool.push({
      id: 'multi-fuel',
      icon: '⛽',
      text: isEn
        ? `Which of these vehicles is the most fuel-efficient in heavy San José (GAM) traffic?`
        : `¿Cuál de estos vehículos es el más económico en consumo para presas de la GAM?`
    });

    // Resale & Agency Backing
    pool.push({
      id: 'multi-resale',
      icon: '📈',
      text: isEn
        ? `Which of these brands has the strongest resale value and agency support in Costa Rica?`
        : `¿Cuál de estas marcas tiene mejor reventa y mejor respaldo de agencia en Costa Rica?`
    });

    // First Elimination
    pool.push({
      id: 'multi-eliminate',
      icon: '❌',
      text: isEn
        ? `Which of these cars would you rule out first and why?`
        : `¿Cuál de estos carros descartarías primero y por qué motivo?`
    });

    // Terrain & Road Capability
    const has4x4OrSUV = cars.some(c => is4x4OrAllWheel(c) || norm(c.Estilo).includes('suv'));
    if (has4x4OrSUV) {
      pool.push({
        id: 'multi-terrain',
        icon: '🌲',
        text: isEn
          ? `Which of these handles rough Costa Rican roads and mountain trips best?`
          : `¿Cuál de estos autos es el más apto para calles en mal estado y paseos de montaña en CR?`
      });
    }

    // Reliability & Breakdown History
    pool.push({
      id: 'multi-reliability',
      icon: '🛡️',
      text: isEn
        ? `Which of these models has the most reliable mechanical track record in Costa Rica?`
        : `¿Cuál de estos modelos tiene el historial mecánico más confiable en Costa Rica?`
    });

    // Follow-up Negotiation
    if (messageCount > 0) {
      pool.push({
        id: 'multi-negotiation',
        icon: '💬',
        text: isEn
          ? `What specific purchase counteroffer do you recommend making for the top-ranked car?`
          : `¿Qué oferta concreta de compra me recomiendas hacer por el auto ganador?`
      });
    }
  }

  // ==========================================
  // SCENARIO 2: TWO CARS ATTACHED (HEAD-TO-HEAD)
  // ==========================================
  else if (cars.length === 2 && c1 && c2) {
    const brand1 = (c1.Brand || '').trim();
    const brand2 = (c2.Brand || '').trim();

    // Resale & Depreciation
    pool.push({
      id: 'cmp-resale',
      icon: '📈',
      text: isEn
        ? `Which has better resale value and slower depreciation in Costa Rica?`
        : `¿Cuál de los dos tiene mejor reventa y menor depreciación en Costa Rica?`
    });

    // Spare parts & Dealership backing
    pool.push({
      id: 'cmp-parts',
      icon: '⚙️',
      text: isEn
        ? `Which has cheaper spare parts and broader mechanic support in Costa Rica?`
        : `¿Cuál tiene repuestos más baratos y mayor disponibilidad de mecánicos en Costa Rica?`
    });

    // Fuel economy in GAM
    pool.push({
      id: 'cmp-fuel',
      icon: '⛽',
      text: isEn
        ? `Which is more fuel efficient in San José (GAM) heavy traffic?`
        : `¿Cuál rinde mejor y gasta menos combustible en las presas de la GAM?`
    });

    // Best overall value / Winner
    pool.push({
      id: 'cmp-winner',
      icon: '🏆',
      text: isEn
        ? `Based on price vs quality, which is the smarter buy between these two?`
        : `Según relación precio-calidad, ¿cuál es la compra más inteligente entre ambos?`
    });

    // 3-Year Ownership Cost
    pool.push({
      id: 'cmp-cost',
      icon: '📋',
      text: isEn
        ? `Which will have lower total maintenance, marchamo, and insurance costs over 3 years?`
        : `¿Cuál tendrá menor costo total de marchamo, seguro y mantenimiento a 3 años?`
    });

    // Off-road / Tough roads (if relevant)
    if (is4x4OrAllWheel(c1) || is4x4OrAllWheel(c2) || norm(c1.Estilo).includes('suv') || norm(c2.Estilo).includes('suv')) {
      pool.push({
        id: 'cmp-terrain',
        icon: '🌲',
        text: isEn
          ? `Which handles Costa Rican dirt roads, beach trips, and mountain terrain better?`
          : `¿Cuál se comporta mejor en caminos de lastre, paseos a la playa y montaña en Costa Rica?`
      });
    }

    // Reliability & Known mechanical flaws
    pool.push({
      id: 'cmp-reliability',
      icon: '🛡️',
      text: isEn
        ? `Which of these two models is known for fewer mechanical breakdown issues?`
        : `¿Cuál de estos dos modelos tiene mejor historial de confiabilidad y menos fallas?`
    });

    // Follow-up test drive / negotiation
    if (messageCount > 0) {
      pool.push({
        id: 'cmp-negotiation',
        icon: '💬',
        text: isEn
          ? `What specific inspection points and counteroffers do you recommend for each?`
          : `¿Qué puntos de inspección y qué contraoferta recomiendas hacer para cada uno?`
      });
    }
  }

  // ==========================================
  // SCENARIO 2: SINGLE CAR ATTACHED
  // ==========================================
  else if (car1) {
    const brand = (car1.Brand || '').trim();
    const brandLower = norm(brand);
    const model = (car1.Model || '').trim();
    const year = car1.Year || '';
    const nameStr = model ? `${brand} ${model}` : (car1.Title || brand || (isEn ? 'this car' : 'este auto'));
    const fuelType = getFuelType(car1);
    const is4x4 = is4x4OrAllWheel(car1);
    const km = car1.Kilometraje || 0;
    const isChinese = CHINESE_BRANDS.some(b => brandLower.includes(b));
    const isLuxury = LUXURY_BRANDS.some(b => brandLower.includes(b));
    const isPopular = POPULAR_RESALE_BRANDS.some(b => brandLower.includes(b));

    // Valuation & Price check
    if (car1.Price > 0) {
      pool.push({
        id: 'single-price',
        icon: '💰',
        text: isEn
          ? `Is $${car1.Price.toLocaleString()} a fair market price for a ${year} ${nameStr}?`
          : `¿Es $${car1.Price.toLocaleString()} un buen precio de mercado para un ${nameStr} ${year}?`
      });
    } else {
      pool.push({
        id: 'single-valuation',
        icon: '💰',
        text: isEn
          ? `What is the average market price in Costa Rica for a ${year} ${nameStr}?`
          : `¿Cuál es el precio promedio en el mercado de Costa Rica para un ${nameStr} ${year}?`
      });
    }

    // Powertrain & Fuel Specifics
    if (fuelType === 'electrico') {
      pool.push({
        id: 'single-ev-battery',
        icon: '🔋',
        text: isEn
          ? `What is the typical battery health degradation and real-world range in Costa Rica?`
          : `¿Cuál es la degradación típica de batería y la autonomía real en la topografía de Costa Rica?`
      });
      pool.push({
        id: 'single-ev-incentives',
        icon: '⚡',
        text: isEn
          ? `What tax exemptions, marchamo discounts, and charging options apply in CR?`
          : `¿Qué beneficios de marchamo, exoneración de impuestos y red de carga aplican en Costa Rica?`
      });
    } else if (fuelType === 'hibrido') {
      pool.push({
        id: 'single-hybrid-battery',
        icon: '🔋',
        text: isEn
          ? `How much does hybrid battery service cost and what is the real fuel savings in traffic?`
          : `¿Cuánto cuesta el mantenimiento de la batería híbrida y qué ahorro real da en presas?`
      });
    } else if (fuelType === 'diesel') {
      pool.push({
        id: 'single-diesel-care',
        icon: '🛢️',
        text: isEn
          ? `What turbo and diesel injector maintenance does this model require with local fuel?`
          : `¿Qué cuidados de turbo e inyección diésel requiere este modelo con el combustible nacional?`
      });
    } else {
      pool.push({
        id: 'single-gas-mpg',
        icon: '⛽',
        text: isEn
          ? `What is the real-world fuel consumption (km/liter) in Costa Rican city and highway driving?`
          : `¿Cuál es el rendimiento real de combustible (km/litro) en ciudad y carretera en Costa Rica?`
      });
    }

    // Brand Ecosystem Questions
    if (isChinese) {
      pool.push({
        id: 'single-chinese-parts',
        icon: '🏢',
        text: isEn
          ? `How is spare parts availability and dealership support for ${brand} in Costa Rica?`
          : `¿Qué tal la disponibilidad de repuestos y respaldo de agencia para ${brand} en Costa Rica?`
      });
      pool.push({
        id: 'single-chinese-resale',
        icon: '📉',
        text: isEn
          ? `How does ${brand} hold its resale value in Costa Rica compared to Japanese/Korean brands?`
          : `¿Cómo es la depreciación y reventa de ${brand} en Costa Rica frente a marcas tradicionales?`
      });
    } else if (isLuxury) {
      pool.push({
        id: 'single-luxury-costs',
        icon: '💳',
        text: isEn
          ? `What is the estimated annual budget for marchamo, insurance, and maintenance for this ${brand}?`
          : `¿Cuánto se gasta al año en marchamo, seguro y mantenimiento para este ${brand}?`
      });
    } else if (isPopular) {
      pool.push({
        id: 'single-resale-pop',
        icon: '📈',
        text: isEn
          ? `How fast does a ${nameStr} typically sell in Costa Rica and how easy is finding parts?`
          : `¿Qué tan rápida es la reventa de un ${nameStr} en Costa Rica y qué tan baratos son los repuestos?`
      });
    }

    // Transmission & Mechanical Check
    const trans = norm(car1.Transmision);
    if (trans.includes('auto') || trans.includes('cvt') || trans.includes('sec')) {
      pool.push({
        id: 'single-trans-check',
        icon: '⚙️',
        text: isEn
          ? `Are there any known automatic/CVT transmission vulnerabilities for this ${year} ${nameStr}?`
          : `¿Tiene esta transmisión automática/CVT fallas conocidas o mantenimientos delicados?`
      });
    }

    // 4x4 / Terrain capability
    if (is4x4) {
      pool.push({
        id: 'single-4x4-durability',
        icon: '🌲',
        text: isEn
          ? `How capable and durable is this 4x4 system for Costa Rican terrain and river crossings?`
          : `¿Qué tan duradero y capaz es el sistema 4x4 para caminos de lastre y cruces de ríos en Costa Rica?`
      });
    }

    // Mileage-based advisory
    if (km > 120000) {
      pool.push({
        id: 'single-high-mileage',
        icon: '🔧',
        text: isEn
          ? `What major preventative services (timing belt, suspension, water pump) are due at ${km.toLocaleString()} km?`
          : `¿Qué mantenimientos mayores (faja distribución, suspensión, bomba) tocan a los ${km.toLocaleString()} km?`
      });
    } else if (km > 0 && km < 45000) {
      pool.push({
        id: 'single-low-mileage',
        icon: '🔍',
        text: isEn
          ? `How can I verify the ${km.toLocaleString()} km odometer reading is authentic?`
          : `¿Cómo puedo verificar si los ${km.toLocaleString()} km del odómetro son reales o alterados?`
      });
    }

    // Inspection Checklist
    pool.push({
      id: 'single-inspection-guide',
      icon: '🛡️',
      text: isEn
        ? `What are the top 5 mechanical checkpoints to inspect before buying this ${nameStr}?`
        : `¿Cuáles son los 5 puntos mecánicos clave a revisar antes de comprar este ${nameStr}?`
    });

    // Dekra / RTV pass checklist (if older than 2016)
    if (year && year < 2016) {
      pool.push({
        id: 'single-dekra',
        icon: '📋',
        text: isEn
          ? `What common Dekra/RTV inspection issues should I check on a ${year} model?`
          : `¿Qué fallas comunes en Dekra/RTV (gases, frenos, rótulas) suelen tener autos de este año?`
      });
    }

    // Negotiation Strategy
    if (norm(car1.PrecioNegociable).includes('si') || norm(car1.PrecioNegociable).includes('sí') || car1.Price > 0) {
      pool.push({
        id: 'single-negotiate',
        icon: '💬',
        text: isEn
          ? `What is a reasonable counteroffer and negotiation strategy for this vehicle?`
          : `¿Cuánto sería una contraoferta razonable y cómo negociar el precio de este auto?`
      });
    }
  }

  // ==========================================
  // SCENARIO 3: NO CARS ATTACHED (MARKET MODE)
  // ==========================================
  else {
    // Budget picks
    pool.push({
      id: 'gen-budget-10k',
      icon: '💵',
      text: isEn
        ? `What are the best reliable used cars under $10,000 in Costa Rica?`
        : `¿Cuáles son los autos usados más confiables por menos de $10,000 en Costa Rica?`
    });

    // Best resale brands
    pool.push({
      id: 'gen-best-resale',
      icon: '📈',
      text: isEn
        ? `Which car brands and models hold the best resale value in Costa Rica?`
        : `¿Cuáles marcas y modelos tienen la mejor reventa y liquidez en Costa Rica?`
    });

    // Best 4x4 SUVs
    pool.push({
      id: 'gen-best-4x4',
      icon: '🌲',
      text: isEn
        ? `What are the most economical and durable 4x4 SUVs for Costa Rican roads?`
        : `¿Cuáles son las SUVs 4x4 más económicas en repuestos y duraderas para Costa Rica?`
    });

    // Dealerships & Parts networks
    pool.push({
      id: 'gen-agencies-parts',
      icon: '🏢',
      text: isEn
        ? `Which brands have the most accessible and affordable spare parts network in Costa Rica?`
        : `¿Qué agencias y marcas tienen los repuestos más baratos y fáciles de conseguir en el país?`
    });

    // Electric vs Hybrid evaluation
    pool.push({
      id: 'gen-ev-hybrid-cr',
      icon: '⚡',
      text: isEn
        ? `Is it worth buying a used electric or hybrid car in Costa Rica today?`
        : `¿Vale la pena comprar un vehículo eléctrico o híbrido usado en Costa Rica hoy?`
    });

    // First car buyer guide
    pool.push({
      id: 'gen-first-car',
      icon: '🚗',
      text: isEn
        ? `What is the best first car for city commuting and low gas consumption in CR?`
        : `¿Cuál es el mejor primer auto para presas diarias y bajo consumo de gasolina en CR?`
    });

    // Pre-purchase inspection & scam avoidance
    pool.push({
      id: 'gen-scams-check',
      icon: '🛡️',
      text: isEn
        ? `What common red flags or scams should I avoid when buying a used car in Costa Rica?`
        : `¿Qué estafas, gravámenes o problemas comunes debo evitar al comprar un auto usado en CR?`
    });

    // Legal transfer & Marchamo costs
    pool.push({
      id: 'gen-transfer-marchamo',
      icon: '📑',
      text: isEn
        ? `How much are legal transfer fees, lawyer stamps, and marchamo costs when buying a car in CR?`
        : `¿Cuánto se paga de traspaso legal, timbres notariales y marchamo al comprar un carro en CR?`
    });

    // Automatic transmission reliability
    pool.push({
      id: 'gen-auto-reliability',
      icon: '⚙️',
      text: isEn
        ? `Which used automatic and CVT cars are known to be trouble-free in Costa Rica?`
        : `¿Cuáles cajas automáticas o CVT usadas son las más duraderas y sin fallas en el país?`
    });
  }

  // If chat already has history, append contextual follow-ups to pool
  if (messageCount > 0 && pool.length < 10) {
    pool.push({
      id: 'follow-seller-questions',
      icon: '💬',
      text: isEn
        ? `What are the top 3 questions I should ask the seller right now?`
        : `¿Cuáles son las 3 preguntas clave que debería hacerle al vendedor en este momento?`
    });
    pool.push({
      id: 'follow-test-drive',
      icon: '🚦',
      text: isEn
        ? `What specific red flags should I listen and look for during a test drive?`
        : `¿Qué ruidos o señales de alerta debo vigilar durante la prueba de manejo?`
    });
  }

  // Ensure unique by text
  const uniquePool = [];
  const seenTexts = new Set();
  for (const item of pool) {
    if (!seenTexts.has(item.text)) {
      seenTexts.add(item.text);
      uniquePool.push(item);
    }
  }

  if (uniquePool.length === 0) return [];

  // Slice 3 items using shuffleIndex offset
  const count = 3;
  const startIndex = (Math.abs(shuffleIndex) * count) % uniquePool.length;
  const result = [];
  
  for (let i = 0; i < Math.min(count, uniquePool.length); i++) {
    const idx = (startIndex + i) % uniquePool.length;
    result.push(uniquePool[idx]);
  }

  return result;
}
