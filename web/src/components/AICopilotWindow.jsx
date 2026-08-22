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

const AICopilotWindow = ({
  isOpen,
  onClose,
  attachedCars = [],
  onAddCar,
  onRemoveCar,
  onClearCars,
  isMinimized,
  onToggleMinimize,
  isExpanded,
  onToggleExpand
}) => {
  const { language, t } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isDragOverWindow, setIsDragOverWindow] = useState(false);
  
  const chatScrollRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const car1 = attachedCars[0] || null;
  const car2 = attachedCars[1] || null;

  const initialComparison = chatMessages.find(m => m.role === 'assistant')?.content || '';
  const winner = detectWinner(initialComparison);

  // Auto-scroll AI response
  useEffect(() => {
    if (chatScrollRef.current && isGenerating) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isGenerating]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Reset error when cars change
  const lastCarsRef = useRef('');
  useEffect(() => {
    const currentKey = `${car1?.URL || ''}_${car2?.URL || ''}`;
    if (lastCarsRef.current !== currentKey && lastCarsRef.current !== '') {
      if (chatMessages.length > 0) {
        setError('');
      }
    }
    lastCarsRef.current = currentKey;
  }, [car1?.URL, car2?.URL, chatMessages.length]);

  const handleGenerateComparison = useCallback(async () => {
    if (!car1 || isGenerating) return;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setIsGenerating(true);
    setError('');

    const initialMsgId = `asst-init-${Date.now()}`;
    setChatMessages([{ id: initialMsgId, role: 'assistant', content: '' }]);

    try {
      await compareWithAI(car1, car2, language, [], (chunk) => {
        setChatMessages(prev => {
          if (prev.length === 0) return [{ id: initialMsgId, role: 'assistant', content: chunk }];
          const updated = [...prev];
          updated[0] = { ...updated[0], content: updated[0].content + chunk };
          return updated;
        });
      }, abortRef.current.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || t('aiError'));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [car1, car2, language, isGenerating, t]);

  const handleSendQuestion = async (queryText) => {
    const textToSend = (queryText || inputText).trim();
    if (!textToSend || isGenerating) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const userMsgId = `user-${Date.now()}`;
    const asstMsgId = `asst-${Date.now()}`;

    const newUserMsg = { id: userMsgId, role: 'user', content: textToSend };
    const newAsstMsg = { id: asstMsgId, role: 'assistant', content: '' };

    const updatedHistory = [...chatMessages, newUserMsg];
    setChatMessages([...updatedHistory, newAsstMsg]);
    setInputText('');
    setIsGenerating(true);
    setError('');

    const historyPayload = updatedHistory.map(m => ({
      role: m.role,
      content: m.content
    }));

    try {
      await compareWithAI(car1, car2, language, historyPayload, (chunk) => {
        setChatMessages(prev => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (lastIdx >= 0) {
            next[lastIdx] = { ...next[lastIdx], content: next[lastIdx].content + chunk };
          }
          return next;
        });
      }, abortRef.current.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || t('aiError'));
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNewChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setChatMessages([]);
    setInputText('');
    setError('');
    setIsGenerating(false);
  };

  const handleDropCar = (e) => {
    e.preventDefault();
    setIsDragOverWindow(false);
    try {
      const dataStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (dataStr) {
        const car = JSON.parse(dataStr);
        if (car && car.URL) {
          onAddCar(car);
          if (isMinimized) {
            onToggleMinimize();
          }
        }
      }
    } catch (err) {
      console.warn('Invalid dropped car data:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  if (!isOpen) return null;

  // Render Minimized Pill
  if (isMinimized) {
    return (
      <div 
        className={`ai-copilot-pill ${isDragOverWindow ? 'drag-over' : ''}`}
        onClick={onToggleMinimize}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIsDragOverWindow(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOverWindow(false);
        }}
        onDrop={handleDropCar}
        title={t('aiRestore')}
      >
        <span className="ai-pill-icon">✨</span>
        <span className="ai-pill-label">{t('copilotButton')}</span>
        <span className="ai-live-badge-mini">• LIVE</span>
        {attachedCars.length > 0 && (
          <span className="ai-pill-badge">{attachedCars.length}</span>
        )}
        {isGenerating && <span className="ai-spinner-small"></span>}
        <button 
          className="ai-pill-close" 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title={t('aiClose')}
        >
          ×
        </button>
      </div>
    );
  }

  // Get Suggestions based on context
  let currentSuggestions = [];
  if (car1 && car2) {
    currentSuggestions = [
      t('askAISuggestion3'),
      t('askAISuggestion2'),
      t('askAISuggestion1')
    ];
  } else if (car1) {
    currentSuggestions = [
      t('aiSugSingle2'),
      t('aiSugSingle1'),
      t('aiSugSingle3')
    ];
  } else {
    currentSuggestions = [
      t('aiSugGeneral2'),
      t('aiSugGeneral1'),
      t('aiSugGeneral3')
    ];
  }

  return (
    <div 
      className={`ai-copilot-window ${isExpanded ? 'expanded' : ''} ${isDragOverWindow ? 'drag-over-active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDragOverWindow(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setIsDragOverWindow(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDragOverWindow(false);
        }
      }}
      onDrop={handleDropCar}
    >
      {/* Drop Zone Visual Overlay */}
      {isDragOverWindow && (
        <div className="ai-drop-overlay">
          <div className="ai-drop-overlay-box">
            <span className="ai-drop-icon">📥</span>
            <h4>{t('aiDropActive')}</h4>
            <p>{attachedCars.length >= 2 ? t('aiMaxCars') : t('aiDropHint')}</p>
          </div>
        </div>
      )}

      {/* Copilot Header */}
      <div className="ai-copilot-header">
        <div className="ai-header-left">
          <span className="ai-header-icon">✨</span>
          <h3 className="ai-header-title">{t('copilotButton')}</h3>
          <span className="ai-online-status">• LIVE</span>
        </div>

        <div className="ai-header-controls">
          <button 
            className="ai-ctrl-btn ai-ctrl-refresh" 
            onClick={handleNewChat}
            title={t('aiNewChat')}
          >
            🔄
          </button>
          <button 
            className="ai-ctrl-btn" 
            onClick={onToggleMinimize}
            title={t('aiMinimize')}
          >
            _
          </button>
          <button 
            className="ai-ctrl-btn" 
            onClick={onToggleExpand}
            title={isExpanded ? t('aiMinimize') : t('aiMaximize')}
          >
            {isExpanded ? '❐' : '⛶'}
          </button>
          <button 
            className="ai-ctrl-btn ai-close-btn" 
            onClick={onClose}
            title={t('aiClose')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && <div className="ai-copilot-error">{error}</div>}

      {/* Chat Messages Stream Area */}
      <div className="ai-copilot-messages" ref={chatScrollRef}>
        {chatMessages.length === 0 && !error && (
          <div className="ai-welcome-box">
            <div className="ai-welcome-icon">✨</div>
            <h4>{t('copilotTitle')}</h4>
            <p>{t('aiPlaceholder')}</p>
            {attachedCars.length === 1 && (
              <div className="ai-welcome-tip">
                ℹ️ {t('aiSingleCarReady')}
              </div>
            )}
            {attachedCars.length === 2 && (
              <div className="ai-welcome-tip highlight">
                ✨ {t('aiCompareReady')}
                <button 
                  className="ai-inline-compare-btn"
                  onClick={handleGenerateComparison}
                >
                  ⚡ {t('compareButton')}
                </button>
              </div>
            )}
          </div>
        )}

        {chatMessages.map((msg, index) => (
          <div key={msg.id || index} className={`ai-stream-message ${msg.role}`}>
            {msg.role === 'user' ? (
              <div className="ai-user-bubble">
                <span>{msg.content}</span>
              </div>
            ) : (
              <div className="ai-assistant-body">
                <div
                  className="ai-card-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
                {isGenerating && index === chatMessages.length - 1 && (
                  <span className="ai-typewriter-cursor">▊</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Suggestion Pills Stack */}
      {currentSuggestions.length > 0 && !isGenerating && (
        <div className="ai-suggestions-stack">
          {currentSuggestions.map((sug, idx) => (
            <button
              key={idx}
              className="ai-suggestion-pill"
              onClick={() => handleSendQuestion(sug)}
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Unified Bottom Prompt Container */}
      <div className="ai-bottom-container">
        <form 
          className="ai-unified-prompt-box"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendQuestion();
          }}
        >
          <div className="ai-prompt-inner-top">
            {/* Attached Context Car Chips inside the input container */}
            {attachedCars.length > 0 && (
              <div className="ai-embedded-chips-row">
                {attachedCars.map((car, idx) => {
                  const isWinnerCar = winner === (idx + 1);
                  const isCar1 = idx === 0;
                  return (
                    <div 
                      key={car.URL || idx} 
                      className={`ai-embedded-car-chip ${isCar1 ? 'chip-a' : 'chip-b'} ${isWinnerCar ? 'chip-winner' : ''}`}
                      title={car.Title}
                    >
                      <span className="ai-chip-bullet">{isCar1 ? '🔵' : '🟣'}</span>
                      <button
                        type="button"
                        className={`ai-chip-fav-star ${isFavorite(car.URL) ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(car.URL);
                        }}
                        title={isFavorite(car.URL) ? 'Remove favorite' : 'Add favorite'}
                      >
                        {isFavorite(car.URL) ? '★' : '☆'}
                      </button>
                      <a href={car.URL} target="_blank" rel="noreferrer" className="ai-chip-name">
                        {car.Title} ({car.Year})
                      </a>
                      <span className="ai-chip-green-price">{formatPrice(car.Price, car.PriceText)}</span>
                      {isWinnerCar && <span className="ai-chip-trophy">🏆</span>}
                      <button 
                        type="button"
                        className="ai-chip-close-btn" 
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveCar(car.URL);
                        }}
                        title={t('deselectCar')}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Prompt Input Text */}
            <input
              ref={inputRef}
              type="text"
              className="ai-integrated-input"
              placeholder={t('askAIPlaceholder')}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isGenerating}
            />
          </div>

          <button
            type="submit"
            className="ai-send-action-btn"
            disabled={!inputText.trim() || isGenerating}
            title={t('askAISend')}
          >
            {isGenerating ? (
              <span className="ai-spinner"></span>
            ) : (
              <span className="ai-send-arrow-icon">➤</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AICopilotWindow;
