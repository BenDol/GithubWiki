/**
 * Enhanced Keyboard Shortcuts Hook
 *
 * Provides keyboard shortcut handling with:
 * - Editor focus checking (shortcuts only work when editor is focused)
 * - Platform-aware modifier key handling (Ctrl vs Cmd)
 * - Capture phase event listening (intercepts before CodeMirror)
 * - Automatic cleanup on unmount
 */

import { useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('KeyboardShortcuts');

/**
 * Enhanced keyboard shortcuts hook
 *
 * @param {Map<string, Object>} shortcutMap - Map of action -> shortcut definition
 * @param {Function} onShortcut - Callback when shortcut is triggered (receives action)
 * @param {Object} editorApiRef - Ref to editor API (optional, for additional checks)
 * @param {boolean} enabled - Whether shortcuts are enabled (default: true)
 */
export const useEnhancedKeyboardShortcuts = (
  shortcutMap,
  onShortcut,
  editorApiRef = null,
  enabled = true
) => {
  const shortcutMapRef = useRef(shortcutMap);

  // Update ref when shortcutMap changes
  useEffect(() => {
    shortcutMapRef.current = shortcutMap;
  }, [shortcutMap]);

  useEffect(() => {
    if (!enabled) {
      logger.debug('Keyboard shortcuts disabled');
      return;
    }

    const handleKeyDown = (event) => {
      // Only process if editor is focused
      // CodeMirror editor has class .cm-editor with content in .cm-content
      const editorElement = document.querySelector('.cm-editor .cm-content');
      if (!editorElement || document.activeElement !== editorElement) {
        // Editor not focused, ignore shortcuts
        return;
      }

      // Build comparison key from event
      const pressedKey = event.key.toLowerCase();
      const pressedCtrl = event.ctrlKey || event.metaKey; // Handle both Ctrl and Cmd
      const pressedShift = event.shiftKey;
      const pressedAlt = event.altKey;

      // Check each enabled shortcut
      shortcutMapRef.current.forEach((shortcut, action) => {
        if (!shortcut.enabled) return;

        // Check if this shortcut matches the pressed keys
        if (
          shortcut.key === pressedKey &&
          !!shortcut.ctrl === pressedCtrl &&
          !!shortcut.shift === pressedShift &&
          !!shortcut.alt === pressedAlt
        ) {
          // Match found!
          event.preventDefault();
          event.stopPropagation();

          logger.debug('Shortcut triggered', { action, shortcut });
          onShortcut(action);
        }
      });
    };

    // Use capture phase to intercept before CodeMirror handles the event
    window.addEventListener('keydown', handleKeyDown, true);

    logger.debug('Keyboard shortcuts initialized', {
      shortcutCount: shortcutMapRef.current.size
    });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      logger.debug('Keyboard shortcuts cleanup');
    };
  }, [onShortcut, enabled]);
};
