/**
 * Display Name Service
 *
 * Manages user display names with validation, uniqueness checking,
 * cooldown enforcement, and caching.
 */

import { createLogger } from '../utils/logger';
import { getCacheValue, setCacheValue, clearCacheValue } from '../utils/timeCache';
import { cacheName } from '../utils/storageManager';
import { getDisplayNameEndpoint } from '../utils/apiEndpoints';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  DISPLAY_NAME_PATTERN,
  DISPLAY_NAME_CHANGE_COOLDOWN_DAYS,
  DISPLAY_NAME_ERROR_MESSAGES
} from '../utils/displayNameConstants';

const logger = createLogger('DisplayNames');

// In-memory cache for display names (client-side only, 24-hour TTL)
// Display names rarely change, so we can cache them for longer
const DISPLAY_NAME_CACHE_TTL = 86400000; // 24 hours
const REGISTRY_CACHE_TTL = 60000; // 1 minute for full registry

/**
 * Get display name for a user
 * @param {number} userId - GitHub user ID
 * @returns {Promise<string|null>} Display name or null if not set
 */
export async function getDisplayName(userId) {
  try {
    // Check cache first
    const cacheKey = cacheName('display_name', userId);
    const cached = getCacheValue(cacheKey);
    if (cached !== null) {
      logger.debug('Display name cache hit', { userId });
      return cached;
    }

    // Fetch from API
    const response = await fetch(`${getDisplayNameEndpoint()}?userId=${userId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch display name: ${response.status}`);
    }

    const data = await response.json();
    const displayName = data.displayName?.displayName || null;

    // Cache result
    setCacheValue(cacheKey, displayName, DISPLAY_NAME_CACHE_TTL);

    logger.debug('Fetched display name', { userId, displayName });
    return displayName;
  } catch (error) {
    logger.error('Failed to get display name', { userId, error });
    return null;
  }
}

/**
 * Get display name or fallback to username
 * @param {Object} user - User object with id and login
 * @returns {Promise<string>} Display name or GitHub username
 */
export async function getDisplayNameOrFallback(user) {
  if (!user || !user.id) {
    return user?.login || 'Unknown';
  }

  const displayName = await getDisplayName(user.id);
  return displayName || user.login;
}

/**
 * Load full display name registry (for admin/uniqueness checks)
 * @returns {Promise<Object>} Registry object keyed by userId
 */
export async function loadDisplayNameRegistry() {
  try {
    // Check cache first
    const cacheKey = cacheName('display_name_registry', 'all');
    const cached = getCacheValue(cacheKey);
    if (cached !== null) {
      logger.debug('Display name registry cache hit');
      return cached;
    }

    // Fetch from API
    const response = await fetch(`${getDisplayNameEndpoint()}?all=true`);
    if (!response.ok) {
      throw new Error(`Failed to fetch display name registry: ${response.status}`);
    }

    const data = await response.json();
    const registry = data.displayNames || {};

    // Cache result (shorter TTL for full registry)
    setCacheValue(cacheKey, registry, REGISTRY_CACHE_TTL);

    logger.debug('Fetched display name registry', { count: Object.keys(registry).length });
    return registry;
  } catch (error) {
    logger.error('Failed to load display name registry', { error });
    return {};
  }
}

/**
 * Set display name for authenticated user
 * @param {number} userId - GitHub user ID
 * @param {string} username - GitHub username
 * @param {string} displayName - Desired display name
 * @param {string} token - User's OAuth token
 * @returns {Promise<Object>} Result object with success/error
 */
export async function setDisplayName(userId, username, displayName, token) {
  try {
    logger.info('Setting display name', { userId, displayName });

    const response = await fetch(getDisplayNameEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'set',
        userId,
        username,
        displayName,
        token
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Failed to set display name', { userId, error: data.error });
      return { success: false, error: data.error };
    }

    // Clear caches
    clearCacheValue(cacheName('display_name', userId));
    clearCacheValue(cacheName('display_name_registry', 'all'));

    logger.info('Display name set successfully', { userId, displayName });
    return { success: true, displayName: data.displayName };
  } catch (error) {
    logger.error('Failed to set display name', { userId, error });
    return { success: false, error: 'Failed to set display name. Please try again.' };
  }
}

/**
 * Validate display name (format + uniqueness + moderation)
 * @param {string} displayName - Display name to validate
 * @param {number} userId - User ID (to exclude from uniqueness check)
 * @returns {Promise<Object>} Validation result with valid/error
 */
export async function validateDisplayName(displayName, userId) {
  try {
    // Client-side format validation first (fast)
    const formatValidation = validateDisplayNameFormat(displayName);
    if (!formatValidation.valid) {
      return formatValidation;
    }

    // Server-side validation (uniqueness + moderation)
    const response = await fetch(getDisplayNameEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'validate',
        displayName,
        userId
      })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Failed to validate display name', { displayName, error });
    return { valid: false, error: 'Validation failed. Please try again.' };
  }
}

/**
 * Client-side format validation (fast, no API call)
 * @param {string} displayName - Display name to validate
 * @returns {Object} Validation result with valid/error
 */
export function validateDisplayNameFormat(displayName) {
  if (!displayName || displayName.length < DISPLAY_NAME_MIN_LENGTH) {
    return { valid: false, error: DISPLAY_NAME_ERROR_MESSAGES.TOO_SHORT };
  }

  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    return { valid: false, error: DISPLAY_NAME_ERROR_MESSAGES.TOO_LONG };
  }

  if (!DISPLAY_NAME_PATTERN.test(displayName)) {
    return { valid: false, error: DISPLAY_NAME_ERROR_MESSAGES.INVALID_CHARS };
  }

  return { valid: true };
}

/**
 * Check if user can change display name (cooldown check)
 * @param {string} lastChanged - ISO timestamp of last change
 * @returns {boolean} True if user can change display name
 */
export function canChangeDisplayName(lastChanged) {
  if (!lastChanged) {
    return true;
  }

  const lastChangedDate = new Date(lastChanged);
  const cooldownMs = DISPLAY_NAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const nextChangeDate = new Date(lastChangedDate.getTime() + cooldownMs);

  return Date.now() >= nextChangeDate.getTime();
}

/**
 * Calculate next allowed change date
 * @param {string} lastChanged - ISO timestamp of last change
 * @returns {Date|null} Next allowed change date or null if can change now
 */
export function getNextChangeDate(lastChanged) {
  if (!lastChanged) {
    return null;
  }

  const lastChangedDate = new Date(lastChanged);
  const cooldownMs = DISPLAY_NAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return new Date(lastChangedDate.getTime() + cooldownMs);
}

/**
 * Get days until next change allowed
 * @param {string} lastChanged - ISO timestamp of last change
 * @returns {number} Days until next change allowed
 */
export function getDaysUntilNextChange(lastChanged) {
  if (!lastChanged) {
    return 0;
  }

  const nextChangeDate = getNextChangeDate(lastChanged);
  const daysRemaining = Math.ceil((nextChangeDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysRemaining);
}

/**
 * Admin: Reset user's display name
 * @param {number} userId - User ID to reset
 * @param {string} adminToken - Admin's OAuth token
 * @returns {Promise<Object>} Result object with success/error
 */
export async function resetDisplayName(userId, adminToken) {
  try {
    logger.info('Resetting display name (admin action)', { userId });

    const response = await fetch(`${getDisplayNameEndpoint()}?userId=${userId}&adminToken=${encodeURIComponent(adminToken)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Failed to reset display name', { userId, error: data.error });
      return { success: false, error: data.error };
    }

    // Clear caches
    clearCacheValue(cacheName('display_name', userId));
    clearCacheValue(cacheName('display_name_registry', 'all'));

    logger.info('Display name reset successfully', { userId });
    return { success: true };
  } catch (error) {
    logger.error('Failed to reset display name', { userId, error });
    return { success: false, error: 'Failed to reset display name. Please try again.' };
  }
}

/**
 * Admin: Ban a display name for a user
 * @param {number} userId - User ID
 * @param {string} displayName - Display name to ban
 * @param {string} adminToken - Admin's OAuth token
 * @returns {Promise<Object>} Result object with success/error
 */
export async function banDisplayName(userId, displayName, adminToken) {
  try {
    logger.info('Banning display name (admin action)', { userId, displayName });

    const response = await fetch(getDisplayNameEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'ban',
        userId,
        displayName,
        adminToken
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Failed to ban display name', { userId, displayName, error: data.error });
      return { success: false, error: data.error };
    }

    // Clear caches
    clearCacheValue(cacheName('display_name', userId));
    clearCacheValue(cacheName('display_name_registry', 'all'));

    logger.info('Display name banned successfully', { userId, displayName });
    return { success: true };
  } catch (error) {
    logger.error('Failed to ban display name', { userId, displayName, error });
    return { success: false, error: 'Failed to ban display name. Please try again.' };
  }
}
