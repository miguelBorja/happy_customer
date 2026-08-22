import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { compareWithAI } from '../api/client';
import { useFavorites } from '../hooks/useFavorites';
import { useChatHistory } from '../hooks/useChatHistory';
import {
  SparkleClusterIcon,
  SparkleIcon,
  AdvisorOrb,
  SendAirplaneIcon,
  StarIcon,
  StopIcon,
  MinimizeIcon,
  ExpandIcon,
  CloseIcon,
  ChevronUpIcon,
  ChevronDownIcon
} from './icons/AppIcons';

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

const formatSessionTime = (timestamp, lang) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return lang === 'es' ? 'Hace un momento' : 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return lang === 'es' ? 'Ayer' : 'Yesterday';
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(lang === 'es' ? 'es-CR' : 'en-US', {
    month: 'short',
    day: 'numeric'
  });
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
  onSetAttachedCars,
  isMinimized,
  onToggleMinimize,
  isExpanded,
  onToggleExpand
}) => {
  const { language, t } = useLanguage();
  const { isFavorite, toggleFavorite } = useFavorites();
  
  const {
    sessions,
    activeSessionId,
    activeSession,
    saveSession,
    createNewChat,
    selectChat,
    deleteChat,
    clearAllChats
  } = useChatHistory();

  const [chatMessages, setChatMessages] = useState(() => activeSession?.messages || []);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [isDragOverWindow, setIsDragOverWindow] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isSuggestionsCollapsed, setIsSuggestionsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('crautos_ai_suggestions_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSuggestionsCollapse = () => {
    setIsSuggestionsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('crautos_ai_suggestions_collapsed', String(next));
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
  };
  
  const chatScrollRef = useRef(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const initialLoadedRef = useRef(false);

  // Restore initial active session messages & cars on mount
  useEffect(() => {
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      if (activeSession) {
        if (activeSession.messages && activeSession.messages.length > 0) {
          setChatMessages(activeSession.messages);
        }
        if (activeSession.attachedCars && activeSession.attachedCars.length > 0 && onSetAttachedCars) {
          onSetAttachedCars(activeSession.attachedCars);
        }
      }
    }
  }, [activeSession, onSetAttachedCars]);

  const car1 = attachedCars[0] || null;
  const car2 = attachedCars[1] || null;

  const initialComparison = chatMessages.find(m => m.role === 'assistant')?.content || '';
  const winner = detectWinner(initialComparison);

  // Auto-scroll AI response
  useEffect(() => {
    if (chatScrollRef.current && isGenerating && !showHistory) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isGenerating, showHistory]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Auto-save active session state to localStorage when changes settle
  useEffect(() => {
    if (!isGenerating && activeSessionId && (chatMessages.length > 0 || attachedCars.length > 0)) {
      saveSession(activeSessionId, chatMessages, attachedCars);
    }
  }, [chatMessages, attachedCars, isGenerating, activeSessionId, saveSession]);

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
    const newMessages = [{ id: initialMsgId, role: 'assistant', content: '' }];
    setChatMessages(newMessages);

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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  const handleNewChat = () => {
    if (abortRef.current) abortRef.current.abort();
    // Save current session before creating a new one
    if (activeSessionId && (chatMessages.length > 0 || attachedCars.length > 0)) {
      saveSession(activeSessionId, chatMessages, attachedCars);
    }
    createNewChat();
    setChatMessages([]);
    setInputText('');
    setError('');
    setIsGenerating(false);
    setShowHistory(false);
    if (onClearCars) onClearCars();
  };

  const handleSelectSession = (sessionId) => {
    if (sessionId === activeSessionId && !showHistory) return;
    if (abortRef.current) abortRef.current.abort();
    // Save current before switching
    if (activeSessionId && (chatMessages.length > 0 || attachedCars.length > 0)) {
      saveSession(activeSessionId, chatMessages, attachedCars);
    }
    const session = selectChat(sessionId);
    if (session) {
      setChatMessages(session.messages || []);
      if (onSetAttachedCars) {
        onSetAttachedCars(session.attachedCars || []);
      }
    }
    setShowHistory(false);
    setError('');
    setIsGenerating(false);
  };

  const handleDeleteSession = (e, sessionId) => {
    e.stopPropagation();
    deleteChat(sessionId);
    if (sessionId === activeSessionId) {
      setChatMessages([]);
      if (onClearCars) onClearCars();
    }
  };

  const handleClearAllHistory = () => {
    if (window.confirm(t('aiConfirmClearHistory') || (language === 'es' ? '¿Eliminar todo el historial de conversaciones de IA?' : 'Clear all AI conversation history?'))) {
      clearAllChats();
      setChatMessages([]);
      if (onClearCars) onClearCars();
      setShowHistory(false);
    }
  };

  // Drag & Drop handlers for cars onto AI window
  const handleDropCar = (e) => {
    e.preventDefault();
    setIsDragOverWindow(false);
    try {
      const dataStr = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (dataStr) {
        const droppedCar = JSON.parse(dataStr);
        if (droppedCar && droppedCar.URL && onAddCar) {
          onAddCar(droppedCar);
        }
      }
    } catch (err) {
      console.warn('Could not parse dropped car:', err);
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
        <span className="ai-pill-icon">
          <SparkleClusterIcon size={16} color="#fef08a" />
        </span>
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
          <CloseIcon size={12} />
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
          <span className="ai-header-icon">
            <SparkleClusterIcon size={18} color="#fef08a" />
          </span>
          <h3 className="ai-header-title">{t('copilotButton')}</h3>
          <span className="ai-online-status">• LIVE</span>
        </div>

        <div className="ai-header-controls">
          {/* History Toggle Button */}
          <button 
            className={`ai-ctrl-btn ai-ctrl-history ${showHistory ? 'active' : ''}`} 
            onClick={() => setShowHistory(prev => !prev)}
            title={showHistory ? t('aiBackToChat') : t('aiHistory')}
          >
            🕒
            {sessions.length > 0 && (
              <span className="ai-ctrl-badge">{sessions.length}</span>
            )}
          </button>

          {/* New Chat Button */}
          <button 
            className="ai-ctrl-btn ai-ctrl-refresh" 
            onClick={handleNewChat}
            title={t('aiNewChat')}
          >
            🔄
          </button>

          {/* Minimize Button */}
          <button 
            className="ai-ctrl-btn" 
            onClick={onToggleMinimize}
            title={t('aiMinimize')}
          >
            <MinimizeIcon size={13} color="currentColor" />
          </button>

          {/* Expand / Restore Size Button */}
          <button 
            className="ai-ctrl-btn" 
            onClick={onToggleExpand}
            title={isExpanded ? t('aiMinimize') : t('aiMaximize')}
          >
            <ExpandIcon size={13} color="currentColor" isExpanded={isExpanded} />
          </button>

          {/* Close Window */}
          <button 
            className="ai-ctrl-btn ai-close-btn" 
            onClick={onClose}
            title={t('aiClose')}
          >
            <CloseIcon size={13} color="currentColor" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && !showHistory && <div className="ai-copilot-error">{error}</div>}

      {/* MAIN BODY: Either Chat View or History Panel */}
      {showHistory ? (
        <div className="ai-history-panel">
          <div className="ai-history-header">
            <div className="ai-history-title-row">
              <span className="ai-history-icon">🕒</span>
              <h4>{t('aiHistoryTitle')}</h4>
            </div>
            <div className="ai-history-actions">
              <button 
                className="ai-history-new-btn"
                onClick={handleNewChat}
              >
                + {t('aiNewChat')}
              </button>
              <button 
                className="ai-history-back-btn"
                onClick={() => setShowHistory(false)}
                title={t('aiBackToChat')}
              >
                ✕
              </button>
            </div>
          </div>

          <div className="ai-history-list">
            {sessions.length === 0 ? (
              <div className="ai-history-empty">
                <span className="ai-history-empty-icon">💬</span>
                <p>{t('aiNoHistory')}</p>
              </div>
            ) : (
              sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                const msgCount = session.messages ? session.messages.length : 0;
                const cars = session.attachedCars || [];
                const formattedTime = formatSessionTime(session.updatedAt || session.createdAt, language);

                return (
                  <div 
                    key={session.id}
                    className={`ai-history-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <div className="ai-history-item-main">
                      <div className="ai-history-item-top">
                        <span className="ai-history-item-title" title={session.title}>
                          {session.title || t('aiUntitledChat')}
                        </span>
                        <span className="ai-history-item-time">{formattedTime}</span>
                      </div>

                      <div className="ai-history-item-meta">
                        <span className="ai-meta-tag msg-tag">
                          {t('aiMessagesCount').replace('{count}', msgCount)}
                        </span>
                        {cars.length > 0 && (
                          <span className="ai-meta-tag car-tag" title={cars.map(c => c.Title).join(', ')}>
                            🚗 {cars.length === 2 ? `${cars[0].Title.split(' ')[0]} vs ${cars[1].Title.split(' ')[0]}` : cars[0].Title.split(' ')[0]}
                          </span>
                        )}
                        {isActive && (
                          <span className="ai-meta-tag active-tag">● {language === 'es' ? 'Actual' : 'Active'}</span>
                        )}
                      </div>
                    </div>

                    <button
                      className="ai-history-delete-btn"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      title={t('aiDeleteChat')}
                    >
                      🗑️
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {sessions.length > 0 && (
            <div className="ai-history-footer">
              <button 
                className="ai-history-clear-all-btn"
                onClick={handleClearAllHistory}
              >
                🗑️ {t('aiClearHistory')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Chat Messages Stream Area */}
          <div className="ai-copilot-messages" ref={chatScrollRef}>
            {chatMessages.length === 0 && !error && (
              <div className="ai-welcome-box">
                <AdvisorOrb size={95} style={{ marginBottom: '1.25rem' }} />
                <h4 style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.01em', marginBottom: '0.4rem' }}>
                  {t('copilotTitle')}
                </h4>
                <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                  {t('copilotSubtitle')}
                </p>
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

          {/* Suggestion Pills Section with Collapse/Expand */}
          {currentSuggestions.length > 0 && !isGenerating && (
            <div className={`ai-suggestions-wrapper ${isSuggestionsCollapsed ? 'collapsed' : 'expanded'}`}>
              {!isSuggestionsCollapsed ? (
                <div className="ai-suggestions-row">
                  <div className="ai-suggestions-stack">
                    {currentSuggestions.map((sug, idx) => (
                      <button
                        key={idx}
                        className="ai-suggestion-pill"
                        onClick={() => handleSendQuestion(sug)}
                        title={sug}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ai-suggestions-toggle-btn"
                    onClick={toggleSuggestionsCollapse}
                    title={t('aiCollapseSuggestions')}
                    aria-label={t('aiCollapseSuggestions')}
                  >
                    <ChevronUpIcon size={15} />
                  </button>
                </div>
              ) : (
                <div className="ai-suggestions-collapsed-bar">
                  <button
                    type="button"
                    className="ai-suggestions-expand-btn"
                    onClick={toggleSuggestionsCollapse}
                    title={t('aiExpandSuggestions')}
                    aria-label={t('aiExpandSuggestions')}
                  >
                    <SparkleIcon size={13} color="#fef08a" />
                    <span>{t('aiSuggestedQuestions')}</span>
                    <ChevronDownIcon size={14} />
                  </button>
                </div>
              )}
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
                            <StarIcon size={12} color="#fbbf24" filled={isFavorite(car.URL)} />
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
                  <SendAirplaneIcon size={18} color="#ffffff" />
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default AICopilotWindow;
