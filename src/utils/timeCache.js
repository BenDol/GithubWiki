/**
 * Time-based Cache Utility
 *
 * Simple cache with expiration using localStorage
 * Used to reduce API calls for data that doesn't change frequently
 */

/**
 * Set a value in cache with expiration
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttlMs - Time to live in milliseconds
 */
export function setCacheValue(key, value, ttlMs) {
  try {
    const cacheData = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('[TimeCache] Failed to set cache:', error);
  }
}

/**
 * Get a value from cache if not expired
 * @param {string} key - Cache key
 * @returns {any|null} Cached value or null if expired/not found
 */
export function getCacheValue(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const cacheData = JSON.parse(cached);

    // Check if expired
    if (Date.now() > cacheData.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    return cacheData.value;
  } catch (error) {
    console.warn('[TimeCache] Failed to get cache:', error);
    return null;
  }
}

/**
 * Clear a specific cache entry
 * @param {string} key - Cache key
 */
export function clearCacheValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('[TimeCache] Failed to clear cache:', error);
  }
}

/**
 * Clear all cache entries matching a prefix
 * @param {string} prefix - Key prefix to match
 */
export function clearCacheByPrefix(prefix) {
  try {
    const keys = Object.keys(localStorage);
    const matchingKeys = keys.filter(key => key.startsWith(prefix));

    matchingKeys.forEach(key => {
      localStorage.removeItem(key);
    });

    console.log(`[TimeCache] Cleared ${matchingKeys.length} cache entries with prefix: ${prefix}`);
  } catch (error) {
    console.warn('[TimeCache] Failed to clear cache by prefix:', error);
  }
}

/**
 * Clean up expired cache entries
 * @param {string} prefix - Optional key prefix to limit cleanup
 */
export function cleanupExpiredCache(prefix = '') {
  try {
    const keys = Object.keys(localStorage);
    const matchingKeys = prefix ? keys.filter(key => key.startsWith(prefix)) : keys;
    let removedCount = 0;

    matchingKeys.forEach(key => {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) return;

        const cacheData = JSON.parse(cached);

        // Check if this looks like a cache entry with expiration
        if (cacheData && typeof cacheData.expiresAt === 'number') {
          if (Date.now() > cacheData.expiresAt) {
            localStorage.removeItem(key);
            removedCount++;
          }
        }
      } catch (e) {
        // Not a valid cache entry, skip
      }
    });

    if (removedCount > 0) {
      console.log(`[TimeCache] Cleaned up ${removedCount} expired cache entries`);
    }
  } catch (error) {
    console.warn('[TimeCache] Failed to cleanup expired cache:', error);
  }
}
