/**
 * Central LocalStorage Manager
 *
 * Provides standardized localStorage operations with consistent naming conventions:
 * - Temporary caches: `cache[:<user_id>]:<cache_name>`
 * - Important caches: `[<user_id>]:<cache_name>`
 * - Configurations: `config[:<user_id>]:<cache_name>`
 *
 * Rules:
 * - cache_name should only use underscores (_)
 * - User-specific caches include user_id
 * - Anonymous users use user_id = "anonymous"
 *
 * @example
 * // Using convenience methods (recommended)
 * import { cacheName, persistName, configName, getItem, setItem } from './storageManager';
 *
 * const key = cacheName('my_cache');           // 'cache:my_cache'
 * const userKey = cacheName('draft', 'user1'); // 'cache:user1:draft'
 * const configKey = configName('theme');       // 'config:theme'
 *
 * setItem(key, { data: 'value' });
 * const data = getItem(key);
 *
 * @example
 * // Using StorageKeys object (also valid)
 * import { StorageKeys, getItem, setItem } from './storageManager';
 *
 * const key = StorageKeys.cache('my_cache');
 * setItem(key, { data: 'value' });
 */

/**
 * Storage key builders
 */
export const StorageKeys = {
  /**
   * Build a temporary cache key
   * @param {string} cacheName - Cache name (use underscores)
   * @param {string|null} userId - User ID (optional, null for all users)
   * @returns {string} Storage key
   */
  cache: (cacheName, userId = null) => {
    return userId ? `cache:${userId}:${cacheName}` : `cache:${cacheName}`;
  },

  /**
   * Build an important cache key (persists across updates)
   * @param {string} cacheName - Cache name (use underscores)
   * @param {string|null} userId - User ID (optional, null for all users)
   * @returns {string} Storage key
   */
  persist: (cacheName, userId = null) => {
    return userId ? `${userId}:${cacheName}` : cacheName;
  },

  /**
   * Build a configuration key
   * @param {string} configName - Config name (use underscores)
   * @param {string|null} userId - User ID (optional, null for all users)
   * @returns {string} Storage key
   */
  config: (configName, userId = null) => {
    return userId ? `config:${userId}:${configName}` : `config:${configName}`;
  },
};

/**
 * Get item from localStorage with JSON parsing
 * @param {string} key - Storage key
 * @returns {any|null} Parsed value or null
 */
export const getItem = (key) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  } catch (error) {
    console.error(`[StorageManager] Failed to get item "${key}":`, error);
    return null;
  }
};

/**
 * Set item in localStorage with JSON stringification
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 */
export const setItem = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`[StorageManager] Failed to set item "${key}":`, error);
  }
};

/**
 * Remove item from localStorage
 * @param {string} key - Storage key
 */
export const removeItem = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`[StorageManager] Failed to remove item "${key}":`, error);
  }
};

/**
 * Get all keys matching a pattern
 * @param {string} pattern - Pattern to match (supports wildcards with *)
 * @returns {string[]} Array of matching keys
 */
export const getKeys = (pattern) => {
  try {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/:/g, '\\:') + '$'
    );

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && regex.test(key)) {
        keys.push(key);
      }
    }

    return keys;
  } catch (error) {
    console.error('[StorageManager] Failed to get keys:', error);
    return [];
  }
};

/**
 * Clear all keys matching a pattern
 * @param {string} pattern - Pattern to match (supports wildcards with *)
 * @returns {number} Number of keys cleared
 */
export const clearPattern = (pattern) => {
  try {
    const keys = getKeys(pattern);
    keys.forEach(key => localStorage.removeItem(key));
    console.log(`[StorageManager] Cleared ${keys.length} keys matching "${pattern}"`);
    return keys.length;
  } catch (error) {
    console.error('[StorageManager] Failed to clear pattern:', error);
    return 0;
  }
};

/**
 * Clear all temporary caches
 * @returns {number} Number of keys cleared
 */
export const clearAllCaches = () => {
  return clearPattern('cache:*');
};

/**
 * Clear all temporary caches except drafts
 * @returns {number} Number of keys cleared
 */
export const clearAllCachesExceptDrafts = () => {
  try {
    const allCacheKeys = getKeys('cache:*');
    const nonDraftKeys = allCacheKeys.filter(key => !key.includes(':draft:'));
    nonDraftKeys.forEach(key => localStorage.removeItem(key));
    console.log(`[StorageManager] Cleared ${nonDraftKeys.length} cache keys (preserved ${allCacheKeys.length - nonDraftKeys.length} drafts)`);
    return nonDraftKeys.length;
  } catch (error) {
    console.error('[StorageManager] Failed to clear caches:', error);
    return 0;
  }
};

/**
 * Clear temporary caches for a specific user
 * @param {string} userId - User ID
 * @returns {number} Number of keys cleared
 */
export const clearUserCaches = (userId) => {
  return clearPattern(`cache:${userId}:*`);
};

/**
 * Check if cache entry is still valid
 * @param {Object} cacheData - Cache data with timestamp
 * @param {number} ttl - Time to live in milliseconds
 * @returns {boolean} True if valid
 */
export const isCacheValid = (cacheData, ttl) => {
  if (!cacheData || !cacheData.timestamp) return false;
  return Date.now() - cacheData.timestamp < ttl;
};

/**
 * Create cached data object with timestamp
 * @param {any} data - Data to cache
 * @returns {Object} Cache object with data and timestamp
 */
export const createCacheData = (data) => {
  return {
    data,
    timestamp: Date.now(),
  };
};

/**
 * Get cached data if valid, otherwise return null
 * @param {string} key - Storage key
 * @param {number} ttl - Time to live in milliseconds
 * @returns {any|null} Cached data or null if expired/missing
 */
export const getCached = (key, ttl) => {
  const cacheData = getItem(key);
  if (!cacheData) return null;

  if (isCacheValid(cacheData, ttl)) {
    return cacheData.data;
  }

  // Cache expired, remove it
  removeItem(key);
  return null;
};

/**
 * Set cached data with timestamp
 * @param {string} key - Storage key
 * @param {any} data - Data to cache
 */
export const setCached = (key, data) => {
  setItem(key, createCacheData(data));
};

/**
 * Get all localStorage keys
 * @returns {string[]} Array of all keys
 */
export const getAllKeys = () => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  } catch (error) {
    console.error('[StorageManager] Failed to get all keys:', error);
    return [];
  }
};

/**
 * Get storage statistics
 * @returns {Object} Storage stats
 */
export const getStorageStats = () => {
  const allKeys = getAllKeys();
  const cacheKeys = allKeys.filter(k => k.startsWith('cache:'));
  const configKeys = allKeys.filter(k => k.startsWith('config:'));
  const otherKeys = allKeys.filter(k => !k.startsWith('cache:') && !k.startsWith('config:'));

  return {
    total: allKeys.length,
    cache: cacheKeys.length,
    config: configKeys.length,
    other: otherKeys.length,
    keys: {
      cache: cacheKeys,
      config: configKeys,
      other: otherKeys,
    },
  };
};

/**
 * Convenience methods for building storage keys
 */

/**
 * Build a cache key (temporary storage)
 * @param {string} name - Cache name (use underscores)
 * @param {string|null} userId - User ID (optional)
 * @returns {string} Storage key
 */
export const cacheName = (name, userId = null) => {
  return StorageKeys.cache(name, userId);
};

/**
 * Build a persist key (important storage that persists across updates)
 * @param {string} name - Storage name (use underscores)
 * @param {string|null} userId - User ID (optional)
 * @returns {string} Storage key
 */
export const persistName = (name, userId = null) => {
  return StorageKeys.persist(name, userId);
};

/**
 * Build a config key (configuration storage)
 * @param {string} name - Config name (use underscores)
 * @param {string|null} userId - User ID (optional)
 * @returns {string} Storage key
 */
export const configName = (name, userId = null) => {
  return StorageKeys.config(name, userId);
};

export default {
  StorageKeys,
  getItem,
  setItem,
  removeItem,
  getKeys,
  clearPattern,
  clearAllCaches,
  clearAllCachesExceptDrafts,
  clearUserCaches,
  isCacheValid,
  createCacheData,
  getCached,
  setCached,
  getAllKeys,
  getStorageStats,
  cacheName,
  persistName,
  configName,
};
