/**
 * Avatar Update Event System
 *
 * Simple event emitter for notifying components when a user's avatar changes.
 * Used to refresh all PrestigeAvatar instances across the app.
 */

import { createLogger } from './logger';

const logger = createLogger('AvatarEvents');

const AVATAR_UPDATED_EVENT = 'avatar:updated';

/**
 * Emit avatar updated event
 * @param {number} userId - User ID whose avatar was updated
 * @param {string} avatarUrl - New avatar URL
 */
export function emitAvatarUpdated(userId, avatarUrl) {
  logger.debug('Emitting avatar updated event', { userId, avatarUrl });
  const event = new CustomEvent(AVATAR_UPDATED_EVENT, {
    detail: { userId, avatarUrl, timestamp: Date.now() }
  });
  window.dispatchEvent(event);
}

/**
 * Subscribe to avatar updated events
 * @param {Function} callback - Callback function (receives { userId, avatarUrl, timestamp })
 * @returns {Function} Unsubscribe function
 */
export function onAvatarUpdated(callback) {
  const handler = (event) => {
    callback(event.detail);
  };

  window.addEventListener(AVATAR_UPDATED_EVENT, handler);

  // Return unsubscribe function
  return () => {
    window.removeEventListener(AVATAR_UPDATED_EVENT, handler);
  };
}
