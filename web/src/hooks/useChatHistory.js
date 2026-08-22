import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'crautosdb_ai_chat_history';
const ACTIVE_SESSION_KEY = 'crautosdb_ai_active_chat_id';
const MAX_SESSIONS = 25;

const generateId = () => `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

const generateTitle = (messages, attachedCars) => {
  if (attachedCars && attachedCars.length === 2) {
    return `${attachedCars[0].Title} vs ${attachedCars[1].Title}`;
  }
  if (attachedCars && attachedCars.length === 1) {
    return `${attachedCars[0].Title} (${attachedCars[0].Year || ''})`;
  }
  const firstUserMsg = messages?.find(m => m.role === 'user');
  if (firstUserMsg && firstUserMsg.content) {
    const clean = firstUserMsg.content.trim().replace(/\n/g, ' ');
    return clean.length > 40 ? clean.substring(0, 40) + '...' : clean;
  }
  return '';
};

const loadStoredSessions = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to load chat history from localStorage:', err);
    return [];
  }
};

const saveStoredSessions = (sessions) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch (err) {
    console.warn('Failed to save chat history to localStorage:', err);
  }
};

export const useChatHistory = () => {
  const [sessions, setSessions] = useState(loadStoredSessions);
  const [activeSessionId, setActiveSessionId] = useState(() => {
    const savedActive = localStorage.getItem(ACTIVE_SESSION_KEY);
    const existing = loadStoredSessions();
    if (savedActive && existing.some(s => s.id === savedActive)) {
      return savedActive;
    }
    if (existing.length > 0) {
      return existing[0].id;
    }
    return generateId();
  });

  const activeSessionRef = useRef(activeSessionId);
  activeSessionRef.current = activeSessionId;

  // Sync activeSessionId to localStorage
  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
    }
  }, [activeSessionId]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  // Save or update a session
  const saveSession = useCallback((sessionId, messages, attachedCars = []) => {
    if (!sessionId) return;
    // Don't save empty sessions unless they already exist
    if ((!messages || messages.length === 0) && (!attachedCars || attachedCars.length === 0)) {
      return;
    }

    setSessions(prev => {
      const existingIdx = prev.findIndex(s => s.id === sessionId);
      const title = generateTitle(messages, attachedCars) || (existingIdx >= 0 ? prev[existingIdx].title : 'Nueva consulta');
      
      const now = Date.now();
      let updated;
      
      if (existingIdx >= 0) {
        const current = prev[existingIdx];
        const updatedItem = {
          ...current,
          title: title || current.title,
          messages,
          attachedCars,
          updatedAt: now
        };
        // Move updated to top
        updated = [updatedItem, ...prev.filter((_, idx) => idx !== existingIdx)];
      } else {
        const newItem = {
          id: sessionId,
          title: title || 'Nueva consulta',
          messages,
          attachedCars,
          createdAt: now,
          updatedAt: now
        };
        updated = [newItem, ...prev];
      }

      saveStoredSessions(updated);
      return updated;
    });
  }, []);

  // Start a fresh new chat
  const createNewChat = useCallback(() => {
    const newId = generateId();
    setActiveSessionId(newId);
    return newId;
  }, []);

  // Switch to an existing session
  const selectChat = useCallback((sessionId) => {
    const found = sessions.find(s => s.id === sessionId);
    if (found) {
      setActiveSessionId(sessionId);
      return found;
    }
    return null;
  }, [sessions]);

  // Delete a specific session
  const deleteChat = useCallback((sessionId) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId);
      saveStoredSessions(filtered);
      
      if (activeSessionRef.current === sessionId) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          const newId = generateId();
          setActiveSessionId(newId);
        }
      }
      return filtered;
    });
  }, []);

  // Clear all sessions
  const clearAllChats = useCallback(() => {
    setSessions([]);
    localStorage.removeItem(STORAGE_KEY);
    const newId = generateId();
    setActiveSessionId(newId);
  }, []);

  return {
    sessions,
    activeSessionId,
    activeSession,
    saveSession,
    createNewChat,
    selectChat,
    deleteChat,
    clearAllChats
  };
};
