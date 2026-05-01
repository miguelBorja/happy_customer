import React, { useState, useEffect } from 'react';
import CarsPage from './pages/CarsPage';
import TopCarsPage from './pages/TopCarsPage';
import { fetchStats } from './api/client';

function App() {
  const [activeTab, setActiveTab] = useState('browse');
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0 });

  useEffect(() => {
    fetchStats().then(setStats).catch(console.error);
    
    // Poll stats every 30 seconds
    const interval = setInterval(() => {
      fetchStats().then(setStats).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

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
          </div>
        </div>
      </nav>

      <main className="main-content">
        {activeTab === 'browse' ? <CarsPage /> : <TopCarsPage />}
      </main>
    </div>
  );
}

export default App;
