const BASE_URL = 'http://localhost:8080/api';

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

export const fetchBrands = async () => {
  const res = await fetch(`${BASE_URL}/brands`);
  if (!res.ok) throw new Error('Failed to fetch brands');
  return res.json();
};

export const fetchStats = async () => {
  const res = await fetch(`${BASE_URL}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
};
