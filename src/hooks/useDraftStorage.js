import { useRef, useCallback, useEffect } from 'react';
import { cacheName } from '../utils/storageManager';

/**
 * Custom Hook: useDraftStorage
 *
 * Provides localStorage auto-save functionality for builders
 * - Auto-saves draft state with debouncing
 * - Loads draft on mount
 * - Clears draft after successful save
 *
 * @param {string} storageKey - Base key for localStorage (e.g., 'skill_builder', 'spirit_builder')
 * @param {any} user - User object with id property (or null for anonymous)
 * @param {boolean} isModal - If true, disables auto-save/load (modal mode)
 * @param {Object} draftData - Data to save to localStorage
 * @param {number} debounceMs - Debounce delay in milliseconds (default: 1000)
 * @returns {Object} { loadDraft, clearDraft, isDraftAvailable }
 */
export function useDraftStorage(storageKey, user, isModal, draftData, debounceMs = 1000) {
  const saveTimeoutRef = useRef(null);

  // Generate user-specific localStorage key using storage manager
  const getStorageKey = useCallback(() => {
    const userId = user?.id || 'anonymous';
    // Convert camelCase to snake_case (without _draft suffix)
    const snakeCaseKey = storageKey
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
    // Use new draft format: cache:userId:draft:name
    return `cache:${userId}:draft:${snakeCaseKey}`;
  }, [storageKey, user]);

  // Save current state to localStorage (debounced)
  const saveDraft = useCallback(() => {
    if (isModal) return; // Don't auto-save in modal mode

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const draft = {
          ...draftData,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(getStorageKey(), JSON.stringify(draft));
        console.log(`[${storageKey}] Draft auto-saved to localStorage`);
      } catch (error) {
        console.error(`[${storageKey}] Failed to save draft:`, error);
      }
    }, debounceMs);
  }, [isModal, draftData, getStorageKey, storageKey, debounceMs]);

  // Load from localStorage
  const loadDraft = useCallback(() => {
    if (isModal) return null; // Don't auto-load in modal mode

    try {
      const saved = localStorage.getItem(getStorageKey());
      if (saved) {
        const draft = JSON.parse(saved);
        console.log(`[${storageKey}] Found draft from`, draft.savedAt);
        return draft;
      }
    } catch (error) {
      console.error(`[${storageKey}] Failed to load draft:`, error);
    }
    return null;
  }, [isModal, getStorageKey, storageKey]);

  // Clear localStorage draft
  const clearDraft = useCallback(() => {
    // Cancel any pending auto-save to prevent race condition
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    try {
      localStorage.removeItem(getStorageKey());
      console.log(`[${storageKey}] Draft cleared from localStorage`);
    } catch (error) {
      console.error(`[${storageKey}] Failed to clear draft:`, error);
    }
  }, [getStorageKey, storageKey]);

  // Check if draft exists
  const isDraftAvailable = useCallback(() => {
    if (isModal) return false;
    try {
      return localStorage.getItem(getStorageKey()) !== null;
    } catch (error) {
      return false;
    }
  }, [isModal, getStorageKey]);

  // Auto-save when draftData changes
  useEffect(() => {
    saveDraft();
  }, [saveDraft]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    loadDraft,
    clearDraft,
    isDraftAvailable
  };
}
