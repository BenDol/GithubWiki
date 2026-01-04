import { createLogger } from './logger';

const logger = createLogger('NetworkDebugConfig');

/**
 * Network Debug Configuration Helper
 *
 * Provides utilities for checking if network debug mode is enabled
 * and managing cache-busting for accurate cold load testing.
 */

/**
 * Check if network debug mode is enabled
 * @returns {boolean} True if enabled in wiki-config.json
 */
export const isNetworkDebugEnabled = () => {
  if (typeof window === 'undefined') return false;

  const config = window.__WIKI_CONFIG__?.features?.network?.debugMode;

  // Must be in development mode AND explicitly enabled
  const isDev = import.meta.env.DEV;
  const isEnabled = config?.enabled === true;

  return isDev && isEnabled;
};

/**
 * Get network debug configuration
 * @returns {Object} Configuration object or default values
 */
export const getNetworkDebugConfig = () => {
  if (typeof window === 'undefined') {
    return getDefaultConfig();
  }

  const config = window.__WIKI_CONFIG__?.features?.network?.debugMode;

  if (!config || !config.enabled) {
    return getDefaultConfig();
  }

  return {
    enabled: config.enabled ?? false,
    autoReloadDelay: config.autoReloadDelay ?? 5000,
    cacheBusting: config.cacheBusting ?? true,
    maxCallsPerRoute: config.maxCallsPerRoute ?? 1000,
    persistToGitHub: config.persistToGitHub ?? true
  };
};

/**
 * Get default configuration
 * @returns {Object} Default config values
 */
const getDefaultConfig = () => {
  return {
    enabled: false,
    autoReloadDelay: 5000,
    cacheBusting: true,
    maxCallsPerRoute: 1000,
    persistToGitHub: true
  };
};

/**
 * Apply cache-busting query parameter to URL
 * @param {string} url - Original URL
 * @returns {string} URL with cache-busting parameter
 */
export const applyCacheBusting = (url) => {
  const config = getNetworkDebugConfig();

  if (!config.enabled || !config.cacheBusting) {
    return url;
  }

  try {
    const urlObj = new URL(url, window.location.origin);
    urlObj.searchParams.set('_debug_nocache', Date.now().toString());
    return urlObj.toString();
  } catch (error) {
    logger.warn('Failed to apply cache busting to URL', { url, error });
    // Return original URL if parsing fails
    return url;
  }
};

/**
 * Clear browser caches (Cache API only - cannot clear HTTP cache)
 * Note: This only clears caches we control via Cache API
 * HTTP cache requires user to enable "Disable cache" in DevTools
 * @returns {Promise<void>}
 */
export const clearBrowserCaches = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) {
    logger.warn('Cache API not available');
    return;
  }

  try {
    const cacheNames = await caches.keys();

    logger.info('Clearing browser caches', { cacheNames });

    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );

    logger.info('Browser caches cleared successfully');
  } catch (error) {
    logger.error('Failed to clear browser caches', { error });
  }
};

/**
 * Clear localStorage caches
 * Clears dynamic page cache and other localStorage entries
 * @returns {void}
 */
export const clearLocalStorageCaches = () => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }

  try {
    // Get all keys that start with cache-related prefixes
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes(':cache:') || key.includes(':dynamic-pages:'))) {
        keysToRemove.push(key);
      }
    }

    logger.info('Clearing localStorage caches', { keys: keysToRemove.length });

    keysToRemove.forEach(key => localStorage.removeItem(key));

    logger.info('localStorage caches cleared successfully');
  } catch (error) {
    logger.error('Failed to clear localStorage caches', { error });
  }
};

/**
 * Get cache-control headers for fetch requests
 * @returns {Object} Headers object with cache-control directives
 */
export const getCacheBustingHeaders = () => {
  const config = getNetworkDebugConfig();

  if (!config.enabled || !config.cacheBusting) {
    return {};
  }

  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
};

/**
 * Check if user has disabled cache in DevTools
 * Note: There's no direct way to detect this, so we check for indicators
 * @returns {boolean} Best guess if cache is disabled
 */
export const isCacheDisabledInDevTools = () => {
  // We can't directly detect if "Disable cache" is enabled in DevTools
  // This is a limitation of browser APIs
  // We can only check if DevTools is open

  if (typeof window === 'undefined') return false;

  // Rough heuristic: if window.outerWidth - window.innerWidth > threshold, DevTools might be open
  const widthThreshold = 160;
  const heightThreshold = 160;

  const isDevToolsOpen =
    (window.outerWidth - window.innerWidth > widthThreshold) ||
    (window.outerHeight - window.innerHeight > heightThreshold);

  return isDevToolsOpen;
};

/**
 * Log cache control recommendations to console
 * @returns {void}
 */
export const logCacheControlRecommendations = () => {
  if (!isNetworkDebugEnabled()) return;

  const devToolsOpen = isCacheDisabledInDevTools();

  if (devToolsOpen) {
    logger.info('Network Debug Mode Active', {
      message: 'For accurate cold load testing, please enable "Disable cache" in DevTools Network tab'
    });
  } else {
    logger.warn('DevTools may not be open', {
      message: 'Open DevTools (F12) and enable "Disable cache" in Network tab for accurate testing'
    });
  }
};

export default {
  isNetworkDebugEnabled,
  getNetworkDebugConfig,
  applyCacheBusting,
  clearBrowserCaches,
  clearLocalStorageCaches,
  getCacheBustingHeaders,
  isCacheDisabledInDevTools,
  logCacheControlRecommendations
};
