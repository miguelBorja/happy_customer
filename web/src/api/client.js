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

export const compareWithAI = async (car1, car2, language, onChunk, signal) => {
  const res = await fetch(`${BASE_URL}/ai/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ car1, car2, language }),
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
