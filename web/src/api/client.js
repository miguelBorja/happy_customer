const BASE_URL = '/api';

export const fetchCars = async (filters) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        if (value.length > 0) params.append(key, value.join(','));
      } else {
        params.append(key, value);
      }
    }
  }
  
  const res = await fetch(`${BASE_URL}/cars?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch cars');
  return res.json();
};

export const fetchBargains = async () => {
  const res = await fetch(`${BASE_URL}/bargains`);
  if (!res.ok) throw new Error('Failed to fetch bargains');
  return res.json();
};

export const fetchBrands = async () => {
  const res = await fetch(`${BASE_URL}/brands`);
  if (!res.ok) throw new Error('Failed to fetch brands');
  return res.json();
};

export const fetchProvinces = async () => {
  const res = await fetch(`${BASE_URL}/provinces`);
  if (!res.ok) throw new Error('Failed to fetch provinces');
  return res.json();
};

export const fetchTopSellers = async () => {
  const res = await fetch(`${BASE_URL}/sellers/top`);
  if (!res.ok) throw new Error('Failed to fetch top sellers');
  return res.json();
};

export const fetchFilteredBrands = async (filters) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) {
      params.append(key, value);
    }
  }
  const res = await fetch(`${BASE_URL}/brands/filtered?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch filtered brands');
  return res.json();
};

export const fetchStats = async () => {
  const res = await fetch(`${BASE_URL}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
};

export const recordVisit = async (path = '/') => {
  const res = await fetch(`${BASE_URL}/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to record visit');
  return res.json();
};

export const fetchCarsByUrls = async (urls) => {
  const res = await fetch(`${BASE_URL}/cars/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error('Failed to fetch favorites');
  return res.json();
};

export const compareWithAI = async (carsOrCar1, car2OrLang, langOrMessages, messagesOrOnChunk, onChunkOrSignal, optionalSignal) => {
  let cars = [];
  let language = 'es';
  let messages = [];
  let onChunk = () => {};
  let signal = undefined;

  if (Array.isArray(carsOrCar1)) {
    cars = carsOrCar1.filter(Boolean);
    language = typeof car2OrLang === 'string' ? car2OrLang : 'es';
    messages = Array.isArray(langOrMessages) ? langOrMessages : [];
    if (typeof messagesOrOnChunk === 'function') {
      onChunk = messagesOrOnChunk;
      signal = onChunkOrSignal;
    } else {
      onChunk = onChunkOrSignal || (() => {});
      signal = optionalSignal;
    }
  } else {
    const car1 = carsOrCar1 || null;
    const car2 = (car2OrLang && typeof car2OrLang === 'object') ? car2OrLang : null;
    if (car1) cars.push(car1);
    if (car2) cars.push(car2);
    language = typeof langOrMessages === 'string' ? langOrMessages : (typeof car2OrLang === 'string' ? car2OrLang : 'es');

    if (typeof messagesOrOnChunk === 'function') {
      // Legacy signature: compareWithAI(car1, car2, language, onChunk, signal)
      onChunk = messagesOrOnChunk;
      signal = onChunkOrSignal;
    } else {
      // Signature: compareWithAI(car1, car2, language, messages, onChunk, signal)
      messages = Array.isArray(messagesOrOnChunk) ? messagesOrOnChunk : (Array.isArray(langOrMessages) ? langOrMessages : []);
      onChunk = onChunkOrSignal || (() => {});
      signal = optionalSignal;
    }
  }

  const res = await fetch(`${BASE_URL}/ai/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cars,
      car1: cars[0] || null,
      car2: cars[1] || null,
      language,
      messages,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || 'Failed to compare cars');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    const lines = text.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onChunk(content);
          }
        } catch (e) {
          // Ignore partial JSON chunks
        }
      }
    }
  }
};

export const fetchDetailedStats = async () => {
  const res = await fetch(`${BASE_URL}/stats/detailed`);
  if (!res.ok) throw new Error('Failed to fetch detailed stats');
  return res.json();
};
