/**
 * Keyboard Shortcut Resolver
 *
 * Handles three-layer resolution of keyboard shortcuts:
 * 1. Default constants (code)
 * 2. Config file overrides (wiki-config.json)
 * 3. User preferences (localStorage)
 *
 * Provides functions for resolution, persistence, validation, and conflict detection.
 */

import { DEFAULT_SHORTCUTS, formatShortcutDisplay } from '../constants/keyboardShortcutConstants';
import { getItem, setItem, configName } from './storageManager';

const STORAGE_KEY = configName('keyboard_shortcuts');
const STORAGE_VERSION = '1.0';

/**
 * Resolve keyboard shortcuts from all three layers
 *
 * Resolution order:
 * 1. Start with DEFAULT_SHORTCUTS
 * 2. Apply config file overrides (wiki-config.json)
 * 3. Apply localStorage overrides (user preferences)
 * 4. Check if feature is globally disabled
 *
 * @param {Object} wikiConfig - Wiki configuration object
 * @returns {Map<string, Object>} Map of action -> shortcut definition
 */
export const resolveShortcuts = (wikiConfig) => {
  // Layer 1: Start with defaults
  const shortcutMap = new Map();
  DEFAULT_SHORTCUTS.forEach(shortcut => {
    shortcutMap.set(shortcut.action, { ...shortcut });
  });

  // Layer 2: Apply config file overrides
  const configShortcuts = wikiConfig?.features?.keyboardShortcuts?.shortcuts;
  if (Array.isArray(configShortcuts)) {
    configShortcuts.forEach(override => {
      if (shortcutMap.has(override.action)) {
        // Merge with existing (config doesn't need to specify all fields)
        const existing = shortcutMap.get(override.action);
        shortcutMap.set(override.action, { ...existing, ...override });
      }
    });
  }

  // Layer 3: Apply localStorage overrides
  const storedData = getItem(STORAGE_KEY);
  if (storedData?.version === STORAGE_VERSION && Array.isArray(storedData.shortcuts)) {
    storedData.shortcuts.forEach(override => {
      if (shortcutMap.has(override.action)) {
        // Full override from localStorage
        shortcutMap.set(override.action, override);
      }
    });
  }

  // Check if feature is disabled globally
  const enabled = wikiConfig?.features?.keyboardShortcuts?.enabled !== false;
  if (!enabled) {
    // Disable all shortcuts
    shortcutMap.forEach((shortcut, action) => {
      shortcutMap.set(action, { ...shortcut, enabled: false });
    });
  }

  return shortcutMap;
};

/**
 * Convert shortcut map to display strings for toolbar tooltips
 *
 * @param {Map<string, Object>} shortcutMap - Map of action -> shortcut
 * @returns {Object} Map of action -> display string (e.g., "Ctrl+B")
 */
export const getShortcutDisplayMap = (shortcutMap) => {
  const displayMap = {};
  shortcutMap.forEach((shortcut, action) => {
    const display = formatShortcutDisplay(shortcut);
    if (display) {
      displayMap[action] = display;
    }
  });
  return displayMap;
};

/**
 * Save user shortcuts to localStorage
 *
 * @param {Array<Object>} shortcuts - Array of shortcut definitions
 */
export const saveUserShortcuts = (shortcuts) => {
  setItem(STORAGE_KEY, {
    version: STORAGE_VERSION,
    shortcuts,
    timestamp: Date.now()
  });
};

/**
 * Get user shortcuts from localStorage
 *
 * @returns {Array<Object>|null} Array of shortcuts or null if not found/invalid
 */
export const getUserShortcuts = () => {
  const storedData = getItem(STORAGE_KEY);
  if (storedData?.version === STORAGE_VERSION && Array.isArray(storedData.shortcuts)) {
    return storedData.shortcuts;
  }
  return null;
};

/**
 * Reset shortcuts to defaults (clears localStorage)
 */
export const resetShortcuts = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
};

/**
 * Check if two shortcuts conflict (same key combination)
 *
 * @param {Object} shortcut1 - First shortcut
 * @param {Object} shortcut2 - Second shortcut
 * @returns {boolean} True if they conflict
 */
export const shortcutsConflict = (shortcut1, shortcut2) => {
  return (
    shortcut1.key === shortcut2.key &&
    shortcut1.ctrl === shortcut2.ctrl &&
    shortcut1.shift === shortcut2.shift &&
    shortcut1.alt === shortcut2.alt &&
    shortcut1.enabled &&
    shortcut2.enabled
  );
};

/**
 * Validate shortcuts for conflicts
 *
 * @param {Array<Object>} shortcuts - Array of shortcuts to validate
 * @returns {Array<Object>} Array of conflict warnings
 */
export const validateShortcuts = (shortcuts) => {
  const conflicts = [];
  const enabledShortcuts = shortcuts.filter(s => s.enabled);

  for (let i = 0; i < enabledShortcuts.length; i++) {
    for (let j = i + 1; j < enabledShortcuts.length; j++) {
      if (shortcutsConflict(enabledShortcuts[i], enabledShortcuts[j])) {
        conflicts.push({
          shortcut1: enabledShortcuts[i],
          shortcut2: enabledShortcuts[j],
          message: `Conflict: ${enabledShortcuts[i].label} and ${enabledShortcuts[j].label} use the same keys`
        });
      }
    }
  }

  return conflicts;
};
