import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { compareWithAI } from '../api/client';
import { useFavorites } from '../hooks/useFavorites';

function renderMarkdown(text) {
  if (!text) return '';
  
  // HTML Escape
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // Headings
  html = html
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Italics: *text* or _text_
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Group bullet lists (* or - followed by space)
  const lines = html.split('\n');
  let inList = false;
  const processedLines = [];
  
  for (let line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[\*\-]\s+(.+)$/);
    
    if (bulletMatch) {
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }
      processedLines.push(`<li>${bulletMatch[1]}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) {
    processedLines.push('</ul>');
  }
  
  html = processedLines.join('\n');
  
  // Add newlines/breaks safely
  html = html
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
    
  // Clean up breaks around lists
  html = html
    .replace(/<\/ul><br\/>/g, '</ul>')
    .replace(/<\/li><br\/>/g, '</li>')
    .replace(/<ul><br\/>/g, '<ul>')
    .replace(/<br\/><ul>/g, '<ul>')
    .replace(/<br\/><br\/><ul>/g, '<ul>');

  return html;
}

const formatPrice = (price, text) => {
  if (price > 0) return `$${price.toLocaleString()}`;
  return text || 'N/A';
};

function detectWinner(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  
  // 1. Precise declaration patterns
  const declRegexes = [
    /(?:ganador|winner)\s*:\s*(?:carro|car)\s*([12])/i,
    /(?:carro|car)\s*([12]).*?es\s+el\s+ganador/i,
    /(?:carro|car)\s*([12]).*?is\s+the\s+winner/i,
    /el\s+ganador\s+es\s+(?:el\s+)?(?:carro|car)\s*([12])/i,
    /the\s+winner\s+is\s+(?:the\s+)?(?:carro|car)\s*([12])/i,
    /ganador\s*=>\s*(?:carro|car)\s*([12])/i,
    /winner\s*=>\s*(?:carro|car)\s*([12])/i
  ];

  for (const regex of declRegexes) {
    const match = lower.match(regex);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  // 2. First mentioned car in the winner section (Section 4)
  const lastSecIndex = lower.lastIndexOf('4.');
  if (lastSecIndex !== -1) {
    const secText = lower.substring(lastSecIndex);
    const idx1 = Math.min(
      secText.indexOf("carro 1") === -1 ? Infinity : secText.indexOf("carro 1"),
      secText.indexOf("car 1") === -1 ? Infinity : secText.indexOf("car 1")
    );
    const idx2 = Math.min(
      secText.indexOf("carro 2") === -1 ? Infinity : secText.indexOf("carro 2"),
      secText.indexOf("car 2") === -1 ? Infinity : secText.indexOf("car 2")
    );
    if (idx1 !== Infinity || idx2 !== Infinity) {
      return idx1 < idx2 ? 1 : 2;
    }
  }

  // 3. Proximity fallback around key words "ganador" / "winner"
  const winIndex = Math.max(lower.lastIndexOf("ganador"), lower.lastIndexOf("winner"));
  if (winIndex !== -1) {
    const context = lower.substring(Math.max(0, winIndex - 40), Math.min(lower.length, winIndex + 40));
    const match = context.match(/(?:carro|car)\s*([12])/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

const CompareModal = ({ isOpen, onClose, car1, car2 }) => {
  const { language, t } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [aiResponse, setAiResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('specs'); // 'specs' or 'ai'
  const aiPanelRef = useRef(null);
  const abortRef = useRef(null);

  const winner = detectWinner(aiResponse);

  // Lock body scroll & Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      document.addEventListener('keydown', handleKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Reset state when cars change
  useEffect(() => {
    if (isOpen) {
      setAiResponse('');
      setError('');
      setIsGenerating(false);
      setActiveTab('specs');
    }
  }, [isOpen, car1?.URL, car2?.URL]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // Auto-scroll AI response
  useEffect(() => {
    if (aiPanelRef.current && isGenerating) {
      aiPanelRef.current.scrollTop = aiPanelRef.current.scrollHeight;
    }
  }, [aiResponse, isGenerating]);

  const handleGenerate = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setIsGenerating(true);
    setAiResponse('');
    setError('');

    try {
      await compareWithAI(car1, car2, language, (chunk) => {
        setAiResponse(prev => prev + chunk);
      }, abortRef.current.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || t('aiError'));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [car1, car2, language, t]);

  // Auto-generate AI analysis on tab activation
  useEffect(() => {
    if (activeTab === 'ai' && !aiResponse && !isGenerating && !error) {
      handleGenerate();
    }
  }, [activeTab, aiResponse, isGenerating, error, handleGenerate]);

  if (!isOpen || !car1 || !car2) return null;

  // Determine "better" values (1=car1, 2=car2, 0=tie)
  const betterPrice = car1.Price > 0 && car2.Price > 0
    ? (car1.Price < car2.Price ? 1 : car1.Price > car2.Price ? 2 : 0) : 0;
  const betterYear = car1.Year > car2.Year ? 1 : car1.Year < car2.Year ? 2 : 0;
  const betterKm = car1.Kilometraje > 0 && car2.Kilometraje > 0
    ? (car1.Kilometraje < car2.Kilometraje ? 1 : car1.Kilometraje > car2.Kilometraje ? 2 : 0) : 0;

  const car1Equips = car1.Equipments || {};
  const car2Equips = car2.Equipments || {};

  const unionEquipment = [...new Set([
    ...Object.keys(car1Equips),
    ...Object.keys(car2Equips)
  ])];

  const differences = unionEquipment
    .filter(eq => !car1Equips[eq] || !car2Equips[eq])
    .sort((a, b) => a.localeCompare(b, language));

  const shared = unionEquipment
    .filter(eq => car1Equips[eq] && car2Equips[eq])
    .sort((a, b) => a.localeCompare(b, language));

  const allEquipment = [...differences, ...shared];

  const car1EquipCount = Object.keys(car1Equips).length;
  const car2EquipCount = Object.keys(car2Equips).length;
  const betterEquip = car1EquipCount > car2EquipCount ? 1 : car1EquipCount < car2EquipCount ? 2 : 0;

  const specRows = [
    { label: t('priceHeader'), v1: formatPrice(car1.Price, car1.PriceText), v2: formatPrice(car2.Price, car2.PriceText), better: betterPrice },
    { label: t('mileageHeader'), v1: car1.Kilometraje > 0 ? `${car1.Kilometraje.toLocaleString()} km` : 'N/A', v2: car2.Kilometraje > 0 ? `${car2.Kilometraje.toLocaleString()} km` : 'N/A', better: betterKm },
    { label: t('transmission'), v1: car1.Transmision || 'N/A', v2: car2.Transmision || 'N/A' },
    { label: t('fuel'), v1: car1.Combustible || 'N/A', v2: car2.Combustible || 'N/A' },
    { label: t('province'), v1: car1.Provincia || 'N/A', v2: car2.Provincia || 'N/A' },
    { label: t('equipment'), v1: `${car1EquipCount}`, v2: `${car2EquipCount}`, better: betterEquip },
  ];

  return (
    <div className="compare-modal-overlay" onClick={onClose}>
      <div className="compare-modal" onClick={e => e.stopPropagation()}>
        <div className="compare-modal-header">
          <h2>🤖 {t('compareTitle')}</h2>
          <button className="compare-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="compare-modal-tabs">
          <button 
            className={`compare-tab-btn ${activeTab === 'specs' ? 'active' : ''}`}
            onClick={() => setActiveTab('specs')}
          >
            ⚙️ {t('equipment')}
          </button>
          <button 
            className={`compare-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            🧠 {t('aiAnalysis')}
          </button>
        </div>

        <div className="compare-modal-body">
          {activeTab === 'specs' ? (
            <>
              {/* Side-by-side specs */}
              <div className="compare-grid">
                <div className="compare-grid-header">
                  <div className="compare-label-header"></div>
                  <div className={`compare-car-name car-a ${winner === 1 ? 'winner-highlight' : ''}`} title={car1.Title}>
                    <button
                      className={`fav-btn-compare ${isFavorite(car1.URL) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(car1.URL)}
                      title={isFavorite(car1.URL) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorite(car1.URL) ? '★' : '☆'}
                    </button>
                    <span className="compare-name-main">{car1.Title}</span>
                    <span className={`compare-year-badge ${betterYear === 1 ? 'better' : betterYear === 2 ? 'worse' : ''}`}>
                      {car1.Year}
                      {betterYear === 1 && <span className="better-badge">✓</span>}
                    </span>
                    {winner === 1 && <span className="winner-grid-badge">👑 {t('winnerLabel')}</span>}
                  </div>
                  <div className={`compare-car-name car-b ${winner === 2 ? 'winner-highlight' : ''}`} title={car2.Title}>
                    <button
                      className={`fav-btn-compare ${isFavorite(car2.URL) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(car2.URL)}
                      title={isFavorite(car2.URL) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorite(car2.URL) ? '★' : '☆'}
                    </button>
                    <span className="compare-name-main">{car2.Title}</span>
                    <span className={`compare-year-badge ${betterYear === 2 ? 'better' : betterYear === 1 ? 'worse' : ''}`}>
                      {car2.Year}
                      {betterYear === 2 && <span className="better-badge">✓</span>}
                    </span>
                    {winner === 2 && <span className="winner-grid-badge">👑 {t('winnerLabel')}</span>}
                  </div>
                </div>
                {specRows.map((row, idx) => (
                  <div key={idx} className={`compare-row ${idx % 2 === 0 ? 'even' : ''}`}>
                    <div className="compare-label">{row.label}</div>
                    <div className={`compare-value ${row.better === 1 ? 'better' : row.better === 2 ? 'worse' : ''}`}>
                      {row.v1}
                      {row.better === 1 && <span className="better-badge">✓</span>}
                    </div>
                    <div className={`compare-value ${row.better === 2 ? 'better' : row.better === 1 ? 'worse' : ''}`}>
                      {row.v2}
                      {row.better === 2 && <span className="better-badge">✓</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Equipment comparison */}
              {allEquipment.length > 0 && (
                <div className="equip-compare-section">
                  <h3 className="equip-compare-title">⚙️ {t('equipment')}</h3>
                  <div className="equip-compare-grid">
                    {allEquipment.map(eq => (
                      <div key={eq} className="equip-compare-row">
                        <span className="equip-compare-name">{t(eq)}</span>
                        <span className={`equip-indicator ${(car1.Equipments || {})[eq] ? 'has' : 'missing'}`}>
                          {(car1.Equipments || {})[eq] ? '✅' : '❌'}
                        </span>
                        <span className={`equip-indicator ${(car2.Equipments || {})[eq] ? 'has' : 'missing'}`}>
                          {(car2.Equipments || {})[eq] ? '✅' : '❌'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* AI Analysis Panel */
            <div className="ai-panel">
              <div className="ai-panel-header">
                <h3>🧠 {t('aiAnalysis')}</h3>
                {(isGenerating || error) && (
                  <button
                    className={`ai-generate-btn ${isGenerating ? 'generating' : ''}`}
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <><span className="ai-spinner"></span> {t('aiGenerating')}</>
                    ) : (
                      <>🔄 {t('aiRegenerate')}</>
                    )}
                  </button>
                )}
              </div>

              {/* Car mapping legend */}
              <div className="ai-legend">
                <div className={`ai-legend-item car-a ${winner === 1 ? 'winner-highlight' : ''}`}>
                  <span className="legend-dot">🔵</span>
                  <span className="legend-label">
                    <strong>{t('car1Label')}:</strong>
                    <button
                      className={`fav-btn-compare ${isFavorite(car1.URL) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(car1.URL)}
                      title={isFavorite(car1.URL) ? 'Remove from favorites' : 'Add to favorites'}
                      style={{ fontSize: '1.15rem' }}
                    >
                      {isFavorite(car1.URL) ? '★' : '☆'}
                    </button>
                    <a href={car1.URL} target="_blank" rel="noreferrer" className="legend-link">
                      {car1.Title} ({car1.Year})
                    </a>
                  </span>
                  {winner === 1 && <span className="winner-tag">🏆 {t('winnerLabel')}</span>}
                </div>
                <div className={`ai-legend-item car-b ${winner === 2 ? 'winner-highlight' : ''}`}>
                  <span className="legend-dot">🟣</span>
                  <span className="legend-label">
                    <strong>{t('car2Label')}:</strong>
                    <button
                      className={`fav-btn-compare ${isFavorite(car2.URL) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(car2.URL)}
                      title={isFavorite(car2.URL) ? 'Remove from favorites' : 'Add to favorites'}
                      style={{ fontSize: '1.15rem' }}
                    >
                      {isFavorite(car2.URL) ? '★' : '☆'}
                    </button>
                    <a href={car2.URL} target="_blank" rel="noreferrer" className="legend-link">
                      {car2.Title} ({car2.Year})
                    </a>
                  </span>
                  {winner === 2 && <span className="winner-tag">🏆 {t('winnerLabel')}</span>}
                </div>
              </div>

              {error && <div className="ai-error">{error}</div>}

              {aiResponse && (
                <div className="ai-response" ref={aiPanelRef}>
                  <div
                    className="ai-content"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(aiResponse) }}
                  />
                  {isGenerating && <span className="ai-cursor">▊</span>}
                </div>
              )}

              {!aiResponse && !error && (
                <div className="ai-placeholder">
                  <span className="ai-placeholder-icon" style={{ animation: 'aiPlaceholderFloat 1.5s ease-in-out infinite' }}>🤖</span>
                  <p>{t('aiGenerating')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompareModal;
