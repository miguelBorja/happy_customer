import React, { useState, useEffect, useCallback } from 'react';
import { fetchCars, fetchBrands } from '../api/client';

const TopCarsPage = () => {
  const [cars, setCars] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [topParams, setTopParams] = useState({
    limit: '10',
    sortBy: 'price',
    sortDesc: 'false',
    brand: '',
    isSold: 'false'
  });

  useEffect(() => {
    fetchBrands().then(setBrands).catch(console.error);
  }, []);

  const loadCars = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCars(topParams);
      setCars(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [topParams]);

  useEffect(() => {
    loadCars();
  }, [loadCars]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTopParams(p => ({ ...p, [name]: value }));
  };

  return (
    <div className="top-cars-page" style={{ paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Top {topParams.limit} Cars</h2>
          <p style={{ color: 'var(--text-muted)' }}>Custom query to rank the best cars available.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="filter-group">
            <label>Brand</label>
            <select name="brand" className="select-field" value={topParams.brand} onChange={handleChange}>
              <option value="">All Brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          
          <div className="filter-group">
            <label>Limit</label>
            <select name="limit" className="select-field" value={topParams.limit} onChange={handleChange}>
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="20">Top 20</option>
              <option value="50">Top 50</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Sort By</label>
            <select name="sortBy" className="select-field" value={topParams.sortBy} onChange={handleChange}>
              <option value="price">Price</option>
              <option value="year">Year</option>
              <option value="kilometraje">Mileage</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Order</label>
            <select name="sortDesc" className="select-field" value={topParams.sortDesc} onChange={handleChange}>
              <option value="false">Ascending (Low to High)</option>
              <option value="true">Descending (High to Low)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="table-container">
        {loading && <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}><div className="loader"></div></div>}
        
        {!loading && cars.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Title</th>
                <th>Brand</th>
                <th>Year</th>
                <th>Price ($)</th>
                <th>Mileage (km)</th>
                <th>Transmission</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car, idx) => (
                <tr key={car.URL}>
                  <td style={{ fontWeight: 'bold', color: 'var(--accent)' }}>#{idx + 1}</td>
                  <td style={{ fontWeight: '500' }}>{car.Title}</td>
                  <td>{car.Brand}</td>
                  <td>{car.Year}</td>
                  <td style={{ color: 'var(--success)', fontWeight: '600' }}>
                    {car.Price > 0 ? `$${car.Price.toLocaleString()}` : car.PriceText}
                  </td>
                  <td>{car.Kilometraje > 0 ? car.Kilometraje.toLocaleString() : 'N/A'}</td>
                  <td>{car.Transmision}</td>
                  <td>
                    <a href={car.URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        
        {!loading && cars.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
            No cars found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
};

export default TopCarsPage;
