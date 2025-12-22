/**
 * Event Bus - Framework-wide publish-subscribe event system
 *
 * Enables loosely coupled communication between different parts of the application.
 * Used primarily by the achievement system to listen for user actions and trigger checks.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('EventBus');

class EventBus {
  constructor() {
    this.listeners = new Map(); // Map<eventName, Set<callback>>
  }

  /**
   * Register an event listener
   * @param {string} event - Event name (e.g., 'user.login')
   * @param {Function} callback - Function to call when event is emitted
   */
  on(event, callback) {
    if (typeof callback !== 'function') {
      logger.error('Callback must be a function', { event });
      return;
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(callback);
    logger.trace('Listener registered', { event, totalListeners: this.listeners.get(event).size });
  }

  /**
   * Unregister an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (!this.listeners.has(event)) {
      return;
    }

    const eventListeners = this.listeners.get(event);
    eventListeners.delete(callback);

    if (eventListeners.size === 0) {
      this.listeners.delete(event);
    }

    logger.trace('Listener unregistered', { event });
  }

  /**
   * Register a one-time event listener
   * @param {string} event - Event name
   * @param {Function} callback - Function to call once when event is emitted
   */
  once(event, callback) {
    const onceCallback = (data) => {
      this.off(event, onceCallback);
      callback(data);
    };

    this.on(event, onceCallback);
  }

  /**
   * Emit an event to all registered listeners
   * @param {string} event - Event name
   * @param {*} data - Data to pass to listeners
   */
  emit(event, data) {
    logger.debug('Event emitted', { event, hasData: !!data });

    if (!this.listeners.has(event)) {
      logger.trace('No listeners for event', { event });
      return;
    }

    const eventListeners = this.listeners.get(event);

    // Call all listeners asynchronously to prevent blocking
    eventListeners.forEach((callback) => {
      try {
        // Use setTimeout to make it truly async and prevent one listener from blocking others
        setTimeout(() => {
          try {
            callback(data);
          } catch (error) {
            logger.error('Listener error', { event, error });
          }
        }, 0);
      } catch (error) {
        logger.error('Failed to queue listener', { event, error });
      }
    });
  }

  /**
   * Remove all listeners for a specific event or all events
   * @param {string} [event] - Event name (optional, removes all if not provided)
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
      logger.debug('Cleared listeners for event', { event });
    } else {
      this.listeners.clear();
      logger.debug('Cleared all listeners');
    }
  }

  /**
   * Get the number of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    return this.listeners.has(event) ? this.listeners.get(event).size : 0;
  }

  /**
   * Get all registered event names
   * @returns {string[]} Array of event names
   */
  eventNames() {
    return Array.from(this.listeners.keys());
  }
}

// Singleton instance
export const eventBus = new EventBus();

/**
 * Standard event names used throughout the application
 */
export const EventNames = {
  // User authentication events
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // Pull request events
  USER_PR_CREATED: 'user.pr.created',
  USER_PR_MERGED: 'user.pr.merged',
  USER_PR_CLOSED: 'user.pr.closed',

  // User data events
  USER_BUILD_SAVED: 'user.build.saved',
  USER_BUILD_UPDATED: 'user.build.updated',
  USER_BUILD_DELETED: 'user.build.deleted',
  USER_LOADOUT_SAVED: 'user.loadout.saved',
  USER_LOADOUT_UPDATED: 'user.loadout.updated',
  USER_LOADOUT_DELETED: 'user.loadout.deleted',
  USER_DATA_SHARED: 'user.data.shared',

  // Profile events
  USER_PROFILE_VIEWED: 'user.profile.viewed',
  USER_SNAPSHOT_UPDATED: 'user.snapshot.updated',

  // Achievement events
  ACHIEVEMENTS_UNLOCKED: 'achievements.unlocked',
  ACHIEVEMENT_PROGRESS: 'achievement.progress',
};
