import React, { useState, useEffect } from 'react';
import CarsPage from './pages/CarsPage';
import TopCarsPage from './pages/TopCarsPage';
import FavoritesPage from './pages/FavoritesPage';
import { fetchStats } from './api/client';
import { useFavorites } from './hooks/useFavorites';

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0 });
  const { favCount } = useFavorites();

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
    
    // Poll stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats().then(setStats).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderPage = () => {
    switch (activeTab) {
      case 'top': return <TopCarsPage />;
      case 'favorites': return <FavoritesPage />;
      default: return <CarsPage />;
    }
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="logo" onClick={() => setActiveTab('browse')}>
          CrautosDB
        </div>
        
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--success)' }}>{stats.active}</span> Active
            <span style={{ margin: '0 0.5rem' }}>•</span>
            <span style={{ color: 'var(--danger)' }}>{stats.sold}</span> Sold
          </div>
          
          <div className="nav-links">
            <button 
              className={activeTab === 'browse' ? 'active' : ''} 
              onClick={() => setActiveTab('browse')}
            >
              Browse Cars
            </button>
            <button 
              className={activeTab === 'top' ? 'active' : ''} 
              onClick={() => setActiveTab('top')}
            >
              Top Cars
            </button>
            <button 
              className={`${activeTab === 'favorites' ? 'active' : ''} nav-fav-btn`}
              onClick={() => setActiveTab('favorites')}
            >
              <span style={{ color: '#fbbf24' }}>★</span> Favorites
              {favCount > 0 && <span className="nav-fav-count">{favCount}</span>}
            </button>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
