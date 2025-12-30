/**
 * Keyboard Shortcut Constants
 *
 * Defines default keyboard shortcuts for markdown formatting actions,
 * shortcut categories, blacklisted actions, and display helpers.
 */

/**
 * Shortcut categories for organization
 */
export const SHORTCUT_CATEGORIES = {
  FORMATTING: 'formatting',
  STRUCTURE: 'structure',
  INSERTION: 'insertion'
};

/**
 * Default keyboard shortcuts for markdown formatting
 *
 * Each shortcut includes:
 * - action: The formatting action identifier (matches handleFormat actions)
 * - key: Physical key (lowercase)
 * - ctrl: Ctrl/Cmd modifier
 * - shift: Shift modifier
 * - alt: Alt modifier
 * - enabled: Whether shortcut is enabled
 * - label: Human-readable label
 * - description: Detailed description
 * - category: Shortcut category
 */
export const DEFAULT_SHORTCUTS = [
  // FORMATTING
  {
    action: 'bold',
    key: 'b',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Bold',
    description: 'Make selected text bold',
    category: SHORTCUT_CATEGORIES.FORMATTING
  },
  {
    action: 'italic',
    key: 'i',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Italic',
    description: 'Make selected text italic',
    category: SHORTCUT_CATEGORIES.FORMATTING
  },
  {
    action: 'code',
    key: 'e',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Code Block',
    description: 'Insert or wrap with code block',
    category: SHORTCUT_CATEGORIES.FORMATTING
  },

  // STRUCTURE
  {
    action: 'h1',
    key: '1',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Heading 1',
    description: 'Convert line to heading 1',
    category: SHORTCUT_CATEGORIES.STRUCTURE
  },
  {
    action: 'h2',
    key: '2',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Heading 2',
    description: 'Convert line to heading 2',
    category: SHORTCUT_CATEGORIES.STRUCTURE
  },
  {
    action: 'ul',
    key: 'l',
    ctrl: true,
    shift: true,
    alt: false,
    enabled: true,
    label: 'Bullet List',
    description: 'Create bullet list',
    category: SHORTCUT_CATEGORIES.STRUCTURE
  },
  {
    action: 'ol',
    key: 'o',
    ctrl: true,
    shift: true,
    alt: false,
    enabled: true,
    label: 'Numbered List',
    description: 'Create numbered list',
    category: SHORTCUT_CATEGORIES.STRUCTURE
  },
  {
    action: 'quote',
    key: 'q',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Quote',
    description: 'Insert or wrap with quote',
    category: SHORTCUT_CATEGORIES.STRUCTURE
  },

  // INSERTION
  {
    action: 'link',
    key: 'k',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Link',
    description: 'Insert link',
    category: SHORTCUT_CATEGORIES.INSERTION
  },
  {
    action: 'table',
    key: 't',
    ctrl: true,
    shift: true,
    alt: false,
    enabled: true,
    label: 'Table',
    description: 'Insert table',
    category: SHORTCUT_CATEGORIES.INSERTION
  },
  {
    action: 'save',
    key: 's',
    ctrl: true,
    shift: false,
    alt: false,
    enabled: true,
    label: 'Quick Save',
    description: 'Save changes and continue editing',
    category: SHORTCUT_CATEGORIES.INSERTION
  }
];

/**
 * Actions that cannot have keyboard shortcuts
 * These require special UI interaction (pickers, dropdowns)
 */
export const SHORTCUT_BLACKLIST = ['emoticon', 'color', 'align', 'insert'];

/**
 * Check if an action can have a keyboard shortcut
 * @param {string} action - Action identifier
 * @returns {boolean} True if action can have a shortcut
 */
export const canHaveShortcut = (action) => {
  return !SHORTCUT_BLACKLIST.includes(action);
};

/**
 * Format a shortcut for display in tooltips
 * Handles platform differences (Ctrl vs Cmd on Mac)
 *
 * @param {Object} shortcut - Shortcut definition
 * @returns {string|null} Formatted shortcut string (e.g., "Ctrl+B") or null if disabled
 */
export const formatShortcutDisplay = (shortcut) => {
  if (!shortcut || !shortcut.enabled) return null;

  const parts = [];

  // Handle platform differences (Ctrl vs Cmd)
  const isMac = typeof navigator !== 'undefined' &&
                navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrl) {
    parts.push(isMac ? 'Cmd' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? 'Opt' : 'Alt');
  }

  // Format key nicely
  const key = shortcut.key.toUpperCase();
  parts.push(key);

  return parts.join('+');
};
